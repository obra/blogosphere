// ABOUTME: Shared fixtures for store module tests — EntryRecord builder, a
// ABOUTME: ready-to-use store, and an FTS5-probe-failing driver stub. Not a *.test.ts file.

import { createBetterSqliteDriver } from "./drivers/better-sqlite3";
import { createStore } from "./store";
import type { EntryRecord, SqlDriver, StoreApi } from "./types";

const FTS5_DDL_RE = /fts5/i;

/** Explicit string comparator for `.sort()` calls — plain lexicographic order. */
export function byString(a: string, b: string): number {
  return a.localeCompare(b);
}

export function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    path: "content/blog/2026/2026-01-01-default.md",
    kind: "post",
    baseSha: null,
    baseContent: null,
    workingContent: "default body",
    dirty: false,
    deleted: false,
    renamedFrom: null,
    title: "Default title",
    date: "2026-01-01",
    draft: false,
    opaqueId: null,
    updatedAt: 1,
    ...overrides,
  };
}

/** A fresh in-memory driver + initialized store, ready to use in a test. */
export async function createTestStore(): Promise<{ driver: SqlDriver; store: StoreApi }> {
  const driver = createBetterSqliteDriver();
  const store = createStore(driver);
  await store.init();
  return { driver, store };
}

/**
 * Wraps a real driver, failing any statement that would create an FTS5
 * virtual table — simulates a SQLite build without FTS5 compiled in, so the
 * create-and-rollback probe in schema.ts observes unavailability for real.
 */
export function withFts5ProbeFailing(real: SqlDriver): SqlDriver {
  return {
    execute: (sql, params) => {
      if (FTS5_DDL_RE.test(sql)) {
        return Promise.reject(new Error("simulated: no such module: fts5"));
      }
      return real.execute(sql, params);
    },
    select: (sql, params) => real.select(sql, params),
    transaction: (fn) => real.transaction(fn),
  };
}

/** A fresh store built on a driver whose FTS5 probe always fails. */
export async function createTestStoreWithoutFts(): Promise<{ real: SqlDriver; store: StoreApi }> {
  const real = createBetterSqliteDriver();
  const store = createStore(withFts5ProbeFailing(real));
  await store.init();
  return { real, store };
}
