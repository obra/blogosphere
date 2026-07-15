// ABOUTME: Bootstrap scenario — initial full sync of a fresh database from a
// ABOUTME: seeded remote populates clean entries and sync meta.
import { describe, expect, it } from "vitest";
import {
  META_ASSETS_INDEX,
  META_LAST_REMOTE_COMMIT_SHA,
  META_LAST_ROOT_TREE_SHA,
  META_LAST_SYNC_AT,
} from "./meta";
import { createHarness } from "./testing/harness";

describe("bootstrap: entries", () => {
  it("upserts a clean entry for every managed markdown path and ignores the rest", async () => {
    const { remote, store, sync, model } = await createHarness();

    const post = model.newEntry({ kind: "post", title: "Hello World", date: "2026-01-05" });
    const draft = model.newEntry({ kind: "draft", title: "WIP Thoughts", date: "2026-01-06" });
    const link = model.newEntry({
      kind: "link",
      title: "Cool Link",
      date: "2026-01-07",
      url: "https://example.com",
    });
    const seededManaged = [post, draft, link];

    remote.initRepo({
      [post.path]: post.raw,
      [draft.path]: draft.raw,
      [link.path]: link.raw,
      "content/assets/2026/01/photo.png": "not-real-png-bytes",
      "README.md": "# Not managed by the client\n",
    });

    await sync.bootstrap();

    const entries = await store.listEntries();
    expect(entries).toHaveLength(seededManaged.length);

    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    const postEntry = byPath.get(post.path);
    expect(postEntry).toBeDefined();
    expect(postEntry?.kind).toBe("post");
    expect(postEntry?.title).toBe("Hello World");
    expect(postEntry?.date).toBe("2026-01-05");
    expect(postEntry?.dirty).toBe(false);
    expect(postEntry?.deleted).toBe(false);
    expect(postEntry?.baseContent).toBe(post.raw);
    expect(postEntry?.workingContent).toBe(post.raw);
    expect(postEntry?.baseSha).toBe(remote.currentBlobSha(post.path));

    const draftEntry = byPath.get(draft.path);
    expect(draftEntry?.kind).toBe("draft");
    expect(draftEntry?.draft).toBe(true);

    const linkEntry = byPath.get(link.path);
    expect(linkEntry?.kind).toBe("link");

    // README.md and the asset are not markdown entries under a managed root.
    expect(byPath.has("README.md")).toBe(false);
    expect(byPath.has("content/assets/2026/01/photo.png")).toBe(false);
  });
});

describe("bootstrap: meta and status", () => {
  it("records sync meta and the assets index, and leaves status idle with nothing pending", async () => {
    const { remote, store, sync, model } = await createHarness();
    const post = model.newEntry({ kind: "post", title: "Hello", date: "2026-01-05" });
    const initialCommit = remote.initRepo({
      [post.path]: post.raw,
      "content/assets/2026/01/photo.png": "bytes",
    });

    await sync.bootstrap();

    expect(await store.getMeta(META_LAST_ROOT_TREE_SHA)).not.toBeNull();
    expect(await store.getMeta(META_LAST_REMOTE_COMMIT_SHA)).toBe(initialCommit);
    expect(await store.getMeta(META_LAST_SYNC_AT)).not.toBeNull();

    const assetsIndexRaw = await store.getMeta(META_ASSETS_INDEX);
    expect(assetsIndexRaw).not.toBeNull();
    const assetsIndex: unknown = JSON.parse(assetsIndexRaw ?? "[]");
    expect(assetsIndex).toEqual([
      {
        path: "content/assets/2026/01/photo.png",
        sha: remote.currentBlobSha("content/assets/2026/01/photo.png"),
      },
    ]);

    const status = sync.status();
    expect(status.state).toBe("idle");
    expect(status.pendingCount).toBe(0);
    expect(status.conflicts).toEqual([]);
    expect(status.lastSyncAt).not.toBeNull();
  });

  it("notifies onStatus subscribers through the syncing -> idle cycle", async () => {
    const { remote, sync, model } = await createHarness();
    const post = model.newEntry({ kind: "post", title: "Hello", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });

    const seen: string[] = [];
    const unsubscribe = sync.onStatus((status) => seen.push(status.state));

    await sync.bootstrap();
    unsubscribe();

    expect(seen).toEqual(["syncing", "idle"]);
  });
});
