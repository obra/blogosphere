// ABOUTME: Unit tests for the shared BEGIN/COMMIT/ROLLBACK transaction runner —
// ABOUTME: call sequencing, error propagation, and nested-transaction rejection.

// biome-ignore-all lint/suspicious/useAwait: createTransactionRunner's contract is
// fn: () => Promise<T>, matching real call sites like store.transaction(async () =>
// {...}); many of these fixture callbacks legitimately have no internal await
// (they just record a call and return/throw), and forcing one in would test
// nothing extra.

import { describe, expect, it, vi } from "vitest";
import { createTransactionRunner } from "./transactionRunner";

const ANSWER = 42;
const NESTED_TX_ERROR_RE = /nested transactions/i;

function fakeExecute(calls: string[]) {
  return vi.fn(async (sql: string): Promise<{ rowsAffected: number }> => {
    calls.push(sql);
    return { rowsAffected: 0 };
  });
}

describe("createTransactionRunner: commit/rollback", () => {
  it("runs BEGIN IMMEDIATE, then the callback, then COMMIT on success", async () => {
    const calls: string[] = [];
    const transaction = createTransactionRunner(fakeExecute(calls));

    const result = await transaction(async () => {
      calls.push("fn");
      return ANSWER;
    });

    expect(result).toBe(ANSWER);
    expect(calls).toEqual(["BEGIN IMMEDIATE", "fn", "COMMIT"]);
  });

  it("rolls back and rethrows the original error when the callback throws", async () => {
    const calls: string[] = [];
    const transaction = createTransactionRunner(fakeExecute(calls));
    const boom = new Error("boom");

    await expect(
      transaction(async () => {
        calls.push("fn");
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(calls).toEqual(["BEGIN IMMEDIATE", "fn", "ROLLBACK"]);
  });
});

describe("createTransactionRunner: sequencing across calls", () => {
  it("rejects nested transactions without a second BEGIN, then rolls back the outer one", async () => {
    const calls: string[] = [];
    const transaction = createTransactionRunner(fakeExecute(calls));

    await expect(
      transaction(async () => {
        await transaction(async () => "inner");
        return "outer";
      }),
    ).rejects.toThrow(NESTED_TX_ERROR_RE);

    expect(calls).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
  });

  it("allows a later transaction to run after an earlier one committed", async () => {
    const calls: string[] = [];
    const transaction = createTransactionRunner(fakeExecute(calls));

    await transaction(async () => "first");
    const second = await transaction(async () => "second");

    expect(second).toBe("second");
    expect(calls).toEqual(["BEGIN IMMEDIATE", "COMMIT", "BEGIN IMMEDIATE", "COMMIT"]);
  });

  it("allows a later transaction to run after an earlier one rolled back", async () => {
    const calls: string[] = [];
    const transaction = createTransactionRunner(fakeExecute(calls));

    await expect(
      transaction(async () => {
        throw new Error("fail once");
      }),
    ).rejects.toThrow("fail once");
    const second = await transaction(async () => "second");

    expect(second).toBe("second");
    expect(calls).toEqual(["BEGIN IMMEDIATE", "ROLLBACK", "BEGIN IMMEDIATE", "COMMIT"]);
  });
});
