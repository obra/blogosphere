// ABOUTME: Core pull logic — diffs the remote tree against the last-seen
// ABOUTME: snapshot, fast-forwards clean entries, and diff3-merges or conflicts dirty ones.
import { ASSETS_ROOT, CONTENT_ROOTS } from "../model/types";
import type { EntryRecord } from "../store/types";
import { denormalize, fallbackFrom } from "./entry-fields";
import { merge3 } from "./merge";
import {
  bumpStaleHeadStreak,
  clearConflictRemote,
  getConflictPaths,
  loadRecentHeads,
  META_ASSETS_INDEX,
  META_LAST_REMOTE_COMMIT_SHA,
  META_LAST_ROOT_TREE_SHA,
  META_LAST_SYNC_AT,
  recordRemoteHead,
  setConflictPaths,
  stashConflictRemote,
} from "./meta";
import { diffManagedTrees, imageIndexFor, type ManagedPathChange } from "./tree-diff";
import type { PullResult, SyncDeps } from "./types";

interface ReconcileBuckets {
  updated: string[];
  merged: string[];
  conflicted: string[];
  conflictPaths: Set<string>;
}

interface Modification {
  path: string;
  entry: EntryRecord;
  remoteText: string;
  remoteSha: string;
}

function freshEntryRecord(deps: SyncDeps, path: string, sha: string, text: string): EntryRecord {
  const fields = denormalize(deps.model, path, text);
  return {
    path,
    kind: fields.kind,
    baseSha: sha,
    baseContent: text,
    workingContent: text,
    dirty: false,
    deleted: false,
    renamedFrom: null,
    title: fields.title,
    date: fields.date,
    draft: fields.draft,
    opaqueId: fields.opaqueId,
    updatedAt: deps.now(),
  };
}

async function fastForwardClean(
  deps: SyncDeps,
  entry: EntryRecord,
  newSha: string,
  buckets: ReconcileBuckets,
): Promise<void> {
  const text = await deps.github.getBlobText(newSha);
  const fields = denormalize(deps.model, entry.path, text, fallbackFrom(entry));
  await deps.store.upsertEntry({
    ...entry,
    baseSha: newSha,
    baseContent: text,
    workingContent: text,
    title: fields.title,
    date: fields.date,
    draft: fields.draft,
    opaqueId: fields.opaqueId,
    updatedAt: deps.now(),
  });
  buckets.updated.push(entry.path);
}

async function mergeAgainstRemote(
  deps: SyncDeps,
  mod: Modification,
  buckets: ReconcileBuckets,
): Promise<void> {
  const { path, entry, remoteText, remoteSha } = mod;

  if (remoteText === entry.baseContent) {
    // Same content under a new sha (e.g. an equivalent recommit) — only the
    // pointer moved, nothing to merge.
    await deps.store.upsertEntry({ ...entry, baseSha: remoteSha });
    return;
  }

  const base = entry.baseContent ?? "";
  const result = merge3(base, entry.workingContent, remoteText);

  if (!result.ok) {
    // baseContent/baseSha deliberately stay put (see ConflictRemote's doc
    // comment in meta.ts) — stash the actual conflicting remote text so the
    // UI has something better than the stale base to show as "theirs".
    await stashConflictRemote(deps.store, path, { sha: remoteSha, text: remoteText });
    buckets.conflictPaths.add(path);
    buckets.conflicted.push(path);
    return;
  }

  await deps.store.saveSnapshot(path, entry.workingContent, "pre-merge");
  const fields = denormalize(deps.model, path, result.merged, fallbackFrom(entry));
  await deps.store.upsertEntry({
    ...entry,
    baseSha: remoteSha,
    baseContent: remoteText,
    workingContent: result.merged,
    dirty: result.merged !== remoteText,
    title: fields.title,
    date: fields.date,
    draft: fields.draft,
    opaqueId: fields.opaqueId,
    updatedAt: deps.now(),
  });
  buckets.conflictPaths.delete(path);
  await clearConflictRemote(deps.store, path);
  buckets.merged.push(path);
}

async function reconcileRemoteDeletion(
  deps: SyncDeps,
  path: string,
  buckets: ReconcileBuckets,
): Promise<void> {
  const entry = await deps.store.getEntry(path);
  if (!entry) {
    return;
  }

  if (entry.deleted) {
    // Both sides already agree it's gone; nothing left to reconcile or push.
    await deps.store.removeEntry(path);
    buckets.conflictPaths.delete(path);
    await clearConflictRemote(deps.store, path);
    return;
  }

  if (entry.dirty) {
    // The remote side of this conflict is a deletion — no blob, no text.
    await stashConflictRemote(deps.store, path, { sha: null, text: "" });
    buckets.conflictPaths.add(path);
    buckets.conflicted.push(path);
    return;
  }

  await deps.store.removeEntry(path);
  buckets.updated.push(path);
}

async function reconcilePath(
  deps: SyncDeps,
  change: ManagedPathChange,
  buckets: ReconcileBuckets,
): Promise<void> {
  const { path, oldSha, newSha } = change;

  if (newSha === null) {
    await reconcileRemoteDeletion(deps, path, buckets);
    return;
  }

  const entry = await deps.store.getEntry(path);

  if (!entry) {
    const text = await deps.github.getBlobText(newSha);
    await deps.store.upsertEntry(freshEntryRecord(deps, path, newSha, text));
    buckets.updated.push(path);
    return;
  }

  if (oldSha !== null && !entry.dirty) {
    await fastForwardClean(deps, entry, newSha, buckets);
    return;
  }

  if (!entry.dirty) {
    // "Added remotely" but a local (never-synced) row already exists at the
    // same path — a same-path creation race. Reconcile via merge3 against an
    // effectively-empty shared history rather than silently picking a side.
    const remoteText = await deps.github.getBlobText(newSha);
    await mergeAgainstRemote(deps, { path, entry, remoteText, remoteSha: newSha }, buckets);
    return;
  }

  // Entry is dirty. A local delete-intent can't be reconciled against a
  // remote text edit by diff3 — that's a conflict of intent, not of content.
  if (entry.deleted) {
    const remoteText = await deps.github.getBlobText(newSha);
    await stashConflictRemote(deps.store, path, { sha: newSha, text: remoteText });
    buckets.conflictPaths.add(path);
    buckets.conflicted.push(path);
    return;
  }

  if (newSha === entry.baseSha) {
    // Remote is already at what our edit is based on; nothing changed for us,
    // and any earlier conflict flag (e.g. remote reverted) no longer applies.
    buckets.conflictPaths.delete(path);
    await clearConflictRemote(deps.store, path);
    return;
  }

  const remoteText = await deps.github.getBlobText(newSha);
  await mergeAgainstRemote(deps, { path, entry, remoteText, remoteSha: newSha }, buckets);
}

/** How many consecutive pulls must serve the same already-integrated head
 *  before it's believed as a genuine history rewind (force-push) instead of
 *  read-replica lag. */
const STALE_HEAD_ACCEPT_AFTER = 3;

/** True when GitHub served a head this client already integrated PAST —
 *  proceeding would diff backwards and read our own freshly pushed files as
 *  "deleted remotely", destroying clean local rows for a few seconds until
 *  a fresh read restores them. */
async function isStaleHead(deps: SyncDeps, headSha: string): Promise<boolean> {
  const recent = await loadRecentHeads(deps.store);
  if (!recent.includes(headSha) || recent.at(-1) === headSha) {
    return false;
  }
  const streak = await bumpStaleHeadStreak(deps.store, headSha);
  return streak < STALE_HEAD_ACCEPT_AFTER;
}

export async function runPull(deps: SyncDeps): Promise<PullResult> {
  const headSha = await deps.github.getRef();
  if (await isStaleHead(deps, headSha)) {
    return { updated: [], merged: [], conflicts: [], staleHead: headSha };
  }
  const commit = await deps.github.getCommit(headSha);
  const lastRootTreeSha = await deps.store.getMeta(META_LAST_ROOT_TREE_SHA);

  if (lastRootTreeSha !== null && commit.treeSha === lastRootTreeSha) {
    await recordRemoteHead(deps.store, headSha);
    return { updated: [], merged: [], conflicts: [] };
  }

  const oldEntries =
    lastRootTreeSha === null ? [] : await deps.github.getTreeRecursive(lastRootTreeSha);
  const newEntries = await deps.github.getTreeRecursive(commit.treeSha);

  const diffs = diffManagedTrees(oldEntries, newEntries, deps.model.isManagedPath);
  const buckets: ReconcileBuckets = {
    updated: [],
    merged: [],
    conflicted: [],
    conflictPaths: new Set(await getConflictPaths(deps.store)),
  };

  // Each `change` touches a distinct path (diffManagedTrees emits at most one
  // entry per path), so reconciling them concurrently is safe.
  await Promise.all(diffs.map((change) => reconcilePath(deps, change, buckets)));

  await setConflictPaths(deps.store, [...buckets.conflictPaths]);
  await deps.store.setMeta(META_LAST_ROOT_TREE_SHA, commit.treeSha);
  await deps.store.setMeta(META_LAST_REMOTE_COMMIT_SHA, headSha);
  await deps.store.setMeta(META_LAST_SYNC_AT, String(deps.now()));
  await recordRemoteHead(deps.store, headSha);
  await deps.store.setMeta(
    META_ASSETS_INDEX,
    JSON.stringify(imageIndexFor(newEntries, ASSETS_ROOT, Object.values(CONTENT_ROOTS))),
  );

  return { updated: buckets.updated, merged: buckets.merged, conflicts: buckets.conflicted };
}
