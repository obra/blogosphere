// ABOUTME: Tests for createStore's dirty, tombstone, and renamedFrom lifecycles —
// ABOUTME: the per-entry sync state the sync engine reads to decide what to push.

import { beforeEach, describe, expect, it } from "vitest";
import { byString, createTestStore, makeEntry } from "./testHelpers";
import type { StoreApi } from "./types";

describe("createStore: dirty lifecycle", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("listDirty is empty when no entry is dirty or deleted", async () => {
    await store.upsertEntry(makeEntry({ path: "clean.md", dirty: false, deleted: false }));

    expect(await store.listDirty()).toEqual([]);
  });

  it("listDirty includes dirty entries, which remain visible in listEntries too", async () => {
    await store.upsertEntry(makeEntry({ path: "dirty.md", dirty: true }));

    expect((await store.listDirty()).map((e) => e.path)).toEqual(["dirty.md"]);
    expect((await store.listEntries()).map((e) => e.path)).toEqual(["dirty.md"]);
  });
});

describe("createStore: tombstone lifecycle", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("a tombstone is dirty-listed and still gettable, but hidden from listEntries, until hard removed", async () => {
    await store.upsertEntry(makeEntry({ path: "a.md", dirty: false }));
    await store.upsertEntry(makeEntry({ path: "a.md", dirty: true, deleted: true }));

    expect(await store.getEntry("a.md")).toMatchObject({ deleted: true, dirty: true });
    expect(await store.listEntries()).toEqual([]);
    expect((await store.listDirty()).map((e) => e.path)).toEqual(["a.md"]);

    await store.removeEntry("a.md");

    expect(await store.getEntry("a.md")).toBeNull();
    expect(await store.listDirty()).toEqual([]);
  });
});

describe("createStore: renamedFrom lifecycle", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("a rename is a tombstone at the old path plus a new record pointing back via renamedFrom", async () => {
    await store.upsertEntry(makeEntry({ path: "old.md", title: "Moving" }));

    // What the model/sync layer does for a rename: tombstone the old path,
    // write the new path with renamedFrom set. The store neither infers nor
    // enforces this relationship — callers own it.
    await store.upsertEntry(
      makeEntry({ path: "old.md", title: "Moving", dirty: true, deleted: true }),
    );
    await store.upsertEntry(
      makeEntry({ path: "new.md", title: "Moving", dirty: true, renamedFrom: "old.md" }),
    );

    expect((await store.getEntry("new.md"))?.renamedFrom).toBe("old.md");
    expect((await store.listEntries()).map((e) => e.path)).toEqual(["new.md"]);
    expect((await store.listDirty()).map((e) => e.path).sort(byString)).toEqual([
      "new.md",
      "old.md",
    ]);
  });
});
