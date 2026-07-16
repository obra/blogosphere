// ABOUTME: createSync(deps): SyncApi — the sync engine's state machine. Owns
// ABOUTME: status tracking/bootstrap and thin status-cycle wrappers over pull/push/resolve.
import { GitHubError, type TreeEntry } from "../github/types";
import { ASSETS_ROOT, CONTENT_ROOTS } from "../model/types";
import type { EntryRecord } from "../store/types";
import { denormalize, fallbackFrom, fetchCurrentRemote } from "./entry-fields";
import { SyncError } from "./errors";
import type { LogFn } from "./logging";
import { createLogChannel, describeResolution, logPullResult, logPushResult } from "./logging";
import {
  clearConflictRemote,
  getConflictPaths,
  META_ASSETS_INDEX,
  META_LAST_REMOTE_COMMIT_SHA,
  META_LAST_ROOT_TREE_SHA,
  META_LAST_SYNC_AT,
  recordRemoteHead,
  setConflictPaths,
} from "./meta";
import { createOpQueue } from "./opQueue";
import { runPull } from "./pull";
import { runPush, toPushResult } from "./push";
import { imageIndexFor } from "./tree-diff";
import type {
  ConflictResolution,
  PullResult,
  PushResult,
  SyncApi,
  SyncDeps,
  SyncState,
  SyncStatus,
} from "./types";

function messageForError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface StatusCache {
  pendingCount: number;
  conflicts: string[];
  lastSyncAt: number | null;
}

async function refreshStatusCache(deps: SyncDeps): Promise<StatusCache> {
  const dirty = await deps.store.listDirty();
  const conflicts = await getConflictPaths(deps.store);
  const raw = await deps.store.getMeta(META_LAST_SYNC_AT);
  return { pendingCount: dirty.length, conflicts, lastSyncAt: raw === null ? null : Number(raw) };
}

/** Mutable status cache + pub/sub. Refreshed from the store at the end of every op. */
function createStatusTracker(deps: SyncDeps) {
  const listeners = new Set<(status: SyncStatus) => void>();
  let cache: StatusCache = { pendingCount: 0, conflicts: [], lastSyncAt: null };
  let currentStatus: SyncStatus = { state: "idle", ...cache };

  function emit(): void {
    for (const listener of listeners) {
      listener(currentStatus);
    }
  }

  function setStatus(state: SyncState, message?: string): void {
    const base: SyncStatus = { state, ...cache };
    currentStatus = message === undefined ? base : { ...base, message };
    emit();
  }

  async function settle(state: "idle" | "error" | "offline", message?: string): Promise<void> {
    cache = await refreshStatusCache(deps);
    setStatus(state === "idle" && cache.conflicts.length > 0 ? "conflict" : state, message);
  }

  return {
    get: () => currentStatus,
    subscribe: (cb: (status: SyncStatus) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    begin: () => setStatus("syncing"),
    finishOk: () => settle("idle"),
    finishError: (message: string) => settle("error", message),
    finishOffline: (message: string) => settle("offline", message),
  };
}

type StatusTracker = ReturnType<typeof createStatusTracker>;

async function bootstrapOneEntry(deps: SyncDeps, entry: TreeEntry): Promise<void> {
  const text = await deps.github.getBlobText(entry.sha);
  const fields = denormalize(deps.model, entry.path, text);
  await deps.store.upsertEntry({
    path: entry.path,
    kind: fields.kind,
    baseSha: entry.sha,
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
  });
}

async function runBootstrap(deps: SyncDeps): Promise<number> {
  const headSha = await deps.github.getRef();
  const commit = await deps.github.getCommit(headSha);
  const entries = await deps.github.getTreeRecursive(commit.treeSha);
  const managed = entries.filter(
    (entry) => entry.type === "blob" && deps.model.isManagedPath(entry.path),
  );

  await Promise.all(managed.map((entry) => bootstrapOneEntry(deps, entry)));

  await setConflictPaths(deps.store, []);
  await deps.store.setMeta(META_LAST_ROOT_TREE_SHA, commit.treeSha);
  await deps.store.setMeta(META_LAST_REMOTE_COMMIT_SHA, headSha);
  await deps.store.setMeta(META_LAST_SYNC_AT, String(deps.now()));
  await deps.store.setMeta(
    META_ASSETS_INDEX,
    JSON.stringify(imageIndexFor(entries, ASSETS_ROOT, Object.values(CONTENT_ROOTS))),
  );
  await recordRemoteHead(deps.store, headSha);
  return managed.length;
}

async function resolveViaMine(deps: SyncDeps, path: string, entry: EntryRecord): Promise<void> {
  const remote = await fetchCurrentRemote(deps.github, path);
  const baseSha = remote === null ? null : remote.sha;
  const baseContent = remote === null ? null : remote.text;
  await deps.store.upsertEntry({
    ...entry,
    baseSha,
    baseContent,
    dirty: true,
    updatedAt: deps.now(),
  });
}

async function runResolveConflict(
  deps: SyncDeps,
  path: string,
  resolution: ConflictResolution,
): Promise<void> {
  const entry = await deps.store.getEntry(path);
  if (!entry) {
    throw new SyncError(`No entry at ${path} to resolve`);
  }

  if (resolution.choose === "mine") {
    await resolveViaMine(deps, path, entry);
  } else if (resolution.choose === "theirs") {
    const remote = await fetchCurrentRemote(deps.github, path);
    if (remote === null) {
      // Remote has nothing at this path anymore; accepting "theirs" means
      // accepting the deletion.
      await deps.store.removeEntry(path);
    } else {
      const fields = denormalize(deps.model, path, remote.text, fallbackFrom(entry));
      await deps.store.upsertEntry({
        ...entry,
        baseSha: remote.sha,
        baseContent: remote.text,
        workingContent: remote.text,
        dirty: false,
        deleted: false,
        title: fields.title,
        date: fields.date,
        draft: fields.draft,
        opaqueId: fields.opaqueId,
        updatedAt: deps.now(),
      });
    }
  } else {
    const fields = denormalize(deps.model, path, resolution.content, fallbackFrom(entry));
    await deps.store.upsertEntry({
      ...entry,
      workingContent: resolution.content,
      dirty: true,
      deleted: false,
      title: fields.title,
      date: fields.date,
      draft: fields.draft,
      opaqueId: fields.opaqueId,
      updatedAt: deps.now(),
    });
  }

  const conflicts = await getConflictPaths(deps.store);
  await setConflictPaths(
    deps.store,
    conflicts.filter((conflictPath) => conflictPath !== path),
  );
  await clearConflictRemote(deps.store, path);
}

async function runWithStatus<T>(status: StatusTracker, fn: () => Promise<T>): Promise<T> {
  status.begin();
  try {
    const result = await fn();
    await status.finishOk();
    return result;
  } catch (err) {
    await status.finishError(messageForError(err));
    throw err;
  }
}

async function pushWithStatus(
  deps: SyncDeps,
  status: StatusTracker,
  log: LogFn,
): Promise<PushResult> {
  status.begin();
  try {
    const outcome = await runPush(deps);
    const result = toPushResult(outcome);
    logPushResult(log, result, outcome.errorMessage);
    if (outcome.errorMessage === undefined) {
      await status.finishOk();
    } else {
      await status.finishError(outcome.errorMessage);
    }
    return result;
  } catch (err) {
    log("error", `Push failed: ${messageForError(err)}`);
    await status.finishError(messageForError(err));
    throw err;
  }
}

async function syncWithStatus(
  deps: SyncDeps,
  status: StatusTracker,
  log: LogFn,
): Promise<{ pull: PullResult | null; push: PushResult | null }> {
  status.begin();
  try {
    const pullResult = await runPull(deps);
    logPullResult(log, pullResult);
    const pushOutcome = await runPush(deps);
    const pushResult = toPushResult(pushOutcome);
    logPushResult(log, pushResult, pushOutcome.errorMessage);
    if (pushOutcome.errorMessage === undefined) {
      await status.finishOk();
    } else {
      await status.finishError(pushOutcome.errorMessage);
    }
    return { pull: pullResult, push: pushResult };
  } catch (err) {
    if (err instanceof GitHubError && err.kind === "network") {
      log("warn", "Offline — couldn't reach GitHub. Changes stay saved on this device.");
      await status.finishOffline(err.message);
      return { pull: null, push: null };
    }
    log("error", `Sync failed: ${messageForError(err)}`);
    await status.finishError(messageForError(err));
    throw err;
  }
}

export function createSync(deps: SyncDeps): SyncApi {
  const status = createStatusTracker(deps);
  const logs = createLogChannel(deps);
  const enqueue = createOpQueue();

  async function loggedPull(): Promise<PullResult> {
    const result = await runWithStatus(status, () => runPull(deps));
    logPullResult(logs.log, result);
    return result;
  }

  async function loggedResolve(path: string, resolution: ConflictResolution): Promise<void> {
    await runWithStatus(status, () => runResolveConflict(deps, path, resolution));
    logs.log("info", `Resolved conflict in ${path} — ${describeResolution(resolution)}`);
  }

  async function loggedBootstrap(): Promise<void> {
    const count = await runWithStatus(status, () => runBootstrap(deps));
    logs.log("info", `Loaded ${count} entr${count === 1 ? "y" : "ies"} from GitHub`);
  }

  return {
    status: status.get,
    onStatus: status.subscribe,
    onLog: logs.subscribe,
    pull: () => enqueue(loggedPull),
    push: () => enqueue(() => pushWithStatus(deps, status, logs.log)),
    sync: () => enqueue(() => syncWithStatus(deps, status, logs.log)),
    resolveConflict: (path, resolution) => enqueue(() => loggedResolve(path, resolution)),
    bootstrap: () => enqueue(loggedBootstrap),
  };
}
