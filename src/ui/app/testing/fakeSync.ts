// ABOUTME: In-memory SyncApi fake with test-only hooks (setStatus, call
// ABOUTME: counts, recorded conflict resolutions) beyond the real contract.
import type {
  ConflictResolution,
  PullResult,
  PushResult,
  SyncApi,
  SyncStatus,
} from "../../../core/sync/types";

const DEFAULT_STATUS: SyncStatus = {
  state: "idle",
  pendingCount: 0,
  conflicts: [],
  lastSyncAt: null,
};
const DEFAULT_PULL: PullResult = { updated: [], merged: [], conflicts: [] };
const DEFAULT_PUSH: PushResult = { committed: false, retries: 0, conflicts: [] };

interface ResolvedConflict {
  path: string;
  resolution: ConflictResolution;
}

interface FakeSyncState {
  status: SyncStatus;
  listeners: Set<(status: SyncStatus) => void>;
  pullResult: PullResult;
  pushResult: PushResult;
  syncCalls: number;
  pullCalls: number;
  bootstrapCalls: number;
  resolved: ResolvedConflict[];
}

interface FakeSyncOptions {
  status?: SyncStatus;
  pullResult?: PullResult;
  pushResult?: PushResult;
}

interface FakeSync extends SyncApi {
  /** Test-only: push a new status to all subscribers (simulate engine progress). */
  setStatus(status: SyncStatus): void;
  /** Test-only: how many times sync() has been invoked. */
  syncCallCount(): number;
  /** Test-only: how many times pull() has been invoked. */
  pullCallCount(): number;
  /** Test-only: how many times bootstrap() has been invoked. */
  bootstrapCallCount(): number;
  /** Test-only: every resolveConflict() call so far, in order. */
  resolvedConflicts(): ResolvedConflict[];
}

function notify(state: FakeSyncState): void {
  for (const listener of state.listeners) {
    listener(state.status);
  }
}

function setStatus(state: FakeSyncState, status: SyncStatus): void {
  state.status = status;
  notify(state);
}

function onStatus(state: FakeSyncState, cb: (status: SyncStatus) => void): () => void {
  state.listeners.add(cb);
  return () => {
    state.listeners.delete(cb);
  };
}

function sync(state: FakeSyncState): Promise<{ pull: PullResult | null; push: PushResult | null }> {
  state.syncCalls += 1;
  if (state.status.state === "offline") {
    return Promise.resolve({ pull: null, push: null });
  }
  return Promise.resolve({ pull: state.pullResult, push: state.pushResult });
}

function resolveConflict(
  state: FakeSyncState,
  path: string,
  resolution: ConflictResolution,
): Promise<void> {
  state.resolved.push({ path, resolution });
  state.status = { ...state.status, conflicts: state.status.conflicts.filter((p) => p !== path) };
  notify(state);
  return Promise.resolve();
}

function createState(options: FakeSyncOptions): FakeSyncState {
  return {
    status: options.status ?? DEFAULT_STATUS,
    listeners: new Set(),
    pullResult: options.pullResult ?? DEFAULT_PULL,
    pushResult: options.pushResult ?? DEFAULT_PUSH,
    syncCalls: 0,
    pullCalls: 0,
    bootstrapCalls: 0,
    resolved: [],
  };
}

/** A fresh in-memory SyncApi. Seed `status`/`pullResult`/`pushResult` to drive scenarios. */
function createFakeSync(options: FakeSyncOptions = {}): FakeSync {
  const state = createState(options);
  return {
    status: () => state.status,
    onStatus: (cb) => onStatus(state, cb),
    pull: () => {
      state.pullCalls += 1;
      return Promise.resolve(state.pullResult);
    },
    push: () => Promise.resolve(state.pushResult),
    sync: () => sync(state),
    resolveConflict: (path, resolution) => resolveConflict(state, path, resolution),
    bootstrap: () => {
      state.bootstrapCalls += 1;
      return Promise.resolve();
    },
    setStatus: (status) => setStatus(state, status),
    syncCallCount: () => state.syncCalls,
    pullCallCount: () => state.pullCalls,
    bootstrapCallCount: () => state.bootstrapCalls,
    resolvedConflicts: () => state.resolved,
  };
}

export type { FakeSync, FakeSyncOptions };
export { createFakeSync };
