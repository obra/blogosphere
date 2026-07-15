// ABOUTME: Shared BEGIN IMMEDIATE/COMMIT/ROLLBACK transaction runner used by both
// ABOUTME: SqlDriver implementations, so the exact same code path runs on each.

type Execute = (sql: string, params?: unknown[]) => Promise<{ rowsAffected: number }>;

/**
 * Builds a `SqlDriver.transaction` implementation on top of a driver's own
 * `execute`, rather than relying on a driver-specific transaction API. That
 * keeps better-sqlite3 and tauri-plugin-sql on identical BEGIN/COMMIT/ROLLBACK
 * behavior instead of two divergent implementations.
 *
 * Nested calls (transaction() invoked again while one is already running on
 * this runner) reject with a clear error instead of silently corrupting state.
 */
export function createTransactionRunner(execute: Execute): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = false;

  return async function runTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (active) {
      throw new Error("SqlDriver.transaction: nested transactions are not supported");
    }
    active = true;

    try {
      await execute("BEGIN IMMEDIATE");
    } catch (err) {
      active = false;
      throw err;
    }

    try {
      const result = await fn();
      await execute("COMMIT");
      return result;
    } catch (err) {
      await execute("ROLLBACK");
      throw err;
    } finally {
      active = false;
    }
  };
}
