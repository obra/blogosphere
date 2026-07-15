// ABOUTME: SqlDriver implementation over @tauri-apps/plugin-sql's Database. Thin
// ABOUTME: translation only — typechecked here, exercised at runtime, not unit-tested.

// Qwik dependency; the rule pattern-matches any closure-returning factory (the DI
// pattern StoreFactory/SqlDriver both require) as a Qwik component and is a
// false positive here, not a real serialization concern.

import type Database from "@tauri-apps/plugin-sql";
import type { SqlDriver } from "../types";
import { createTransactionRunner } from "./transactionRunner";

/**
 * Wrap an already-loaded tauri-plugin-sql `Database` in the portable
 * SqlDriver shape core/store expects. Loading the database
 * (`Database.load("sqlite:...")`) is the shell's job — it owns the
 * platform-specific path — so this factory just adapts an existing
 * connection's call shapes; it has no logic of its own.
 */
export function createTauriSqlDriver(db: Database): SqlDriver {
  const execute = async (
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rowsAffected: number }> => {
    const result = await db.execute(sql, params);
    return { rowsAffected: result.rowsAffected };
  };

  const select = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> => db.select<T[]>(sql, params);

  return {
    execute,
    select,
    transaction: createTransactionRunner(execute),
  };
}
