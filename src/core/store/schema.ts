// ABOUTME: SQL schema, versioned migrations (tracked via the meta table's
// ABOUTME: schema_version key), and FTS5 detection/fallback search-query building.

// biome-ignore-all lint/performance/noAwaitInLoops: every loop below runs DDL/DML
// statements that share one connection and depend on execution order (an index
// created after its table, a schema_version bump after the statements it
// covers); Promise.all would race them incorrectly, so sequential await is the
// only correct option, not a style preference.

import type { SqlDriver } from "./types";

const META_KEY_SCHEMA_VERSION = "schema_version";

interface Migration {
  version: number;
  statements: readonly string[];
}

/**
 * Versioned migrations. Each entry's statements run once, inside one
 * transaction, the first time a database's schema_version is below it.
 * Append new migrations here; never edit a shipped one in place.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS entries (
        path TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        base_sha TEXT,
        base_content TEXT,
        working_content TEXT NOT NULL,
        dirty INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0,
        renamed_from TEXT,
        title TEXT,
        date TEXT,
        draft INTEGER NOT NULL DEFAULT 0,
        opaque_id TEXT,
        updated_at INTEGER NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_entries_kind ON entries(kind)",
      "CREATE INDEX IF NOT EXISTS idx_entries_dirty ON entries(dirty)",
      "CREATE INDEX IF NOT EXISTS idx_entries_deleted ON entries(deleted)",
      `CREATE TABLE IF NOT EXISTS assets (
        repo_path TEXT PRIMARY KEY NOT NULL,
        local_path TEXT NOT NULL,
        entry_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_assets_entry_path ON assets(entry_path)",
      `CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_snapshots_path ON snapshots(path)",
    ],
  },
];

const FTS_TABLE_DDL =
  "CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(path UNINDEXED, title, body)";

/** Triggers keep entries_fts in sync whenever entries changes — no app-level fan-out. */
const FTS_TRIGGER_DDL: readonly string[] = [
  `CREATE TRIGGER IF NOT EXISTS entries_fts_ai AFTER INSERT ON entries BEGIN
     INSERT INTO entries_fts(path, title, body)
     VALUES (new.path, coalesce(new.title, ''), coalesce(new.working_content, ''));
   END`,
  `CREATE TRIGGER IF NOT EXISTS entries_fts_au AFTER UPDATE ON entries BEGIN
     DELETE FROM entries_fts WHERE path = old.path;
     INSERT INTO entries_fts(path, title, body)
     VALUES (new.path, coalesce(new.title, ''), coalesce(new.working_content, ''));
   END`,
  `CREATE TRIGGER IF NOT EXISTS entries_fts_ad AFTER DELETE ON entries BEGIN
     DELETE FROM entries_fts WHERE path = old.path;
   END`,
];

/** Thrown deliberately inside the FTS5 probe transaction so it always rolls back. */
class Fts5ProbeRollback extends Error {}

async function currentSchemaVersion(driver: SqlDriver): Promise<number> {
  const rows = await driver.select<{ value: string | null }>(
    "SELECT value FROM meta WHERE key = ?",
    [META_KEY_SCHEMA_VERSION],
  );
  const [row] = rows;
  const value = row?.value;
  if (value === undefined || value === null) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function setSchemaVersion(driver: SqlDriver, version: number): Promise<void> {
  await driver.execute(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [META_KEY_SCHEMA_VERSION, String(version)],
  );
}

async function runMigrations(driver: SqlDriver): Promise<void> {
  const current = await currentSchemaVersion(driver);
  const pending = MIGRATIONS.filter((migration) => migration.version > current).sort(
    (a, b) => a.version - b.version,
  );
  for (const migration of pending) {
    await driver.transaction(async () => {
      for (const statement of migration.statements) {
        await driver.execute(statement);
      }
      await setSchemaVersion(driver, migration.version);
    });
  }
}

/**
 * Create-and-rollback probe: attempts to create a throwaway FTS5 virtual
 * table inside a transaction it always aborts, so a successful probe never
 * leaves anything behind (and an unsuccessful one never partially applies).
 */
async function probeFts5(driver: SqlDriver): Promise<boolean> {
  try {
    await driver.transaction(async (): Promise<void> => {
      await driver.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS __blogosphere_fts5_probe USING fts5(probe)",
      );
      throw new Fts5ProbeRollback();
    });
  } catch (err) {
    return err instanceof Fts5ProbeRollback;
  }
  return false;
}

async function ensureFts(driver: SqlDriver): Promise<boolean> {
  const ftsAvailable = await probeFts5(driver);
  if (!ftsAvailable) {
    return false;
  }
  await driver.execute(FTS_TABLE_DDL);
  for (const statement of FTS_TRIGGER_DDL) {
    await driver.execute(statement);
  }
  return true;
}

const WHITESPACE_RE = /\s+/;
const DOUBLE_QUOTE_RE = /"/g;
const BACKSLASH_RE = /\\/g;
const PERCENT_RE = /%/g;
const UNDERSCORE_RE = /_/g;

function tokenizeForFts(query: string): string | null {
  const tokens = query
    .split(WHITESPACE_RE)
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replace(DOUBLE_QUOTE_RE, '""')}"`);
  return tokens.length > 0 ? tokens.join(" AND ") : null;
}

function escapeLikePattern(input: string): string {
  return input
    .replace(BACKSLASH_RE, "\\\\")
    .replace(PERCENT_RE, "\\%")
    .replace(UNDERSCORE_RE, "\\_");
}

// --- exports -----------------------------------------------------------

export interface SchemaInfo {
  /** True when FTS5 was available at init and entries_fts/triggers now exist. */
  ftsAvailable: boolean;
}

export interface SearchQuery {
  sql: string;
  params: unknown[];
}

/** Shared ORDER BY fragment: date desc, nulls (undated entries) last, then path. */
export const ENTRIES_ORDER_BY = "(date IS NULL) ASC, date DESC, path ASC";

/**
 * Entry columns aliased to EntryRecord's camelCase field names, so a
 * `driver.select<EntryRow>(...)` result maps onto EntryRecord with no
 * per-field snake_case bookkeeping at the call site.
 */
export const ENTRY_COLUMNS_SQL = `
  path, kind,
  base_sha AS baseSha,
  base_content AS baseContent,
  working_content AS workingContent,
  dirty, deleted,
  renamed_from AS renamedFrom,
  title, date, draft,
  opaque_id AS opaqueId,
  updated_at AS updatedAt
`;

/**
 * Create/migrate the full schema and (re-)detect FTS5 support. Idempotent —
 * safe to call on every app startup, and calling it twice in a row is a
 * cheap no-op the second time.
 */
export async function initSchema(driver: SqlDriver): Promise<SchemaInfo> {
  await driver.execute(
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT)",
  );
  await runMigrations(driver);
  const ftsAvailable = await ensureFts(driver);
  return { ftsAvailable };
}

/**
 * Build the search SQL for the current FTS availability: an FTS5 MATCH query
 * (title/body indexed as-is, no front-matter-aware parsing) when available,
 * else a LIKE-over-title-and-working_content scan. Both branches select the
 * same aliased columns and share one ORDER BY, so callers can treat the
 * result identically either way. Returns null when the query has no
 * searchable tokens — callers should short-circuit to `[]`.
 */
export function buildSearchQuery(ftsAvailable: boolean, rawQuery: string): SearchQuery | null {
  const trimmed = rawQuery.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (ftsAvailable) {
    const matchQuery = tokenizeForFts(trimmed);
    if (matchQuery === null) {
      return null;
    }
    return {
      // A subquery (rather than a JOIN) sidesteps column-name collisions
      // between entries and entries_fts (both have path/title) entirely.
      sql: `SELECT ${ENTRY_COLUMNS_SQL} FROM entries
            WHERE deleted = 0 AND path IN (SELECT path FROM entries_fts WHERE entries_fts MATCH ?)
            ORDER BY ${ENTRIES_ORDER_BY}`,
      params: [matchQuery],
    };
  }

  const pattern = `%${escapeLikePattern(trimmed)}%`;
  return {
    sql: `SELECT ${ENTRY_COLUMNS_SQL} FROM entries
          WHERE deleted = 0 AND (title LIKE ? ESCAPE '\\' OR working_content LIKE ? ESCAPE '\\')
          ORDER BY ${ENTRIES_ORDER_BY}`,
    params: [pattern, pattern],
  };
}
