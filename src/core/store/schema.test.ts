// ABOUTME: Tests for schema.ts — migration from an empty db, migration idempotency,
// ABOUTME: FTS5 detection/fallback, and buildSearchQuery's pure query-building.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createBetterSqliteDriver } from "./drivers/better-sqlite3";
import { createTransactionRunner } from "./drivers/transactionRunner";
import { buildSearchQuery, initSchema } from "./schema";
import { byString, withFts5ProbeFailing } from "./testHelpers";
import type { SqlDriver } from "./types";

/**
 * A driver that hands each call a different connection, the way
 * tauri-plugin-sql hands each execute() a connection from its sqlx pool.
 * Statements a real transaction would keep on one connection land on
 * different ones here, which is what broke boot on iOS.
 */
function createRotatingConnectionDriver(connections: number): {
  driver: SqlDriver;
  dispose: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "blogosphere-schema-"));
  const path = join(dir, "pool.db");
  const conns = Array.from({ length: connections }, () => {
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    return db;
  });
  let next = 0;
  const checkOut = (): Database.Database => {
    const conn = conns[next % conns.length] as Database.Database;
    next += 1;
    return conn;
  };

  // The async modifiers below are required, not stylistic: better-sqlite3
  // throws synchronously, and SqlDriver promises a rejected Promise, never a
  // synchronous throw. Same reason as the real driver's own suppression.
  const driver: SqlDriver = {
    // biome-ignore lint/suspicious/useAwait: converts a synchronous throw into a rejection
    execute: async (sql, params = []) => {
      const info = checkOut()
        .prepare(sql)
        .run(...params);
      return { rowsAffected: info.changes };
    },
    select: async <T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<T[]> =>
      checkOut()
        .prepare(sql)
        .all(...params) as T[],
    transaction: createTransactionRunner((sql, params = []) => driver.execute(sql, params)),
  };

  return {
    driver,
    dispose: () => {
      for (const conn of conns) {
        conn.close();
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function tableNames(driver: SqlDriver): Promise<string[]> {
  const rows = await driver.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  return rows.map((row) => row.name).sort(byString);
}

describe("initSchema: from an empty database", () => {
  it("succeeds when every statement lands on a different pooled connection", async () => {
    const { driver, dispose } = createRotatingConnectionDriver(4);
    try {
      await expect(initSchema(driver)).resolves.toEqual({ ftsAvailable: true });
    } finally {
      dispose();
    }
  });

  it("creates every table and reports FTS5 available", async () => {
    const driver = createBetterSqliteDriver();

    const info = await initSchema(driver);

    expect(info.ftsAvailable).toBe(true);
    expect(await tableNames(driver)).toEqual(
      expect.arrayContaining(["entries", "assets", "snapshots", "meta", "entries_fts"]),
    );
  });

  it("records schema_version = 1 in meta", async () => {
    const driver = createBetterSqliteDriver();
    await initSchema(driver);

    const rows = await driver.select<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version'",
    );
    expect(rows).toEqual([{ value: "1" }]);
  });

  it("never leaves its throwaway probe table behind on a successful probe", async () => {
    const driver = createBetterSqliteDriver();
    await initSchema(driver);

    expect(await tableNames(driver)).not.toContain("__blogosphere_fts5_probe");
  });
});

describe("initSchema: idempotency", () => {
  it("calling init twice does not error and preserves existing data", async () => {
    const driver = createBetterSqliteDriver();
    await initSchema(driver);
    await driver.execute(
      "INSERT INTO entries (path, kind, working_content, updated_at) VALUES (?, ?, ?, ?)",
      ["a.md", "post", "hello", 1],
    );

    await expect(initSchema(driver)).resolves.toEqual({ ftsAvailable: true });

    expect(await driver.select("SELECT * FROM entries")).toHaveLength(1);
    const versionRows = await driver.select<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version'",
    );
    expect(versionRows).toEqual([{ value: "1" }]);
  });

  it("the FTS5 fallback path is also idempotent under a second init", async () => {
    const real = createBetterSqliteDriver();
    const driver = withFts5ProbeFailing(real);
    await initSchema(driver);

    await expect(initSchema(driver)).resolves.toEqual({ ftsAvailable: false });
  });
});

describe("initSchema: FTS5 unavailable", () => {
  it("falls back cleanly: entries_fts is never created, other tables still are", async () => {
    const real = createBetterSqliteDriver();
    const driver = withFts5ProbeFailing(real);

    const info = await initSchema(driver);

    expect(info.ftsAvailable).toBe(false);
    const names = await tableNames(driver);
    expect(names).not.toContain("entries_fts");
    expect(names).toEqual(expect.arrayContaining(["entries", "assets", "snapshots", "meta"]));
  });
});

describe("buildSearchQuery: branch selection", () => {
  it("returns null for an empty or whitespace-only query, with FTS available or not", () => {
    expect(buildSearchQuery(true, "")).toBeNull();
    expect(buildSearchQuery(true, "   ")).toBeNull();
    expect(buildSearchQuery(false, "")).toBeNull();
    expect(buildSearchQuery(false, "  \t\n ")).toBeNull();
  });

  it("joins tokens with AND and quotes each one for FTS MATCH", () => {
    const built = buildSearchQuery(true, "hello   world");
    expect(built?.sql).toContain("MATCH ?");
    expect(built?.params).toEqual(['"hello" AND "world"']);
  });

  it("builds a %-wrapped LIKE pattern over title and working_content when FTS is unavailable", () => {
    const built = buildSearchQuery(false, "hello world");
    expect(built?.sql).toContain("title LIKE ?");
    expect(built?.sql).toContain("working_content LIKE ?");
    expect(built?.params).toEqual(["%hello world%", "%hello world%"]);
  });

  it("selects the same aliased entry columns and ORDER BY in both branches", () => {
    const ftsBuilt = buildSearchQuery(true, "x");
    const likeBuilt = buildSearchQuery(false, "x");
    for (const built of [ftsBuilt, likeBuilt]) {
      expect(built?.sql).toContain("AS baseSha");
      expect(built?.sql).toContain("AS workingContent");
      expect(built?.sql).toContain("date IS NULL");
    }
  });
});

describe("buildSearchQuery: LIKE pattern escaping", () => {
  it("escapes % and _ (LIKE wildcards) in the fallback pattern", () => {
    const built = buildSearchQuery(false, "50%_off");
    const expected = ["%", "50", "\\%", "\\_", "off", "%"].join("");
    expect(built?.params).toEqual([expected, expected]);
  });

  it("escapes literal backslashes in the fallback pattern", () => {
    const built = buildSearchQuery(false, "a\\b");
    const expected = ["%", "a", "\\\\", "b", "%"].join("");
    expect(built?.params).toEqual([expected, expected]);
  });
});
