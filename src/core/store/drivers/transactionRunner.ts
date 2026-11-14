// ABOUTME: Shared BEGIN IMMEDIATE/COMMIT/ROLLBACK transaction runner used by both
// ABOUTME: SqlDriver implementations, so the exact same code path runs on each.

type Execute = (sql: string, params?: unknown[]) => Promise<{ rowsAffected: number }>;

/**
 * Builds a `SqlDriver.transaction` implementation on top of a driver's own
 * `execute`, rather than relying on a driver-specific transaction API. That
 * keeps better-sqlite3 and tauri-plugin-sql on identical BEGIN/COMMIT/ROLLBACK
 * behavior instead of two divergent implementations.
 *
 * The `execute` passed in MUST run every statement on one connection for the
 * duration of the callback; otherwise BEGIN takes its write lock on one
 * connection while later statements wait on a different one and fail with
 * "database is locked". better-sqlite3 has exactly one connection, so it uses
 * this runner as-is. tauri-plugin-sql checks a connection out of its sqlx pool
 * per call and exposes no single-connection transaction command, so its driver
 * cannot use this runner at all — see drivers/tauri-sql.ts.
 *
 * A failing ROLLBACK never masks the callback's error: the original reason a
 * transaction failed is what the caller needs to see.
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

    let result: T;
    try {
      result = await fn();
    } catch (err) {
      // ROLLBACK can fail on its own (a dead connection, a transaction the
      // server already aborted). That failure explains why cleanup did not
      // happen; it does not explain why the transaction failed. Keep the
      // original error and attach the rollback one to it.
      try {
        await execute("ROLLBACK");
      } catch (rollbackErr) {
        const rollbackMessage =
          rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
        const failure = new Error(
          `transaction failed and rolling it back also failed: ${rollbackMessage}`,
        );
        failure.cause = err;
        throw failure;
      }
      throw err;
    } finally {
      active = false;
    }

    await execute("COMMIT");
    return result;
  };
}
