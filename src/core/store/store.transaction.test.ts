// ABOUTME: Tests for createStore's transaction() delegation (commit/rollback/
// ABOUTME: nesting) and init() idempotency at the StoreApi level.

// biome-ignore-all lint/suspicious/useAwait: store.transaction's callback contract
// is () => Promise<T>, matching real call sites; a callback that only throws has
// no internal await to add.

import { beforeEach, describe, expect, it } from "vitest";
import { createTestStore, makeEntry } from "./testHelpers";
import type { StoreApi } from "./types";

const NESTED_TX_ERROR_RE = /nested transactions/i;

describe("createStore: transaction", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("commits writes made inside a successful transaction", async () => {
    await store.transaction(async () => {
      await store.upsertEntry(makeEntry({ path: "a.md" }));
    });

    expect(await store.getEntry("a.md")).not.toBeNull();
  });

  it("rolls back every write made inside a transaction that throws", async () => {
    await store.upsertEntry(makeEntry({ path: "existing.md", title: "before" }));

    await expect(
      store.transaction(async () => {
        await store.upsertEntry(makeEntry({ path: "existing.md", title: "after" }));
        await store.upsertEntry(makeEntry({ path: "new.md" }));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect((await store.getEntry("existing.md"))?.title).toBe("before");
    expect(await store.getEntry("new.md")).toBeNull();
  });

  it("rejects nested transactions with a clear error", async () => {
    await expect(
      store.transaction(async () => {
        await store.transaction(async () => undefined);
      }),
    ).rejects.toThrow(NESTED_TX_ERROR_RE);
  });

  it("allows a fresh transaction to run after a prior one rolled back", async () => {
    await expect(
      store.transaction(async () => {
        throw new Error("first fails");
      }),
    ).rejects.toThrow("first fails");

    await store.transaction(async () => {
      await store.upsertEntry(makeEntry({ path: "a.md" }));
    });

    expect(await store.getEntry("a.md")).not.toBeNull();
  });
});

describe("createStore: init idempotency", () => {
  it("calling init() twice does not error, preserves existing data, and search still works", async () => {
    const { store } = await createTestStore();
    await store.upsertEntry(makeEntry({ path: "a.md", title: "Findable Title" }));

    await store.init();

    expect(await store.getEntry("a.md")).not.toBeNull();
    expect((await store.searchEntries("Findable")).map((e) => e.path)).toEqual(["a.md"]);
  });
});
