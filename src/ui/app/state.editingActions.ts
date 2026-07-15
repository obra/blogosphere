// ABOUTME: deleteEntry, renameEntry, and shareSecretLink actions — the
// ABOUTME: "change how an existing entry is addressed" family.
import type { FieldEdit } from "../../core/model/types";
import type { EntryRecord } from "../../core/store/types";
import { discardConflictIfAny } from "../../core/sync/meta";
import { todayIso } from "./format";
import {
  applyRename,
  findEntryInCache,
  maybeBackgroundSync,
  removeEntryFromCache,
  replaceEntryInCache,
  withParsedFields,
} from "./state.cache";
import type { ActionCtx } from "./state.types";
import { SITE_ORIGIN } from "./state.types";

async function deleteEntryInner(ctx: ActionCtx, record: EntryRecord): Promise<void> {
  const svc = ctx.get().services;
  const tombstone: EntryRecord = {
    ...record,
    deleted: true,
    dirty: true,
    updatedAt: ctx.deps.now(),
  };
  await svc.store.upsertEntry(tombstone);
  // If this path was flagged as an unresolved conflict, deleting it (rather
  // than going through resolveConflict) must still clear that bookkeeping —
  // otherwise push()'s conflict-exclusion filter blocks the tombstone from
  // ever pushing, permanently, since nothing else will clear a conflict for
  // a path that no longer exists.
  await discardConflictIfAny(svc.store, record.path);
  removeEntryFromCache(ctx.set, record.path);
  maybeBackgroundSync(ctx.get);
}

async function deleteEntry(ctx: ActionCtx, path: string): Promise<void> {
  // Force any still-debounced keystroke into the store first, so the
  // confirm dialog's title and the tombstoned content both reflect what the
  // user actually last typed, not a stale pre-edit snapshot.
  await ctx.flush(path);
  const svc = ctx.get().services;
  const record = findEntryInCache(ctx.get, path) ?? (await svc.store.getEntry(path));
  if (!(record && ctx.deps.confirm(`Delete "${record.title ?? path}"? This can't be undone.`))) {
    return;
  }
  ctx.set((state) => ({ busy: { ...state.busy, deleting: true } }));
  try {
    await deleteEntryInner(ctx, record);
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't delete this entry.",
      retry: () => deleteEntry(ctx, path),
    });
  } finally {
    ctx.set((state) => ({ busy: { ...state.busy, deleting: false } }));
  }
}

async function ensureOpaqueId(ctx: ActionCtx, record: EntryRecord): Promise<EntryRecord | null> {
  if (record.opaqueId) {
    return record;
  }
  const svc = ctx.get().services;
  const opaqueId = ctx.deps.createId();
  const editResult = svc.model.applyEdits(record.workingContent, [
    { field: "opaqueId", value: opaqueId },
  ]);
  if (!editResult.ok) {
    ctx
      .get()
      .addToast({ tone: "error", message: `Couldn't create a secret link: ${editResult.error}` });
    return null;
  }
  const updated: EntryRecord = {
    ...record,
    ...withParsedFields(svc, record.path, editResult.raw, record),
    workingContent: editResult.raw,
    dirty: true,
    updatedAt: ctx.deps.now(),
  };
  await svc.store.upsertEntry(updated);
  replaceEntryInCache(ctx.set, updated);
  return updated;
}

/** Writes the clipboard immediately (that part is local and instant), but —
 *  unlike a bare fire-and-forget maybeBackgroundSync — waits for the actual
 *  push before promising success. Sharing a link is a promise that the URL
 *  is reachable; toasting "copied" while the entry might not even be live
 *  yet (offline, or the push simply hasn't landed) sets the user up to hand
 *  someone a 404 with no warning anything was wrong. */
async function copySecretLink(ctx: ActionCtx, record: EntryRecord): Promise<void> {
  const svc = ctx.get().services;
  const parsed = svc.model.parseEntry(record.path, record.workingContent);
  const permalink = parsed.ok ? svc.model.permalinkFor(parsed.entry) : null;
  if (!permalink) {
    ctx.get().addToast({ tone: "error", message: "Couldn't build a secret link for this entry." });
    return;
  }
  await ctx.deps.writeClipboardText(`${SITE_ORIGIN}${permalink}`);

  if (!svc.sync || ctx.get().syncStatus?.state === "offline") {
    ctx.get().addToast({
      tone: "info",
      message: "Secret link copied. Will go live once you're back online.",
    });
    return;
  }
  try {
    await svc.sync.sync();
    ctx.get().addToast({ tone: "success", message: "Secret link copied." });
  } catch {
    ctx.get().addToast({
      tone: "error",
      message:
        "Copied the link, but couldn't publish it yet — the recipient will see a 404 until the next successful sync.",
      retry: () => copySecretLink(ctx, record),
    });
  }
}

async function shareSecretLinkInner(ctx: ActionCtx, path: string): Promise<void> {
  // Force any still-debounced keystroke into the store first — the shared
  // link is only useful once the content it points at is actually current.
  await ctx.flush(path);
  const svc = ctx.get().services;
  const record = findEntryInCache(ctx.get, path) ?? (await svc.store.getEntry(path));
  if (!record) {
    ctx.get().addToast({ tone: "error", message: "That entry isn't around anymore." });
    return;
  }
  const withId = await ensureOpaqueId(ctx, record);
  if (withId) {
    await copySecretLink(ctx, withId);
  }
}

async function shareSecretLink(ctx: ActionCtx, path: string): Promise<void> {
  ctx.set((state) => ({ busy: { ...state.busy, sharingLink: true } }));
  try {
    await shareSecretLinkInner(ctx, path);
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't copy the secret link.",
      retry: () => shareSecretLink(ctx, path),
    });
  } finally {
    ctx.set((state) => ({ busy: { ...state.busy, sharingLink: false } }));
  }
}

type RenameComputation =
  | { kind: "target"; newPath: string; newDate: string }
  | { kind: "noop" }
  | { kind: "error"; message: string };

function computeRenameTarget(
  ctx: ActionCtx,
  record: EntryRecord,
  changes: { slug?: string; date?: string },
): RenameComputation {
  const svc = ctx.get().services;
  const parsed = svc.model.parseEntry(record.path, record.workingContent);
  if (!parsed.ok) {
    return { kind: "error", message: `Couldn't rename: ${parsed.error}` };
  }
  const parts = svc.model.pathParts(record.path);
  const newSlug = changes.slug ?? parts?.slug;
  if (!newSlug) {
    return { kind: "error", message: "This entry needs a title before it can be renamed." };
  }
  const newDate = changes.date ?? parsed.entry.date ?? todayIso(ctx.deps.now());
  const newPath = svc.model.pathFor(record.kind, newDate, newSlug);
  if (newPath === record.path) {
    return { kind: "noop" };
  }
  return { kind: "target", newPath, newDate };
}

function confirmUrlChangeIfNeeded(ctx: ActionCtx, record: EntryRecord): boolean {
  if (record.baseSha === null) {
    return true;
  }
  const svc = ctx.get().services;
  const parsed = svc.model.parseEntry(record.path, record.workingContent);
  const oldLink = parsed.ok ? (svc.model.permalinkFor(parsed.entry) ?? record.path) : record.path;
  return ctx.deps.confirm(
    `Renaming changes this entry's web address (currently ${oldLink}). Continue?`,
  );
}

function buildDateEdits(changes: { date?: string }, newDate: string): FieldEdit[] {
  return changes.date ? [{ field: "date", value: newDate }] : [];
}

async function renameEntryInner(
  ctx: ActionCtx,
  record: EntryRecord,
  changes: { slug?: string; date?: string },
): Promise<void> {
  const computation = computeRenameTarget(ctx, record, changes);
  if (computation.kind === "noop") {
    return;
  }
  if (computation.kind === "error") {
    ctx.get().addToast({ tone: "error", message: computation.message });
    return;
  }
  if (!confirmUrlChangeIfNeeded(ctx, record)) {
    return;
  }
  const svc = ctx.get().services;
  const dateEdits = buildDateEdits(changes, computation.newDate);
  const editResult =
    dateEdits.length > 0
      ? svc.model.applyEdits(record.workingContent, dateEdits)
      : ({ ok: true, raw: record.workingContent } as const);
  if (!editResult.ok) {
    ctx.get().addToast({ tone: "error", message: `Couldn't rename: ${editResult.error}` });
    return;
  }
  await applyRename(ctx, record, computation.newPath, editResult.raw);
}

async function renameEntry(
  ctx: ActionCtx,
  path: string,
  changes: { slug?: string; date?: string },
): Promise<void> {
  // Force any still-debounced keystroke into the store first — the Date
  // field's onChange calls this directly, with no relation to whatever
  // title/body edit might still be sitting in the debounce timer, so
  // without this the rename could carry forward a stale pre-edit snapshot.
  await ctx.flush(path);
  const record = findEntryInCache(ctx.get, path) ?? (await ctx.get().services.store.getEntry(path));
  if (!record) {
    return;
  }
  ctx.set((state) => ({ busy: { ...state.busy, renaming: true } }));
  try {
    await renameEntryInner(ctx, record, changes);
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't rename this entry.",
      retry: () => renameEntry(ctx, path, changes),
    });
  } finally {
    ctx.set((state) => ({ busy: { ...state.busy, renaming: false } }));
  }
}

export { deleteEntry, renameEntry, shareSecretLink };
