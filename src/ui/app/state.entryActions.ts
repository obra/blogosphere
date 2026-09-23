// ABOUTME: Selection and editing actions: select/section, and
// ABOUTME: the debounced autosave pipeline (edit/flushEdit/saveNow).
import type { EditResult, FieldEdit } from "../../core/model/types";
import type { Services } from "../../core/services";
import type { EntryRecord } from "../../core/store/types";
import type { EditorMode, Section } from "../types";
import { findEntryInCache, replaceEntryInCache, withParsedFields } from "./state.cache";
import { clearFailedDeploy } from "./state.deployActions";
import { persistSection, persistSelectedPath } from "./state.lastPositionActions";
import type { ActionCtx, EditChange } from "./state.types";
import { editorModeMetaKey } from "./state.types";

/** One path's accumulated-but-not-fully-flushed edit: a body replace and/or
 *  a set of field edits (last edit per field wins), merged from however many
 *  edit() calls land inside the debounce window. Never last-*kind*-wins
 *  across the whole path — a title edit followed by a body edit (or a title
 *  edit followed by a tags edit) accumulates both instead of the later call
 *  discarding the earlier one. */
interface PendingEntry {
  body: string | null;
  fieldEdits: Map<string, FieldEdit>;
}

interface PendingSlot extends PendingEntry {
  timer: ReturnType<typeof setTimeout>;
  /** When the last mid-burst commit for this slot was kicked off. The
   *  debounce timer resets on every keystroke, so an unbroken typing burst
   *  would otherwise never commit — this clock caps how long keystrokes can
   *  sit only in process memory (see edit()). */
  burstCommittedAt: number;
  /** Set whenever a change lands after the last commit attempt (immediate
   *  or debounced); lets the debounce-fire callback skip a fully redundant
   *  re-commit — and, on failure, a redundant duplicate error toast — once
   *  a single-edit burst has already been handled by the immediate commit
   *  `edit()` fires below. */
  uncommitted: boolean;
}

type PendingEdits = Map<string, PendingSlot>;

function createPendingEdits(): PendingEdits {
  return new Map();
}

function hydrateEditorMode(ctx: ActionCtx, path: string): void {
  ctx
    .get()
    .services.store.getMeta(editorModeMetaKey(path))
    .then((value) => {
      const mode: EditorMode = value === "source" ? "source" : "wysiwyg";
      ctx.set((state) => ({ editorModes: { ...state.editorModes, [path]: mode } }));
    })
    .catch(() => undefined);
}

function select(ctx: ActionCtx, path: string | null): void {
  // The Publish sheet is for the selected entry: moving the selection dismisses it.
  const { publishDialogOpen, selectedPath } = ctx.get();
  ctx.set({ selectedPath: path, publishDialogOpen: publishDialogOpen && selectedPath === path });
  if (path && !(path in ctx.get().editorModes)) {
    hydrateEditorMode(ctx, path);
  }
  persistSelectedPath(ctx, path);
}

function setSection(ctx: ActionCtx, section: Section): void {
  ctx.set({ section, selectedPath: null });
  persistSection(ctx, section);
  persistSelectedPath(ctx, null);
}

function mergeChangeInto(entry: PendingEntry, change: EditChange): void {
  if (change.kind === "body") {
    entry.body = change.body;
  } else {
    for (const fieldEdit of change.edits) {
      entry.fieldEdits.set(fieldEdit.field, fieldEdit);
    }
  }
}

/** Applies the accumulated field edits, then the accumulated body replace
 *  (order between the two doesn't matter: one touches only front matter,
 *  the other only the body) — a single merged commit instead of whichever
 *  one a naive "last change wins" scheme would keep. */
function applyPendingToRaw(svc: Services, workingContent: string, entry: PendingEntry): EditResult {
  const fieldEdits = [...entry.fieldEdits.values()];
  const afterFields: EditResult =
    fieldEdits.length > 0
      ? svc.model.applyEdits(workingContent, fieldEdits)
      : { ok: true, raw: workingContent };
  if (!afterFields.ok || entry.body === null) {
    return afterFields;
  }
  return svc.model.replaceBody(afterFields.raw, entry.body);
}

function reportEditFailure(
  ctx: ActionCtx,
  record: EntryRecord,
  entry: PendingEntry,
  error: string,
): void {
  ctx.get().addToast({
    tone: "error",
    message: `Couldn't save "${record.title ?? record.path}": ${error}`,
    retry: () => commitPending(ctx, record.path, entry),
  });
}

async function commitPendingInner(
  ctx: ActionCtx,
  path: string,
  entry: PendingEntry,
): Promise<void> {
  const svc = ctx.get().services;
  const record = findEntryInCache(ctx.get, path) ?? (await svc.store.getEntry(path));
  if (!record) {
    return;
  }
  const editResult = applyPendingToRaw(svc, record.workingContent, entry);
  if (!editResult.ok) {
    reportEditFailure(ctx, record, entry, editResult.error);
    return;
  }
  const updated: EntryRecord = {
    ...record,
    ...withParsedFields(svc, path, editResult.raw, record),
    workingContent: editResult.raw,
    dirty: true,
    updatedAt: ctx.deps.now(),
  };
  await svc.store.upsertEntry(updated);
  replaceEntryInCache(ctx.set, updated);
}

/** Commits to the local store only — never the network. Pushing is a
 *  deliberate act (saveNow/syncNow, publish, share, …): every push to main
 *  triggers a Pages deploy, so a push riding along with typing would both
 *  burn Actions minutes and ship half-finished edits of published posts. */
async function commitPending(ctx: ActionCtx, path: string, entry: PendingEntry): Promise<void> {
  try {
    await commitPendingInner(ctx, path, entry);
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't save your changes.",
      retry: () => commitPending(ctx, path, entry),
    });
  }
}

function onDebounceFire(ctx: ActionCtx, pending: PendingEdits, path: string): void {
  const slot = pending.get(path);
  pending.delete(path);
  if (!slot) {
    return;
  }
  // A single-edit burst (uncommitted still false) was already captured and
  // persisted by the immediate commit in edit() — nothing left to write.
  if (slot.uncommitted) {
    commitPending(ctx, path, slot);
  }
}

function scheduleDebouncedCommit(
  ctx: ActionCtx,
  pending: PendingEdits,
  path: string,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => onDebounceFire(ctx, pending, path), ctx.deps.editDebounceMs);
}

/**
 * Buffers `change` for `path`, committing it to the store no later than
 * `editDebounceMs` after the last call for that path (see saveNow/flushEdit
 * to force it sooner). The *first* edit() call in a fresh burst (no pending
 * entry yet) also commits immediately, fire-and-forget, on top of the
 * debounce rather than instead of it: without some immediate signal, a
 * pull() racing in mid-burst finds a row whose *content* hasn't actually
 * diverged from its last-synced base yet — even a bare `dirty: true` flag
 * with stale content wouldn't help, since pull()'s diff3 merge only
 * recognizes an overlap once "mine" has genuinely moved — so it would
 * fast-forward or cleanly merge straight over an edit in flight, silently
 * discarding a concurrent overlapping remote change with no conflict ever
 * raised (see pull.ts's fastForwardClean, gated solely on `!entry.dirty`,
 * and mergeAgainstRemote's diff3 call, which needs real divergence to
 * detect anything). Every further keystroke in the same burst still only
 * accumulates in the pending map and resets the timer — this fires once per
 * burst, not once per keystroke.
 */
function edit(ctx: ActionCtx, pending: PendingEdits, path: string, change: EditChange): void {
  const existing = pending.get(path);
  if (existing) {
    clearTimeout(existing.timer);
    mergeChangeInto(existing, change);
    existing.uncommitted = true;
    existing.timer = scheduleDebouncedCommit(ctx, pending, path);
    // Continuous typing resets the timer forever, so also commit on a
    // bounded clock — otherwise a crash/force-quit/OS kill mid-burst loses
    // the entire burst, not just the trailing debounce window. uncommitted
    // stays true on purpose: the trailing debounce re-commit is an
    // idempotent upsert, and skipping it would drop data if this commit
    // fails (its error path only offers a retry toast).
    if (ctx.deps.now() - existing.burstCommittedAt >= ctx.deps.editMaxUncommittedMs) {
      existing.burstCommittedAt = ctx.deps.now();
      commitPending(ctx, path, existing);
    }
    return;
  }

  const slot: PendingSlot = {
    body: null,
    fieldEdits: new Map(),
    uncommitted: false,
    burstCommittedAt: ctx.deps.now(),
    timer: scheduleDebouncedCommit(ctx, pending, path),
  };
  mergeChangeInto(slot, change);
  pending.set(path, slot);
  commitPending(ctx, path, slot);
}

/** Drops a path's pending debounced edit without committing it — the
 *  counterpart to flushOne for flows (discardChanges) that are throwing the
 *  buffered keystrokes away on purpose. */
function cancelEdit(pending: PendingEdits, path: string): void {
  const slot = pending.get(path);
  if (!slot) {
    return;
  }
  clearTimeout(slot.timer);
  pending.delete(path);
}

async function flushOne(ctx: ActionCtx, pending: PendingEdits, path: string): Promise<void> {
  const slot = pending.get(path);
  if (!slot) {
    return;
  }
  clearTimeout(slot.timer);
  pending.delete(path);
  await commitPending(ctx, path, slot);
}

async function flushEdit(ctx: ActionCtx, pending: PendingEdits, path?: string): Promise<void> {
  if (path !== undefined) {
    await flushOne(ctx, pending, path);
    return;
  }
  await Promise.all([...pending.keys()].map((p) => flushOne(ctx, pending, p)));
}

const SYNC_FAILED = { tone: "error", message: "Couldn't sync.", source: "sync" } as const;

async function saveNow(ctx: ActionCtx, pending: PendingEdits): Promise<void> {
  await flushEdit(ctx, pending);
  const svc = ctx.get().services;
  if (!svc.sync) {
    ctx.get().addToast({ tone: "info", message: "Saved." });
    return;
  }
  if (ctx.get().syncStatus?.state === "offline") {
    ctx.get().addToast({
      tone: "info",
      message: "Saved on this device. You're offline — sync again once you're back.",
    });
    return;
  }
  try {
    await svc.sync.sync();
    clearFailedDeploy(ctx);
  } catch {
    ctx.get().addToast({ ...SYNC_FAILED, retry: () => saveNow(ctx, pending) });
  }
}

export type { PendingEdits };
export { cancelEdit, createPendingEdits, edit, flushEdit, saveNow, select, setSection };
