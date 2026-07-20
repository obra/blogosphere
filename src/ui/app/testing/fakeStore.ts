// ABOUTME: In-memory StoreApi fake — entries/assets/snapshots/meta held in
// ABOUTME: plain JS structures; enough fidelity to drive app-store tests.
import type { EntryKind } from "../../../core/model/types";
import type { EntryRecord, OutboxAsset, Snapshot, StoreApi } from "../../../core/store/types";

interface FakeStoreState {
  entries: Map<string, EntryRecord>;
  assets: OutboxAsset[];
  snapshots: Snapshot[];
  meta: Map<string, string>;
  nextSnapshotId: number;
}

function createState(seedEntries: EntryRecord[]): FakeStoreState {
  return {
    entries: new Map(seedEntries.map((e) => [e.path, e])),
    assets: [],
    snapshots: [],
    meta: new Map(),
    nextSnapshotId: 1,
  };
}

function getEntry(state: FakeStoreState, path: string): Promise<EntryRecord | null> {
  return Promise.resolve(state.entries.get(path) ?? null);
}

function listEntries(state: FakeStoreState, kind?: EntryKind): Promise<EntryRecord[]> {
  const all = [...state.entries.values()].filter((e) => !e.deleted);
  const filtered = kind ? all.filter((e) => e.kind === kind) : all;
  return Promise.resolve(filtered.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")));
}

function listDirty(state: FakeStoreState): Promise<EntryRecord[]> {
  return Promise.resolve([...state.entries.values()].filter((e) => e.dirty || e.deleted));
}

function matchesQuery(entry: EntryRecord, needle: string): boolean {
  const title = entry.title?.toLowerCase() ?? "";
  return (
    !entry.deleted &&
    (title.includes(needle) || entry.workingContent.toLowerCase().includes(needle))
  );
}

function searchEntries(state: FakeStoreState, query: string): Promise<EntryRecord[]> {
  const needle = query.toLowerCase();
  return Promise.resolve(
    [...state.entries.values()].filter((entry) => matchesQuery(entry, needle)),
  );
}

function upsertEntry(state: FakeStoreState, record: EntryRecord): Promise<void> {
  state.entries.set(record.path, record);
  return Promise.resolve();
}

function removeEntry(state: FakeStoreState, path: string): Promise<void> {
  state.entries.delete(path);
  return Promise.resolve();
}

function addAsset(state: FakeStoreState, asset: OutboxAsset): Promise<void> {
  state.assets.push(asset);
  return Promise.resolve();
}

function listAssetsFor(state: FakeStoreState, entryPaths: string[]): Promise<OutboxAsset[]> {
  return Promise.resolve(state.assets.filter((asset) => entryPaths.includes(asset.entryPath)));
}

function removeAsset(state: FakeStoreState, repoPath: string): Promise<void> {
  const index = state.assets.findIndex((asset) => asset.repoPath === repoPath);
  if (index !== -1) {
    state.assets.splice(index, 1);
  }
  return Promise.resolve();
}

function saveSnapshot(
  state: FakeStoreState,
  path: string,
  content: string,
  reason: Snapshot["reason"],
): Promise<void> {
  state.snapshots.push({ id: state.nextSnapshotId, path, content, reason, createdAt: Date.now() });
  state.nextSnapshotId += 1;
  return Promise.resolve();
}

function listSnapshots(state: FakeStoreState, path: string): Promise<Snapshot[]> {
  return Promise.resolve(state.snapshots.filter((snapshot) => snapshot.path === path));
}

function getMeta(state: FakeStoreState, key: string): Promise<string | null> {
  return Promise.resolve(state.meta.get(key) ?? null);
}

function setMeta(state: FakeStoreState, key: string, value: string | null): Promise<void> {
  if (value === null) {
    state.meta.delete(key);
  } else {
    state.meta.set(key, value);
  }
  return Promise.resolve();
}

/** A fresh in-memory StoreApi. Pass seedEntries to pre-populate for a test. */
function createFakeStore(seedEntries: EntryRecord[] = []): StoreApi {
  const state = createState(seedEntries);
  return {
    init: () => Promise.resolve(),
    getEntry: (path) => getEntry(state, path),
    listEntries: (kind) => listEntries(state, kind),
    listDirty: () => listDirty(state),
    searchEntries: (query) => searchEntries(state, query),
    upsertEntry: (record) => upsertEntry(state, record),
    upsertEntryPair: async (first, second) => {
      await upsertEntry(state, first);
      await upsertEntry(state, second);
    },
    removeEntry: (path) => removeEntry(state, path),
    addAsset: (asset) => addAsset(state, asset),
    listAssetsFor: (entryPaths) => listAssetsFor(state, entryPaths),
    removeAsset: (repoPath) => removeAsset(state, repoPath),
    saveSnapshot: (path, content, reason) => saveSnapshot(state, path, content, reason),
    listSnapshots: (path) => listSnapshots(state, path),
    getMeta: (key) => getMeta(state, key),
    setMeta: (key, value) => setMeta(state, key, value),
    transaction: (fn) => fn(),
  };
}

export { createFakeStore };
