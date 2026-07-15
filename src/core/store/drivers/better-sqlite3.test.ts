// ABOUTME: Unit tests for the better-sqlite3 SqlDriver — execute/select contract
// ABOUTME: and transaction commit/rollback/nesting at the raw driver level.

import { describe, expect, it } from "vitest";
import { createBetterSqliteDriver } from "./better-sqlite3";

const UNKNOWN_ID = 999;
const NESTED_TX_ERROR_RE = /nested transactions/i;

describe("createBetterSqliteDriver: execute/select", () => {
  it("executes DDL and DML, reporting rowsAffected", async () => {
    const driver = createBetterSqliteDriver();
    await driver.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = await driver.execute("INSERT INTO t (id, name) VALUES (?, ?)", [1, "a"]);
    expect(insert.rowsAffected).toBe(1);

    const update = await driver.execute("UPDATE t SET name = ? WHERE id = ?", ["b", 1]);
    expect(update.rowsAffected).toBe(1);

    const updateNone = await driver.execute("UPDATE t SET name = ? WHERE id = ?", [
      "c",
      UNKNOWN_ID,
    ]);
    expect(updateNone.rowsAffected).toBe(0);
  });

  it("select returns typed rows in query order", async () => {
    const driver = createBetterSqliteDriver();
    await driver.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    await driver.execute("INSERT INTO t (id, name) VALUES (?, ?)", [1, "a"]);
    await driver.execute("INSERT INTO t (id, name) VALUES (?, ?)", [2, "b"]);

    const rows = await driver.select<{ id: number; name: string }>("SELECT * FROM t ORDER BY id");

    expect(rows).toEqual([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
  });

  it("gives each driver instance its own isolated in-memory database", async () => {
    const a = createBetterSqliteDriver();
    const b = createBetterSqliteDriver();
    await a.execute("CREATE TABLE t (id INTEGER)");

    await expect(b.select("SELECT * FROM t")).rejects.toThrow();
  });

  it("propagates a synchronous prepare error as a rejected promise, not a throw", async () => {
    const driver = createBetterSqliteDriver();

    // Calling (not yet awaiting) must not throw synchronously — it must
    // return a rejected promise, matching the SqlDriver contract.
    let pending: Promise<{ rowsAffected: number }> | undefined;
    expect(() => {
      pending = driver.execute("NOT VALID SQL");
    }).not.toThrow();

    await expect(pending).rejects.toThrow();
  });
});

describe("createBetterSqliteDriver: transactions", () => {
  it("commits a successful transaction", async () => {
    const driver = createBetterSqliteDriver();
    await driver.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)");

    await driver.transaction(async () => {
      await driver.execute("INSERT INTO t (id) VALUES (1)");
    });

    expect(await driver.select("SELECT * FROM t")).toHaveLength(1);
  });

  it("rolls back every write in a failed transaction", async () => {
    const driver = createBetterSqliteDriver();
    await driver.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)");

    await expect(
      driver.transaction(async () => {
        await driver.execute("INSERT INTO t (id) VALUES (1)");
        await driver.execute("INSERT INTO t (id) VALUES (2)");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await driver.select("SELECT * FROM t")).toHaveLength(0);
  });

  it("rejects nested transactions", async () => {
    const driver = createBetterSqliteDriver();

    await expect(
      driver.transaction(async () => {
        await driver.transaction(async () => undefined);
      }),
    ).rejects.toThrow(NESTED_TX_ERROR_RE);
  });
});
