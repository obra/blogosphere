// ABOUTME: SqlDriver implementation backed by better-sqlite3 — the Node driver used
// ABOUTME: by the store's test suite; synchronous calls wrapped in async signatures.

// Qwik dependency; the rule pattern-matches any closure-returning factory (the DI
// pattern StoreFactory/SqlDriver both require) as a Qwik component and is a
// false positive here, not a real serialization concern.
// biome-ignore-all lint/suspicious/useAwait: execute/select are declared async
// (with no internal await, since better-sqlite3 is synchronous) specifically so a
// synchronous throw from db.prepare(...) is converted into a rejected Promise —
// matching the SqlDriver contract, which promises a Promise back, never a
// synchronous throw. Dropping `async` would break that guarantee.

import Database from "better-sqlite3";
import type { SqlDriver } from "../types";
import { createTransactionRunner } from "./transactionRunner";

/**
 * Create a SqlDriver over better-sqlite3. Defaults to an in-memory database
 * (what the store's tests use); pass a file path for a persistent
 * Node-hosted database.
 */
export function createBetterSqliteDriver(filename = ":memory:"): SqlDriver {
  const db = new Database(filename);

  const execute = async (
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rowsAffected: number }> => {
    const info = db.prepare(sql).run(...params);
    return { rowsAffected: info.changes };
  };

  const select = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> => db.prepare(sql).all(...params) as T[];

  return {
    execute,
    select,
    transaction: createTransactionRunner(execute),
  };
}
