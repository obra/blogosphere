// ABOUTME: Push scenarios — validation gating, outbox assets riding the
// ABOUTME: commit, and commit message batching (including "Sync: N changes").
import { describe, expect, it } from "vitest";
import { baseEntry, commitMessageFor } from "./testing/fixtures";
import { createHarness } from "./testing/harness";

describe("push: validation failure", () => {
  it("aborts without committing and reports an error status", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    // Valid front matter, but an invalid (non-dated) filename — validateForCommit
    // rejects this on the filename-pattern check.
    const created = model.newEntry({ kind: "post", title: "Bad Path", date: "2026-01-10" });
    const badPath = "content/blog/2026/not-a-dated-filename.md";
    await store.upsertEntry(
      baseEntry({ path: badPath, kind: "post", workingContent: created.raw, title: "Bad Path" }),
    );

    const refBefore = await remote.getRef();
    const result = await sync.push();

    expect(result.committed).toBe(false);
    expect(await remote.getRef()).toBe(refBefore);
    expect(remote.readFile(badPath)).toBeNull();

    const status = sync.status();
    expect(status.state).toBe("error");
    expect(status.message).toBeDefined();

    const entry = await store.getEntry(badPath);
    expect(entry?.dirty).toBe(true);
  });
});

describe("push: outbox asset", () => {
  it("uploads the asset blob in the same commit as the entry that references it", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model, setAssetBytes } = harness;
    const post = model.newEntry({ kind: "post", title: "With Image", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const withImage = `${post.raw}![alt](/assets/2026/01/pasted.png)\n`;
    const entry = await store.getEntry(post.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...entry, workingContent: withImage, dirty: true });

    const assetLocalPath = "/local/cache/pasted.png";
    const assetRepoPath = "content/assets/2026/01/pasted.png";
    setAssetBytes(assetLocalPath, "fake-png-bytes");
    await store.addAsset({
      repoPath: assetRepoPath,
      localPath: assetLocalPath,
      entryPath: post.path,
      createdAt: harness.clock.value,
    });

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(remote.readFile(post.path)).toBe(withImage);
    expect(remote.readFile(assetRepoPath)).toBe("fake-png-bytes");
    expect(await store.listAssetsFor([post.path])).toEqual([]);

    // Both files must have landed in the very same commit/tree.
    const commit = result.commitSha ? await remote.getCommit(result.commitSha) : null;
    expect(commit).not.toBeNull();
    const tree = commit ? await remote.getTreeRecursive(commit.treeSha) : [];
    const paths = tree.map((entry_) => entry_.path);
    expect(paths).toContain(post.path);
    expect(paths).toContain(assetRepoPath);
  });
});

describe("push: outbox asset for an entry deleted before it was ever pushed", () => {
  it("skips uploading the asset and removes its outbox row instead of leaking it", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model, setAssetBytes } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    const draft = model.newEntry({ kind: "draft", title: "Doomed Draft", date: "2026-01-05" });
    const withImage = `${draft.raw}![alt](/assets/2026/01/pasted.png)\n`;
    await store.upsertEntry(
      baseEntry({
        path: draft.path,
        kind: "draft",
        workingContent: withImage,
        title: "Doomed Draft",
      }),
    );

    const assetLocalPath = "/local/cache/pasted.png";
    const assetRepoPath = "content/assets/2026/01/pasted.png";
    setAssetBytes(assetLocalPath, "fake-png-bytes");
    await store.addAsset({
      repoPath: assetRepoPath,
      localPath: assetLocalPath,
      entryPath: draft.path,
      createdAt: harness.clock.value,
    });

    // Deleted before the draft (or its image) was ever pushed.
    const entry = await store.getEntry(draft.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...entry, deleted: true, dirty: true });

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(remote.readFile(assetRepoPath)).toBeNull();
    expect(await store.listAssetsFor([draft.path])).toEqual([]);
  });
});

describe("push: commit message batching", () => {
  it("uses the generic Sync: N changes summary for multiple unrelated entries", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    const one = model.newEntry({ kind: "post", title: "One", date: "2026-01-10" });
    const two = model.newEntry({ kind: "post", title: "Two", date: "2026-01-11" });
    const three = model.newEntry({ kind: "draft", title: "Three", date: "2026-01-12" });
    await store.upsertEntry(
      baseEntry({ path: one.path, kind: "post", workingContent: one.raw, title: "One" }),
    );
    await store.upsertEntry(
      baseEntry({ path: two.path, kind: "post", workingContent: two.raw, title: "Two" }),
    );
    await store.upsertEntry(
      baseEntry({ path: three.path, kind: "draft", workingContent: three.raw, title: "Three" }),
    );

    const result = await sync.push();
    expect(result.committed).toBe(true);
    expect(await commitMessageFor(remote, result)).toBe("Sync: 3 changes");
  });

  it("returns committed: false when there is nothing dirty to push", async () => {
    const harness = await createHarness();
    const { remote, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Clean", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const result = await sync.push();
    expect(result).toEqual({ committed: false, retries: 0, conflicts: [] });
  });
});
