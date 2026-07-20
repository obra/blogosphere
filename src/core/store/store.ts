// ABOUTME: createStore(driver) — the StoreApi implementation: pure CRUD + search
// ABOUTME: over the schema in schema.ts. Never recomputes denormalized entry fields.

import type { EntryKind } from "../model/types";
import { buildSearchQuery, ENTRIES_ORDER_BY, ENTRY_COLUMNS_SQL, initSchema } from "./schema";
import type { EntryRecord, OutboxAsset, Snapshot, SqlDriver, StoreApi } from "./types";

/** Row shape for ENTRY_COLUMNS_SQL — already aliased to EntryRecord's field names. */
interface EntryRow {
  path: string;
  kind: string;
  baseSha: string | null;
  baseContent: string | null;
  workingContent: string;
  dirty: number;
  deleted: number;
  renamedFrom: string | null;
  title: string | null;
  date: string | null;
  draft: number;
  opaqueId: string | null;
  updatedAt: number;
}

interface AssetRow {
  repoPath: string;
  localPath: string;
  entryPath: string;
  createdAt: number;
}

interface SnapshotRow {
  id: number;
  path: string;
  content: string;
  reason: string;
  createdAt: number;
}

/** Mutable FTS-availability flag, set once by init() and read by searchEntries(). */
interface FtsState {
  available: boolean;
}

function rowToEntry(row: EntryRow): EntryRecord {
  return {
    path: row.path,
    kind: row.kind as EntryKind,
    baseSha: row.baseSha,
    baseContent: row.baseContent,
    workingContent: row.workingContent,
    dirty: row.dirty !== 0,
    deleted: row.deleted !== 0,
    renamedFrom: row.renamedFrom,
    title: row.title,
    date: row.date,
    draft: row.draft !== 0,
    opaqueId: row.opaqueId,
    updatedAt: row.updatedAt,
  };
}

function rowToAsset(row: AssetRow): OutboxAsset {
  return {
    repoPath: row.repoPath,
    localPath: row.localPath,
    entryPath: row.entryPath,
    createdAt: row.createdAt,
  };
}

function rowToSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    path: row.path,
    content: row.content,
    reason: row.reason as Snapshot["reason"],
    createdAt: row.createdAt,
  };
}

function entryToParams(record: EntryRecord): unknown[] {
  return [
    record.path,
    record.kind,
    record.baseSha,
    record.baseContent,
    record.workingContent,
    record.dirty ? 1 : 0,
    record.deleted ? 1 : 0,
    record.renamedFrom,
    record.title,
    record.date,
    record.draft ? 1 : 0,
    record.opaqueId,
    record.updatedAt,
  ];
}

const UPSERT_ENTRY_SQL = `
  INSERT INTO entries (
    path, kind, base_sha, base_content, working_content, dirty, deleted,
    renamed_from, title, date, draft, opaque_id, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(path) DO UPDATE SET
    kind = excluded.kind,
    base_sha = excluded.base_sha,
    base_content = excluded.base_content,
    working_content = excluded.working_content,
    dirty = excluded.dirty,
    deleted = excluded.deleted,
    renamed_from = excluded.renamed_from,
    title = excluded.title,
    date = excluded.date,
    draft = excluded.draft,
    opaque_id = excluded.opaque_id,
    updated_at = excluded.updated_at
`;

/** Same upsert, two VALUES rows: one statement, so the pair is atomic on any
 *  backend. Cross-call BEGIN/COMMIT transactions are NOT sound over
 *  tauri-plugin-sql (each execute() checks a connection out of a sqlx pool,
 *  so the transaction's connection and later statements' connections can
 *  differ — "database is locked" under concurrency). Rename/publish pairs
 *  must go through this instead. */
const UPSERT_ENTRY_PAIR_SQL = `
  INSERT INTO entries (
    path, kind, base_sha, base_content, working_content, dirty, deleted,
    renamed_from, title, date, draft, opaque_id, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(path) DO UPDATE SET
    kind = excluded.kind,
    base_sha = excluded.base_sha,
    base_content = excluded.base_content,
    working_content = excluded.working_content,
    dirty = excluded.dirty,
    deleted = excluded.deleted,
    renamed_from = excluded.renamed_from,
    title = excluded.title,
    date = excluded.date,
    draft = excluded.draft,
    opaque_id = excluded.opaque_id,
    updated_at = excluded.updated_at
`;

const UPSERT_ASSET_SQL = `
  INSERT INTO assets (repo_path, local_path, entry_path, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(repo_path) DO UPDATE SET
    local_path = excluded.local_path,
    entry_path = excluded.entry_path,
    created_at = excluded.created_at
`;

const UPSERT_META_SQL = `
  INSERT INTO meta (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`;

const ASSET_COLUMNS_SQL =
  "repo_path AS repoPath, local_path AS localPath, entry_path AS entryPath, created_at AS createdAt";

const SNAPSHOT_COLUMNS_SQL = "id, path, content, reason, created_at AS createdAt";

/** Read-side entry queries: single lookup, listings, and search. */
function createEntryReaders(driver: SqlDriver, fts: FtsState) {
  async function getEntry(path: string): Promise<EntryRecord | null> {
    const rows = await driver.select<EntryRow>(
      `SELECT ${ENTRY_COLUMNS_SQL} FROM entries WHERE path = ?`,
      [path],
    );
    const [row] = rows;
    return row ? rowToEntry(row) : null;
  }

  async function listEntries(kind?: EntryKind): Promise<EntryRecord[]> {
    const rows =
      kind === undefined
        ? await driver.select<EntryRow>(
            `SELECT ${ENTRY_COLUMNS_SQL} FROM entries WHERE deleted = 0 ORDER BY ${ENTRIES_ORDER_BY}`,
          )
        : await driver.select<EntryRow>(
            `SELECT ${ENTRY_COLUMNS_SQL} FROM entries WHERE deleted = 0 AND kind = ? ORDER BY ${ENTRIES_ORDER_BY}`,
            [kind],
          );
    return rows.map(rowToEntry);
  }

  async function listDirty(): Promise<EntryRecord[]> {
    const rows = await driver.select<EntryRow>(
      `SELECT ${ENTRY_COLUMNS_SQL} FROM entries WHERE dirty = 1 OR deleted = 1 ORDER BY ${ENTRIES_ORDER_BY}`,
    );
    return rows.map(rowToEntry);
  }

  async function searchEntries(query: string): Promise<EntryRecord[]> {
    const built = buildSearchQuery(fts.available, query);
    if (!built) {
      return [];
    }
    const rows = await driver.select<EntryRow>(built.sql, built.params);
    return rows.map(rowToEntry);
  }

  return { getEntry, listEntries, listDirty, searchEntries };
}

/** Write-side entry mutations: upsert (no recomputation) and hard remove. */
function createEntryWriters(driver: SqlDriver) {
  async function upsertEntry(record: EntryRecord): Promise<void> {
    await driver.execute(UPSERT_ENTRY_SQL, entryToParams(record));
  }

  async function upsertEntryPair(first: EntryRecord, second: EntryRecord): Promise<void> {
    await driver.execute(UPSERT_ENTRY_PAIR_SQL, [
      ...entryToParams(first),
      ...entryToParams(second),
    ]);
  }

  async function removeEntry(path: string): Promise<void> {
    await driver.execute("DELETE FROM entries WHERE path = ?", [path]);
  }

  return { upsertEntry, upsertEntryPair, removeEntry };
}

/** Outbox asset methods. */
function createAssetMethods(driver: SqlDriver) {
  async function addAsset(asset: OutboxAsset): Promise<void> {
    const params = [asset.repoPath, asset.localPath, asset.entryPath, asset.createdAt];
    await driver.execute(UPSERT_ASSET_SQL, params);
  }

  async function listAssetsFor(entryPaths: string[]): Promise<OutboxAsset[]> {
    if (entryPaths.length === 0) {
      return [];
    }
    const placeholders = entryPaths.map(() => "?").join(", ");
    const rows = await driver.select<AssetRow>(
      `SELECT ${ASSET_COLUMNS_SQL} FROM assets WHERE entry_path IN (${placeholders}) ORDER BY created_at ASC, repo_path ASC`,
      entryPaths,
    );
    return rows.map(rowToAsset);
  }

  async function removeAsset(repoPath: string): Promise<void> {
    await driver.execute("DELETE FROM assets WHERE repo_path = ?", [repoPath]);
  }

  return { addAsset, listAssetsFor, removeAsset };
}

/** Pre-merge/pre-publish/manual content snapshots. */
function createSnapshotMethods(driver: SqlDriver) {
  async function saveSnapshot(
    path: string,
    content: string,
    reason: Snapshot["reason"],
  ): Promise<void> {
    const params = [path, content, reason, Date.now()];
    await driver.execute(
      "INSERT INTO snapshots (path, content, reason, created_at) VALUES (?, ?, ?, ?)",
      params,
    );
  }

  async function listSnapshots(path: string): Promise<Snapshot[]> {
    const rows = await driver.select<SnapshotRow>(
      `SELECT ${SNAPSHOT_COLUMNS_SQL} FROM snapshots WHERE path = ? ORDER BY created_at DESC, id DESC`,
      [path],
    );
    return rows.map(rowToSnapshot);
  }

  return { saveSnapshot, listSnapshots };
}

/** Small key/value settings (lastRootTreeSha, lastSyncAt, ...). */
function createMetaMethods(driver: SqlDriver) {
  async function getMeta(key: string): Promise<string | null> {
    const rows = await driver.select<{ value: string | null }>(
      "SELECT value FROM meta WHERE key = ?",
      [key],
    );
    const [row] = rows;
    return row?.value ?? null;
  }

  async function setMeta(key: string, value: string | null): Promise<void> {
    await driver.execute(UPSERT_META_SQL, [key, value]);
  }

  return { getMeta, setMeta };
}

/**
 * Build the StoreApi over a SqlDriver. Deliberately dumb: upsertEntry writes
 * exactly the fields it's given (title/date/draft/opaqueId included) with no
 * recomputation from working_content — callers (model/sync) own that.
 */
export function createStore(driver: SqlDriver): StoreApi {
  const fts: FtsState = { available: false };

  async function init(): Promise<void> {
    const info = await initSchema(driver);
    fts.available = info.ftsAvailable;
  }

  function transaction<T>(fn: () => Promise<T>): Promise<T> {
    return driver.transaction(fn);
  }

  return {
    init,
    transaction,
    ...createEntryReaders(driver, fts),
    ...createEntryWriters(driver),
    ...createAssetMethods(driver),
    ...createSnapshotMethods(driver),
    ...createMetaMethods(driver),
  };
}
