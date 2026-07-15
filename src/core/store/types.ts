// ABOUTME: Contract for local persistence — SQLite behind a SqlDriver abstraction,
// ABOUTME: entry records with sync state, asset outbox, snapshots, and FTS search.

import type { EntryKind } from "../model/types";

/**
 * Minimal SQL driver both environments implement:
 * better-sqlite3 (Node/tests) and tauri-plugin-sql (runtime).
 * Parameters are positional (?).
 */
export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** Serialized transaction. Nested calls are an error. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/** One managed file and its sync state. */
export interface EntryRecord {
  path: string; // primary key, repo-relative
  kind: EntryKind;
  /** Blob sha at last sync; null = never synced (new local entry). */
  baseSha: string | null;
  /** Full text at baseSha; null iff baseSha is null. */
  baseContent: string | null;
  /** Current local text (the editor edits this). */
  workingContent: string;
  /** workingContent differs from baseContent (or entry is new/moved/deleted). */
  dirty: boolean;
  /** Tombstone: delete on next push. */
  deleted: boolean;
  /** Set when this entry was renamed from another path (old path gets a tombstone). */
  renamedFrom: string | null;
  /** Denormalized display fields, recomputed via model on every write. */
  title: string | null;
  date: string | null;
  draft: boolean;
  opaqueId: string | null;
  updatedAt: number; // epoch ms, local edit time
}

/** A locally-added image waiting to ride along with its entry's commit. */
export interface OutboxAsset {
  /** Repo path it will occupy, e.g. "content/assets/2026/07/pasted-image-....png". */
  repoPath: string;
  /** Absolute path of the bytes in the local asset cache. */
  localPath: string;
  /** Entry path that references it (upload gated on that entry's push). */
  entryPath: string;
  createdAt: number;
}

export interface Snapshot {
  id: number;
  path: string;
  content: string;
  reason: "pre-merge" | "pre-publish" | "manual";
  createdAt: number;
}

export interface StoreApi {
  /** Create/migrate schema. Idempotent. */
  init(): Promise<void>;

  getEntry(path: string): Promise<EntryRecord | null>;
  /** All non-deleted entries, optionally by kind, newest date first. */
  listEntries(kind?: EntryKind): Promise<EntryRecord[]>;
  /** All dirty or deleted entries (push set). */
  listDirty(): Promise<EntryRecord[]>;
  /** FTS over title+body. */
  searchEntries(query: string): Promise<EntryRecord[]>;
  upsertEntry(record: EntryRecord): Promise<void>;
  /** Hard-remove a record (after its tombstone is pushed). */
  removeEntry(path: string): Promise<void>;

  addAsset(asset: OutboxAsset): Promise<void>;
  /** Assets referenced by the given entry paths. */
  listAssetsFor(entryPaths: string[]): Promise<OutboxAsset[]>;
  removeAsset(repoPath: string): Promise<void>;

  saveSnapshot(
    path: string,
    content: string,
    reason: Snapshot["reason"],
  ): Promise<void>;
  listSnapshots(path: string): Promise<Snapshot[]>;

  /** Small key/value state: lastRootTreeSha, lastSyncAt, commitMsgTemplates... */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;

  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export type StoreFactory = (driver: SqlDriver) => StoreApi;
