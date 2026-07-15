// ABOUTME: Entry-list + editing actions: refresh/select/section/search, and
// ABOUTME: the debounced autosave pipeline (edit/flushEdit/saveNow).
import type { EditResult, FieldEdit } from "../../core/model/types";
import type { Services } from "../../core/services";
import type { EntryRecord } from "../../core/store/types";
import type { EditorMode, Section } from "../types";
import { debounce } from "./format";
import {
  findEntryInCache,
  maybeBackgroundSync,
  replaceEntryInCache,
  withParsedFields,
} from "./state.cache";
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
  /** Set whenever a change lands after the last commit attempt (immediate
   *  or debounced); lets the debounce-fire callback skip a fully redundant
   *  re-commit — and, on failure, a redundant duplicate error toast — once
   *  a single-edit burst has already been handled by the immediate commit
   *  `edit()` fires below. */
  uncommitted: boolean;
}

type PendingEdits = Map<string, PendingSlot>;

interface SearchDebouncer {
  call: (query: string) => void;
}

function createPendingEdits(): PendingEdits {
  return new Map();
}

function createSearchDebouncer(ctx: ActionCtx): SearchDebouncer {
  return debounce<[string]>((query) => {
    runSearch(ctx, query);
  }, ctx.deps.searchDebounceMs);
}

async function refresh(ctx: ActionCtx): Promise<void> {
  ctx.set((state) => ({ busy: { ...state.busy, refreshing: true } }));
  try {
    const entries = await ctx.get().services.store.listEntries();
    ctx.set({ entries });
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't load your entries.",
      retry: () => refresh(ctx),
    });
  } finally {
    ctx.set((state) => ({ busy: { ...state.busy, refreshing: false } }));
  }
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
  ctx.set({ selectedPath: path });
  if (path && !(path in ctx.get().editorModes)) {
    hydrateEditorMode(ctx, path);
  }
}

function setSection(ctx: ActionCtx, section: Section): void {
  ctx.set({ section, selectedPath: null });
}

async function runSearch(ctx: ActionCtx, query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) {
    ctx.set({ searchResults: null });
    return;
  }
  try {
    const results = await ctx.get().services.store.searchEntries(trimmed);
    ctx.set({ searchResults: results });
  } catch {
    ctx
      .get()
      .addToast({ tone: "error", message: "Search failed.", retry: () => runSearch(ctx, query) });
  }
}

function setSearchQuery(ctx: ActionCtx, searchDebouncer: SearchDebouncer, query: string): void {
  ctx.set({ searchQuery: query });
  searchDebouncer.call(query);
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
    retry: () => commitPending(ctx, record.path, entry, true),
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

async function commitPending(
  ctx: ActionCtx,
  path: string,
  entry: PendingEntry,
  notifySync: boolean,
): Promise<void> {
  try {
    await commitPendingInner(ctx, path, entry);
    if (notifySync) {
      maybeBackgroundSync(ctx.get);
    }
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't save your changes.",
      retry: () => commitPending(ctx, path, entry, notifySync),
    });
  }
}

function onDebounceFire(ctx: ActionCtx, pending: PendingEdits, path: string): void {
  const slot = pending.get(path);
  pending.delete(path);
  if (!slot) {
    return;
  }
  if (slot.uncommitted) {
    commitPending(ctx, path, slot, true);
  } else {
    // A single-edit burst: the immediate commit in edit() already captured
    // and persisted it. Nothing new to write, but the network sync this
    // debounce exists to gate still needs to fire.
    maybeBackgroundSync(ctx.get);
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
    return;
  }

  const slot: PendingSlot = {
    body: null,
    fieldEdits: new Map(),
    uncommitted: false,
    timer: scheduleDebouncedCommit(ctx, pending, path),
  };
  mergeChangeInto(slot, change);
  pending.set(path, slot);
  commitPending(ctx, path, slot, false);
}

async function flushOne(ctx: ActionCtx, pending: PendingEdits, path: string): Promise<void> {
  const slot = pending.get(path);
  if (!slot) {
    return;
  }
  clearTimeout(slot.timer);
  pending.delete(path);
  await commitPending(ctx, path, slot, true);
}

async function flushEdit(ctx: ActionCtx, pending: PendingEdits, path?: string): Promise<void> {
  if (path !== undefined) {
    await flushOne(ctx, pending, path);
    return;
  }
  await Promise.all([...pending.keys()].map((p) => flushOne(ctx, pending, p)));
}

async function saveNow(ctx: ActionCtx, pending: PendingEdits): Promise<void> {
  await flushEdit(ctx, pending);
  const svc = ctx.get().services;
  if (!svc.sync) {
    ctx.get().addToast({ tone: "info", message: "Saved." });
    return;
  }
  if (ctx.get().syncStatus?.state === "offline") {
    ctx.get().addToast({ tone: "info", message: "Saved. Will sync when you're back online." });
    return;
  }
  try {
    await svc.sync.sync();
  } catch {
    ctx
      .get()
      .addToast({ tone: "error", message: "Couldn't sync.", retry: () => saveNow(ctx, pending) });
  }
}

export type { PendingEdits, SearchDebouncer };
export {
  createPendingEdits,
  createSearchDebouncer,
  edit,
  flushEdit,
  refresh,
  saveNow,
  select,
  setSearchQuery,
  setSection,
};
