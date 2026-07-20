// ABOUTME: Local entries-cache helpers shared across action slices: lookup,
// ABOUTME: upsert-in-place, tombstone-and-remove, rename plumbing, and the
// ABOUTME: fire-and-forget background sync trigger.
import type { Services } from "../../core/services";
import type { EntryRecord } from "../../core/store/types";
import { denormalize } from "../../core/sync/entry-fields";
import { discardConflictIfAny } from "../../core/sync/meta";
import { persistSelectedPath } from "./state.lastPositionActions";
import type { ActionCtx, GetState, SetState } from "./state.types";

type DenormalizedFields = Pick<EntryRecord, "title" | "date" | "draft" | "opaqueId">;

function findEntryInCache(get: GetState, path: string): EntryRecord | undefined {
  return get().entries.find((entry) => entry.path === path);
}

function replaceEntryInCache(set: SetState, record: EntryRecord): void {
  set((state) => {
    const index = state.entries.findIndex((entry) => entry.path === record.path);
    if (index === -1) {
      return { entries: [...state.entries, record] };
    }
    return { entries: state.entries.map((entry, i) => (i === index ? record : entry)) };
  });
}

function removeEntryFromCache(set: SetState, path: string): void {
  set((state) => ({
    entries: state.entries.filter((entry) => entry.path !== path),
    selectedPath: state.selectedPath === path ? null : state.selectedPath,
  }));
}

/** Recompute denormalized display fields from freshly-edited raw text; falls
 *  back to the previous values on the rare case the edit made it unparsable.
 *  A thin adapter over core/sync/entry-fields.ts's denormalize() — the
 *  single implementation of this fallback policy, shared with the sync
 *  engine's own remote-driven writes (pull.ts, engine.ts), so this app-store
 *  path and that one can no longer silently disagree on what "parse failed"
 *  should do (see entry-fields.test.ts). */
function withParsedFields(
  svc: Services,
  path: string,
  raw: string,
  fallback: DenormalizedFields,
): DenormalizedFields {
  // denormalize()'s fallback shape includes `kind`, which this wrapper's
  // callers never look at (its own return type omits it, exactly as
  // before) — kindForPath(path) is a safe placeholder either way.
  const kind = svc.model.kindForPath(path) ?? "post";
  const { title, date, draft, opaqueId } = denormalize(svc.model, path, raw, { kind, ...fallback });
  return { title, date, draft, opaqueId };
}

/** Fire-and-forget sync for actions whose *meaning* is remote — publish,
 *  rename, delete, creating a public post/link. Never called from the typing
 *  path: every push to main triggers a Pages deploy, so syncing on keystroke
 *  pauses would burn Actions minutes and ship half-finished edits of
 *  published posts (edits accumulate locally until ⌘S/the sync button).
 *  Not awaited by callers on purpose — the sync-status subscription is the
 *  channel that surfaces the outcome, not the call site. */
function maybeBackgroundSync(get: GetState): void {
  const { services, syncStatus } = get();
  if (!services.sync || syncStatus?.state === "offline") {
    return;
  }
  services.sync.sync().catch(() => undefined);
}

function buildRenamedRecord(
  ctx: ActionCtx,
  record: EntryRecord,
  newPath: string,
  newRaw: string,
): EntryRecord {
  const svc = ctx.get().services;
  const samePath = newPath === record.path;
  return {
    path: newPath,
    kind: svc.model.kindForPath(newPath) ?? record.kind,
    baseSha: samePath ? record.baseSha : null,
    baseContent: samePath ? record.baseContent : null,
    workingContent: newRaw,
    dirty: true,
    deleted: false,
    renamedFrom: samePath ? record.renamedFrom : record.path,
    ...withParsedFields(svc, newPath, newRaw, record),
    updatedAt: ctx.deps.now(),
  };
}

async function persistRenamedPair(
  ctx: ActionCtx,
  record: EntryRecord,
  updated: EntryRecord,
): Promise<void> {
  const svc = ctx.get().services;
  const tombstone: EntryRecord = {
    ...record,
    deleted: true,
    dirty: true,
    updatedAt: ctx.deps.now(),
  };
  // One statement, not store.transaction(): cross-call BEGIN/COMMIT is not
  // sound over tauri-plugin-sql's connection pool — this exact call site
  // died with "database is locked" on Windows (see StoreApi.upsertEntryPair).
  await svc.store.upsertEntryPair(tombstone, updated);
  // The old path is being tombstoned out from under whatever conflict state
  // it might have had — if it was flagged conflicted, that flag must be
  // cleared here too, or it can never be cleared again (push()'s
  // conflict-exclusion filter has no way to know a path that no longer
  // exists doesn't need resolving).
  await discardConflictIfAny(svc.store, record.path);
  const followingSelection = ctx.get().selectedPath === record.path;
  ctx.set((state) => ({
    entries: [...state.entries.filter((entry) => entry.path !== record.path), updated],
    selectedPath: state.selectedPath === record.path ? updated.path : state.selectedPath,
  }));
  if (followingSelection) {
    // The selection just moved paths without going through select() — the
    // "pick up where you left off" meta must follow, or the next launch's
    // restore finds only the tombstoned old path and drops the user's place.
    persistSelectedPath(ctx, updated.path);
  }
}

/** True when `newPath` already belongs to a different, still-live entry —
 *  i.e. renaming/publishing onto it would silently clobber that entry's
 *  content (locally immediately, and on the next push). A tombstoned row is
 *  not a collision: it's already on its way out. */
async function pathTakenByAnotherEntry(
  svc: Services,
  record: EntryRecord,
  newPath: string,
): Promise<boolean> {
  if (newPath === record.path) {
    return false;
  }
  const collision = await svc.store.getEntry(newPath);
  return collision !== null && !collision.deleted;
}

/** Shared rename plumbing for publishDraft + renameEntry: upsert the new path
 *  (with renamedFrom when the path actually changed) and tombstone the old
 *  one in the same store transaction. Returns false (and leaves everything
 *  untouched but for a toast) when newPath is already occupied by a
 *  different entry, rather than silently overwriting it. */
async function applyRename(
  ctx: ActionCtx,
  record: EntryRecord,
  newPath: string,
  newRaw: string,
): Promise<boolean> {
  const svc = ctx.get().services;
  if (await pathTakenByAnotherEntry(svc, record, newPath)) {
    ctx.get().addToast({
      tone: "error",
      message: `Can't use that date and title — ${newPath} is already taken by another entry.`,
    });
    return false;
  }
  const updated = buildRenamedRecord(ctx, record, newPath, newRaw);
  if (newPath === record.path) {
    await svc.store.upsertEntry(updated);
    replaceEntryInCache(ctx.set, updated);
  } else {
    await persistRenamedPair(ctx, record, updated);
  }
  maybeBackgroundSync(ctx.get);
  return true;
}

export {
  applyRename,
  findEntryInCache,
  maybeBackgroundSync,
  removeEntryFromCache,
  replaceEntryInCache,
  withParsedFields,
};
