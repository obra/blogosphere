// ABOUTME: Local entries-cache helpers shared across action slices: lookup,
// ABOUTME: upsert-in-place, tombstone-and-remove, rename plumbing, and the
// ABOUTME: fire-and-forget background sync trigger.
import type { Services } from "../../core/services";
import type { EntryRecord } from "../../core/store/types";
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
 *  back to the previous values on the rare case the edit made it unparsable. */
function withParsedFields(
  svc: Services,
  path: string,
  raw: string,
  fallback: DenormalizedFields,
): DenormalizedFields {
  const parsed = svc.model.parseEntry(path, raw);
  if (!parsed.ok) {
    return fallback;
  }
  return {
    title: parsed.entry.title,
    date: parsed.entry.date,
    draft: parsed.entry.draft,
    opaqueId: parsed.entry.opaqueId,
  };
}

/** Not awaited by callers on purpose — the sync-status subscription is the
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
  await svc.store.transaction(async () => {
    await svc.store.upsertEntry(tombstone);
    await svc.store.upsertEntry(updated);
  });
  ctx.set((state) => ({
    entries: [...state.entries.filter((entry) => entry.path !== record.path), updated],
    selectedPath: state.selectedPath === record.path ? updated.path : state.selectedPath,
  }));
}

/** Shared rename plumbing for publishDraft + renameEntry: upsert the new path
 *  (with renamedFrom when the path actually changed) and tombstone the old
 *  one in the same store transaction. */
async function applyRename(
  ctx: ActionCtx,
  record: EntryRecord,
  newPath: string,
  newRaw: string,
): Promise<void> {
  const svc = ctx.get().services;
  const updated = buildRenamedRecord(ctx, record, newPath, newRaw);
  if (newPath === record.path) {
    await svc.store.upsertEntry(updated);
    replaceEntryInCache(ctx.set, updated);
  } else {
    await persistRenamedPair(ctx, record, updated);
  }
  maybeBackgroundSync(ctx.get);
}

export {
  applyRename,
  findEntryInCache,
  maybeBackgroundSync,
  removeEntryFromCache,
  replaceEntryInCache,
  withParsedFields,
};
