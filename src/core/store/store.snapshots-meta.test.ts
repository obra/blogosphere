// ABOUTME: Tests for createStore's snapshots (pre-merge/pre-publish/manual history)
// ABOUTME: and meta (small key/value settings) methods.

import { beforeEach, describe, expect, it } from "vitest";
import { createTestStore } from "./testHelpers";
import type { StoreApi } from "./types";

describe("createStore: snapshots", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("listSnapshots returns [] for a path with none", async () => {
    expect(await store.listSnapshots("nope.md")).toEqual([]);
  });

  it("saveSnapshot accumulates history, newest first, scoped by path", async () => {
    await store.saveSnapshot("a.md", "v1", "pre-merge");
    await store.saveSnapshot("a.md", "v2", "manual");
    await store.saveSnapshot("b.md", "other", "pre-publish");

    const snapshots = await store.listSnapshots("a.md");

    expect(snapshots.map((s) => s.content)).toEqual(["v2", "v1"]);
    expect(snapshots.map((s) => s.reason)).toEqual(["manual", "pre-merge"]);
    expect(snapshots.every((s) => s.path === "a.md")).toBe(true);
    expect(new Set(snapshots.map((s) => s.id)).size).toBe(2);
  });
});

describe("createStore: meta", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("getMeta returns null for an unset key", async () => {
    expect(await store.getMeta("lastSyncAt")).toBeNull();
  });

  it("setMeta then getMeta round-trips, and overwrites on repeat calls", async () => {
    await store.setMeta("lastSyncAt", "100");
    expect(await store.getMeta("lastSyncAt")).toBe("100");

    await store.setMeta("lastSyncAt", "200");
    expect(await store.getMeta("lastSyncAt")).toBe("200");
  });

  it("setMeta with a null value reads back as null", async () => {
    await store.setMeta("k", "v");

    await store.setMeta("k", null);

    expect(await store.getMeta("k")).toBeNull();
  });
});
