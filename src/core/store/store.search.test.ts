// ABOUTME: Tests for createStore's searchEntries — FTS5 matching/AND-semantics/
// ABOUTME: trigger sync, and the LIKE fallback forced via an FTS5-probe-failing driver.

import { beforeEach, describe, expect, it } from "vitest";
import { byString, createTestStore, createTestStoreWithoutFts, makeEntry } from "./testHelpers";
import type { StoreApi } from "./types";

describe("createStore: search with FTS5", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("matches on title or body text, case-insensitively, excluding deleted entries", async () => {
    await store.upsertEntry(
      makeEntry({ path: "a.md", title: "Hiking the Alps", workingContent: "steep trails" }),
    );
    await store.upsertEntry(
      makeEntry({ path: "b.md", title: "Cooking pasta", workingContent: "boil water, add salt" }),
    );
    await store.upsertEntry(
      makeEntry({ path: "c.md", title: "hiking gone", workingContent: "old post", deleted: true }),
    );

    expect((await store.searchEntries("hiking")).map((e) => e.path)).toEqual(["a.md"]);
    expect((await store.searchEntries("SALT")).map((e) => e.path)).toEqual(["b.md"]);
    expect(await store.searchEntries("nonexistentword")).toEqual([]);
  });

  it("requires all query tokens to match (AND semantics)", async () => {
    await store.upsertEntry(
      makeEntry({ path: "a.md", title: "red fox", workingContent: "runs fast" }),
    );
    await store.upsertEntry(
      makeEntry({ path: "b.md", title: "red herring", workingContent: "a distraction" }),
    );

    expect((await store.searchEntries("red fox")).map((e) => e.path)).toEqual(["a.md"]);
    expect((await store.searchEntries("red")).map((e) => e.path).sort(byString)).toEqual([
      "a.md",
      "b.md",
    ]);
  });

  it("returns [] for an empty or whitespace-only query", async () => {
    await store.upsertEntry(makeEntry({ path: "a.md" }));

    expect(await store.searchEntries("")).toEqual([]);
    expect(await store.searchEntries("   ")).toEqual([]);
  });

  it("tolerates quote characters and FTS operator words in the query without throwing", async () => {
    await store.upsertEntry(makeEntry({ path: "a.md", title: "hello world" }));

    const results = await store.searchEntries('hello" world OR NEAR NOT');

    expect(Array.isArray(results)).toBe(true);
  });
});

describe("createStore: search index stays in sync via triggers", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("reflects edits: changing working_content changes what matches", async () => {
    await store.upsertEntry(
      makeEntry({ path: "a.md", title: "t", workingContent: "original wording" }),
    );
    expect((await store.searchEntries("original")).map((e) => e.path)).toEqual(["a.md"]);

    await store.upsertEntry(
      makeEntry({ path: "a.md", title: "t", workingContent: "revised wording" }),
    );

    expect(await store.searchEntries("original")).toEqual([]);
    expect((await store.searchEntries("revised")).map((e) => e.path)).toEqual(["a.md"]);
  });

  it("stops matching once an entry is hard-removed", async () => {
    await store.upsertEntry(makeEntry({ path: "a.md", title: "findme" }));
    expect((await store.searchEntries("findme")).map((e) => e.path)).toEqual(["a.md"]);

    await store.removeEntry("a.md");

    expect(await store.searchEntries("findme")).toEqual([]);
  });
});

describe("createStore: search falls back to LIKE when FTS5 is unavailable", () => {
  it("forces the fallback via a driver stub whose FTS5 probe fails, and still finds correct matches", async () => {
    const { real, store } = await createTestStoreWithoutFts();

    // Confirm the fallback actually engaged, not just that search "worked".
    const ftsTables = await real.select(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entries_fts'",
    );
    expect(ftsTables).toEqual([]);

    await store.upsertEntry(
      makeEntry({ path: "a.md", title: "Hiking the Alps", workingContent: "steep trails" }),
    );
    await store.upsertEntry(
      makeEntry({ path: "b.md", title: "Cooking pasta", workingContent: "boil water" }),
    );
    await store.upsertEntry(
      makeEntry({ path: "c.md", title: "hiking gone", workingContent: "old post", deleted: true }),
    );

    expect((await store.searchEntries("hiking")).map((e) => e.path)).toEqual(["a.md"]);
    expect((await store.searchEntries("BOIL")).map((e) => e.path)).toEqual(["b.md"]);
    expect(await store.searchEntries("nonexistentword")).toEqual([]);
    expect(await store.searchEntries("")).toEqual([]);
  });
});
