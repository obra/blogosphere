// ABOUTME: Tests for createStore's basic entry CRUD and listEntries ordering
// ABOUTME: (date desc, nulls last, then path; kind filter; deleted exclusion).

import { beforeEach, describe, expect, it } from "vitest";
import { createTestStore, makeEntry } from "./testHelpers";
import type { StoreApi } from "./types";

describe("createStore: getEntry", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("returns null for an unknown path", async () => {
    expect(await store.getEntry("nope.md")).toBeNull();
  });

  it("round-trips every field through upsert + get", async () => {
    const entry = makeEntry({
      path: "content/blog/2026/2026-07-15-full.md",
      kind: "draft",
      baseSha: "abc123",
      baseContent: "old content",
      workingContent: "new content",
      dirty: true,
      renamedFrom: "content/drafts/2026-07-14-full.md",
      title: "Full Round Trip",
      date: "2026-07-15",
      draft: true,
      opaqueId: "uuid-1234",
      updatedAt: 999,
    });

    await store.upsertEntry(entry);

    expect(await store.getEntry(entry.path)).toEqual(entry);
  });
});

describe("createStore: upsertEntry/removeEntry", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("upsert on an existing path updates in place rather than duplicating", async () => {
    await store.upsertEntry(makeEntry({ path: "a.md", title: "v1" }));
    await store.upsertEntry(makeEntry({ path: "a.md", title: "v2" }));

    const all = await store.listEntries();
    expect(all).toHaveLength(1);
    expect(all[0]?.title).toBe("v2");
  });

  it("upsertEntry never recomputes fields — it stores exactly what it's given", async () => {
    await store.upsertEntry(
      makeEntry({
        path: "a.md",
        title: "Stated Title",
        workingContent: "---\ntitle: Different\n---\nbody",
      }),
    );

    expect((await store.getEntry("a.md"))?.title).toBe("Stated Title");
  });

  it("removeEntry hard-deletes: getEntry and listEntries no longer see it", async () => {
    await store.upsertEntry(makeEntry({ path: "a.md" }));

    await store.removeEntry("a.md");

    expect(await store.getEntry("a.md")).toBeNull();
    expect(await store.listEntries()).toEqual([]);
  });

  it("removeEntry on an unknown path is a harmless no-op", async () => {
    await expect(store.removeEntry("nope.md")).resolves.toBeUndefined();
  });
});

describe("createStore: listEntries ordering", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("sorts by date desc, nulls last, then path asc", async () => {
    await store.upsertEntry(makeEntry({ path: "z-undated.md", date: null }));
    await store.upsertEntry(makeEntry({ path: "a-undated.md", date: null }));
    await store.upsertEntry(makeEntry({ path: "mid.md", date: "2026-06-01" }));
    await store.upsertEntry(makeEntry({ path: "newest.md", date: "2026-07-01" }));
    await store.upsertEntry(makeEntry({ path: "same-date-a.md", date: "2026-06-01" }));

    const paths = (await store.listEntries()).map((e) => e.path);

    expect(paths).toEqual([
      "newest.md",
      "mid.md",
      "same-date-a.md",
      "a-undated.md",
      "z-undated.md",
    ]);
  });

  it("filters by kind while preserving order", async () => {
    await store.upsertEntry(makeEntry({ path: "post-1.md", kind: "post", date: "2026-01-02" }));
    await store.upsertEntry(makeEntry({ path: "post-2.md", kind: "post", date: "2026-01-01" }));
    await store.upsertEntry(makeEntry({ path: "link-1.md", kind: "link", date: "2026-01-03" }));

    const posts = await store.listEntries("post");

    expect(posts.map((e) => e.path)).toEqual(["post-1.md", "post-2.md"]);
  });

  it("excludes deleted (tombstoned) entries", async () => {
    await store.upsertEntry(makeEntry({ path: "alive.md" }));
    await store.upsertEntry(makeEntry({ path: "gone.md", deleted: true }));

    expect((await store.listEntries()).map((e) => e.path)).toEqual(["alive.md"]);
  });
});
