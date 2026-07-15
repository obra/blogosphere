// ABOUTME: Tests for createStore's outbox asset methods — addAsset/listAssetsFor/
// ABOUTME: removeAsset, including the [] short-circuit and upsert-by-repoPath.

import { beforeEach, describe, expect, it } from "vitest";
import { byString, createTestStore } from "./testHelpers";
import type { StoreApi } from "./types";

describe("createStore: listAssetsFor", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("short-circuits to [] for an empty path list, without querying", async () => {
    expect(await store.listAssetsFor([])).toEqual([]);
  });

  it("addAsset then listAssetsFor round-trips", async () => {
    const asset = {
      repoPath: "content/assets/2026/07/pasted-image-20260715-100000.png",
      localPath: "/tmp/cache/pasted-image-20260715-100000.png",
      entryPath: "content/blog/2026/2026-07-15-post.md",
      createdAt: 123,
    };

    await store.addAsset(asset);

    expect(await store.listAssetsFor([asset.entryPath])).toEqual([asset]);
    expect(await store.listAssetsFor(["other/path.md"])).toEqual([]);
  });

  it("returns assets for any of several entry paths", async () => {
    await store.addAsset({
      repoPath: "r1.png",
      localPath: "/l1",
      entryPath: "e1.md",
      createdAt: 1,
    });
    await store.addAsset({
      repoPath: "r2.png",
      localPath: "/l2",
      entryPath: "e2.md",
      createdAt: 2,
    });
    await store.addAsset({
      repoPath: "r3.png",
      localPath: "/l3",
      entryPath: "e3.md",
      createdAt: 3,
    });

    const found = await store.listAssetsFor(["e1.md", "e3.md"]);

    expect(found.map((a) => a.repoPath).sort(byString)).toEqual(["r1.png", "r3.png"]);
  });
});

describe("createStore: addAsset/removeAsset", () => {
  let store: StoreApi;

  beforeEach(async () => {
    ({ store } = await createTestStore());
  });

  it("addAsset on an existing repoPath overwrites rather than duplicating", async () => {
    await store.addAsset({ repoPath: "r.png", localPath: "/v1", entryPath: "e.md", createdAt: 1 });
    await store.addAsset({ repoPath: "r.png", localPath: "/v2", entryPath: "e.md", createdAt: 2 });

    expect(await store.listAssetsFor(["e.md"])).toEqual([
      { repoPath: "r.png", localPath: "/v2", entryPath: "e.md", createdAt: 2 },
    ]);
  });

  it("removeAsset removes it, and is a harmless no-op for an unknown repoPath", async () => {
    await store.addAsset({ repoPath: "r.png", localPath: "/v1", entryPath: "e.md", createdAt: 1 });

    await store.removeAsset("r.png");

    expect(await store.listAssetsFor(["e.md"])).toEqual([]);
    await expect(store.removeAsset("nope.png")).resolves.toBeUndefined();
  });
});
