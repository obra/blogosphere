// ABOUTME: deleteEntry, discardChanges, and shareSecretLink actions — the
// ABOUTME: destructive/undo/sharing family. renameEntry: state.renameActions.ts.
import type { EntryRecord } from "../../core/store/types";
import { discardConflictIfAny } from "../../core/sync/meta";
import {
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

async function discardChangesInner(ctx: ActionCtx, record: EntryRecord): Promise<void> {
  const svc = ctx.get().services;
  if (record.baseContent === null) {
    ctx.get().addToast({
      tone: "info",
      message: "This entry has never been synced — there's no earlier version to go back to.",
    });
    return;
  }
  if (!record.dirty) {
    return;
  }
  const noun = record.draft ? "GitHub" : "the published version";
  if (
    !ctx.deps.confirm(
      `Discard unsynced changes to "${record.title ?? record.path}"? This restores ${noun}.`,
    )
  ) {
    return;
  }
  const restored: EntryRecord = {
    ...record,
    ...withParsedFields(svc, record.path, record.baseContent, record),
    workingContent: record.baseContent,
    dirty: false,
    updatedAt: ctx.deps.now(),
  };
  await svc.store.upsertEntry(restored);
  replaceEntryInCache(ctx.set, restored);
  ctx.get().addToast({ tone: "info", message: "Changes discarded." });
}

async function discardChanges(ctx: ActionCtx, path: string): Promise<void> {
  // Cancel (never flush) any still-debounced keystrokes: flushing would
  // durably commit the very edits the user is asking to throw away.
  ctx.cancel(path);
  const record = findEntryInCache(ctx.get, path) ?? (await ctx.get().services.store.getEntry(path));
  if (!record) {
    return;
  }
  try {
    await discardChangesInner(ctx, record);
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't discard the changes.",
      retry: () => discardChanges(ctx, path),
    });
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
      message:
        "Secret link copied — but you're offline. Sync when you're back online to make it live.",
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

export { deleteEntry, discardChanges, shareSecretLink };
