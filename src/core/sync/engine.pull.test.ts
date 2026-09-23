// ABOUTME: Pull scenarios — clean fast-forward, remote-only change while dirty
// ABOUTME: elsewhere, non-overlapping automerge, and overlap -> conflict + resolution.
import { describe, expect, it } from "vitest";
import type { EntryRecord } from "../store/types";
import { META_LAST_SYNC_AT } from "./meta";
import { createHarness, type TestHarness } from "./testing/harness";

async function markDirty(
  harness: TestHarness,
  path: string,
  newWorkingContent: string,
): Promise<EntryRecord> {
  const entry = await harness.store.getEntry(path);
  if (!entry) {
    throw new Error(`test setup: no entry at ${path}`);
  }
  const updated: EntryRecord = { ...entry, workingContent: newWorkingContent, dirty: true };
  await harness.store.upsertEntry(updated);
  return updated;
}

describe("pull: clean fast-forward", () => {
  it("updates a clean entry in place when the remote changes it", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Original", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const edited = model.replaceBody(post.raw, "Body written elsewhere.\n");
    if (!edited.ok) {
      throw new Error(edited.error);
    }
    remote.pushExternalChange({ [post.path]: edited.raw });

    const result = await sync.pull();

    expect(result).toEqual({ updated: [post.path], merged: [], conflicts: [] });
    const entry = await store.getEntry(post.path);
    expect(entry?.dirty).toBe(false);
    expect(entry?.workingContent).toBe(edited.raw);
    expect(entry?.baseContent).toBe(edited.raw);
    expect(entry?.baseSha).toBe(remote.currentBlobSha(post.path));
  });

  it("is a no-op when the remote tree hasn't moved", async () => {
    const harness = await createHarness();
    const { remote, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Original", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const result = await sync.pull();
    expect(result).toEqual({ updated: [], merged: [], conflicts: [] });
  });

  it("records the check time even when the remote tree hasn't moved", async () => {
    const harness = await createHarness();
    const { remote, sync, model, store, clock } = harness;
    const post = model.newEntry({ kind: "post", title: "Original", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    clock.value += 60_000;
    await sync.pull();
    expect(await store.getMeta(META_LAST_SYNC_AT)).toBe(String(clock.value));
  });

  it("removes a clean entry the remote deleted", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Original", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    remote.pushExternalChange({ [post.path]: null });
    const result = await sync.pull();

    expect(result).toEqual({ updated: [post.path], merged: [], conflicts: [] });
    expect(await store.getEntry(post.path)).toBeNull();
  });
});

describe("pull: remote-only change while dirty elsewhere", () => {
  it("leaves the dirty entry untouched and fast-forwards only the clean one", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const a = model.newEntry({ kind: "post", title: "A", date: "2026-01-05" });
    const b = model.newEntry({ kind: "post", title: "B", date: "2026-01-06" });
    remote.initRepo({ [a.path]: a.raw, [b.path]: b.raw });
    await sync.bootstrap();

    const mineA = markDirty(harness, a.path, `${a.raw}Local edit to A, not yet pushed.\n`);
    await mineA;

    const bEdited = model.replaceBody(b.raw, "Someone else edited B.\n");
    if (!bEdited.ok) {
      throw new Error(bEdited.error);
    }
    remote.pushExternalChange({ [b.path]: bEdited.raw });

    const result = await sync.pull();

    expect(result).toEqual({ updated: [b.path], merged: [], conflicts: [] });

    const entryA = await store.getEntry(a.path);
    expect(entryA?.dirty).toBe(true);
    expect(entryA?.workingContent).toBe(`${a.raw}Local edit to A, not yet pushed.\n`);
    expect(entryA?.baseContent).toBe(a.raw);

    const entryB = await store.getEntry(b.path);
    expect(entryB?.dirty).toBe(false);
    expect(entryB?.workingContent).toBe(bEdited.raw);
  });
});

describe("pull: non-overlapping automerge", () => {
  it("merges disjoint local/remote edits, snapshots the pre-merge working copy, and stays pushable", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Original Title", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const mineEdit = model.applyEdits(post.raw, [{ field: "title", value: "My New Title" }]);
    if (!mineEdit.ok) {
      throw new Error(mineEdit.error);
    }
    await markDirty(harness, post.path, mineEdit.raw);

    const theirsEdit = model.replaceBody(post.raw, "Body written by someone else.\n");
    if (!theirsEdit.ok) {
      throw new Error(theirsEdit.error);
    }
    remote.pushExternalChange({ [post.path]: theirsEdit.raw });

    const result = await sync.pull();

    expect(result.merged).toEqual([post.path]);
    expect(result.conflicts).toEqual([]);

    const snapshots = await store.listSnapshots(post.path);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.reason).toBe("pre-merge");
    expect(snapshots[0]?.content).toBe(mineEdit.raw);

    const entry = await store.getEntry(post.path);
    expect(entry?.workingContent).toContain("My New Title");
    expect(entry?.workingContent).toContain("Body written by someone else.");
    expect(entry?.baseContent).toBe(theirsEdit.raw);
    expect(entry?.dirty).toBe(true); // merged content still differs from remote (title change survives)
    expect(entry?.title).toBe("My New Title");

    const pushResult = await sync.push();
    expect(pushResult.committed).toBe(true);
    const finalRemoteText = remote.readFile(post.path);
    expect(finalRemoteText).toContain("My New Title");
    expect(finalRemoteText).toContain("Body written by someone else.");
  });
});
