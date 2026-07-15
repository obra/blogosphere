// ABOUTME: Overlapping-edit conflict detection and all three resolveConflict
// ABOUTME: paths (mine / theirs / content), plus the remote-delete-vs-dirty case.
import { describe, expect, it } from "vitest";
import { getConflictRemote } from "./meta";
import { createHarness, type TestHarness } from "./testing/harness";

interface ConflictFixture {
  harness: TestHarness;
  path: string;
  originalRaw: string;
  mineRaw: string;
  theirsRaw: string;
}

/** Bootstraps one post, then has "mine" (local, unpushed) and "theirs" (remote)
 *  edit the *same* title line to different values, and pulls — landing a
 *  genuine overlap conflict for tests to resolve however they like. */
async function setupOverlappingConflict(): Promise<ConflictFixture> {
  const harness = await createHarness();
  const { remote, store, sync, model } = harness;
  const post = model.newEntry({ kind: "post", title: "Original Title", date: "2026-01-05" });
  remote.initRepo({ [post.path]: post.raw });
  await sync.bootstrap();

  const mineEdit = model.applyEdits(post.raw, [{ field: "title", value: "Mine Title" }]);
  if (!mineEdit.ok) {
    throw new Error(mineEdit.error);
  }
  const entry = await store.getEntry(post.path);
  if (!entry) {
    throw new Error("test setup: missing bootstrapped entry");
  }
  await store.upsertEntry({
    ...entry,
    workingContent: mineEdit.raw,
    dirty: true,
    title: "Mine Title",
  });

  const theirsEdit = model.applyEdits(post.raw, [{ field: "title", value: "Theirs Title" }]);
  if (!theirsEdit.ok) {
    throw new Error(theirsEdit.error);
  }
  remote.pushExternalChange({ [post.path]: theirsEdit.raw });

  await sync.pull();

  return {
    harness,
    path: post.path,
    originalRaw: post.raw,
    mineRaw: mineEdit.raw,
    theirsRaw: theirsEdit.raw,
  };
}

describe("pull: overlapping edit -> conflict", () => {
  it("flags the path as conflicted without touching base or working content", async () => {
    const { harness, path, originalRaw, mineRaw } = await setupOverlappingConflict();
    const { store, sync } = harness;

    const status = sync.status();
    expect(status.state).toBe("conflict");
    expect(status.conflicts).toEqual([path]);

    const entry = await store.getEntry(path);
    expect(entry?.dirty).toBe(true);
    expect(entry?.workingContent).toBe(mineRaw);
    expect(entry?.baseContent).toBe(originalRaw);
  });

  it("stashes the actual conflicting remote text, since baseContent stays at the old shared base", async () => {
    const { harness, path, theirsRaw } = await setupOverlappingConflict();
    const { store, remote } = harness;

    const stash = await getConflictRemote(store, path);
    expect(stash).toEqual({ sha: remote.currentBlobSha(path), text: theirsRaw });
  });

  it("excludes conflicted paths from push until resolved", async () => {
    const { harness } = await setupOverlappingConflict();
    const result = await harness.sync.push();
    expect(result.committed).toBe(false);
    expect(result.conflicts).toHaveLength(1);
  });
});

describe("resolveConflict: mine", () => {
  it("keeps working content, rebases onto current remote, and can then push", async () => {
    const { harness, path, mineRaw, theirsRaw } = await setupOverlappingConflict();
    const { store, sync, remote } = harness;

    await sync.resolveConflict(path, { choose: "mine" });

    const entry = await store.getEntry(path);
    expect(entry?.workingContent).toBe(mineRaw);
    expect(entry?.baseContent).toBe(theirsRaw);
    expect(entry?.baseSha).toBe(remote.currentBlobSha(path));
    expect(entry?.dirty).toBe(true);
    expect(sync.status().conflicts).toEqual([]);

    const pushResult = await sync.push();
    expect(pushResult.committed).toBe(true);
    expect(remote.readFile(path)).toBe(mineRaw);
  });

  it("clears the stashed conflicting remote text", async () => {
    const { harness, path } = await setupOverlappingConflict();
    const { store, sync } = harness;

    await sync.resolveConflict(path, { choose: "mine" });

    expect(await getConflictRemote(store, path)).toBeNull();
  });
});

describe("resolveConflict: theirs", () => {
  it("takes the remote content and becomes clean", async () => {
    const { harness, path, theirsRaw } = await setupOverlappingConflict();
    const { store, sync } = harness;

    await sync.resolveConflict(path, { choose: "theirs" });

    const entry = await store.getEntry(path);
    expect(entry?.workingContent).toBe(theirsRaw);
    expect(entry?.baseContent).toBe(theirsRaw);
    expect(entry?.dirty).toBe(false);
    expect(sync.status().conflicts).toEqual([]);
    expect(sync.status().pendingCount).toBe(0);
    expect(await getConflictRemote(store, path)).toBeNull();
  });
});

describe("resolveConflict: content", () => {
  it("saves the caller-supplied content as the new working copy, still dirty", async () => {
    const { harness, path } = await setupOverlappingConflict();
    const { store, sync, remote } = harness;

    const custom =
      "---\ntype: post\ntitle: Hand-Resolved\ndate: 2026-01-05\n---\n\nResolved by hand.\n";
    await sync.resolveConflict(path, { choose: "content", content: custom });

    const entry = await store.getEntry(path);
    expect(entry?.workingContent).toBe(custom);
    expect(entry?.dirty).toBe(true);
    expect(entry?.title).toBe("Hand-Resolved");
    expect(sync.status().conflicts).toEqual([]);
    expect(await getConflictRemote(store, path)).toBeNull();

    const pushResult = await sync.push();
    expect(pushResult.committed).toBe(true);
    expect(remote.readFile(path)).toBe(custom);
  });
});

describe("pull: remote deletion of a dirty entry", () => {
  it("conflicts rather than silently discarding the local edit", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Keep me", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const entry = await store.getEntry(post.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({
      ...entry,
      workingContent: `${post.raw}local addition\n`,
      dirty: true,
    });

    remote.pushExternalChange({ [post.path]: null });
    const result = await sync.pull();

    expect(result.conflicts).toEqual([post.path]);
    const conflictedEntry = await store.getEntry(post.path);
    expect(conflictedEntry?.deleted).toBe(false);
    expect(conflictedEntry?.workingContent).toBe(`${post.raw}local addition\n`);

    // "Theirs" is a deletion: no sha, no text — distinguishable from "the
    // stash is simply missing" (null) so the UI can tell the two apart.
    expect(await getConflictRemote(store, post.path)).toEqual({ sha: null, text: "" });
  });

  it("choosing theirs on a remote deletion accepts it by removing the local row", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Keep me", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const entry = await store.getEntry(post.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({
      ...entry,
      workingContent: `${post.raw}local addition\n`,
      dirty: true,
    });
    remote.pushExternalChange({ [post.path]: null });
    await sync.pull();

    await sync.resolveConflict(post.path, { choose: "theirs" });

    expect(await store.getEntry(post.path)).toBeNull();
    expect(sync.status().conflicts).toEqual([]);
    expect(await getConflictRemote(store, post.path)).toBeNull();
  });
});
