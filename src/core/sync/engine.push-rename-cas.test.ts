// ABOUTME: Push scenarios — rename (old path deleted + new path added in one
// ABOUTME: commit) and CAS retry (remote advances mid-push, never forcing).
import { describe, expect, it } from "vitest";
import { baseEntry, commitMessageFor } from "./testing/fixtures";
import { createHarness } from "./testing/harness";

describe("push: rename", () => {
  it("deletes the old path and adds the new path in a single commit", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const oldEntry = model.newEntry({ kind: "post", title: "Renamed Post", date: "2026-01-05" });
    remote.initRepo({ [oldEntry.path]: oldEntry.raw });
    await sync.bootstrap();

    const existing = await store.getEntry(oldEntry.path);
    if (!existing) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...existing, deleted: true, dirty: true });

    const renamed = model.newEntry({ kind: "post", title: "Renamed Post", date: "2026-01-06" });
    await store.upsertEntry(
      baseEntry({
        path: renamed.path,
        kind: "post",
        workingContent: renamed.raw,
        renamedFrom: oldEntry.path,
        title: "Renamed Post",
      }),
    );

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(result.retries).toBe(0);
    expect(await commitMessageFor(remote, result)).toBe("Sync: 2 changes");

    expect(remote.readFile(oldEntry.path)).toBeNull();
    expect(remote.readFile(renamed.path)).toBe(renamed.raw);
    expect(await store.getEntry(oldEntry.path)).toBeNull();
    const newRow = await store.getEntry(renamed.path);
    expect(newRow?.dirty).toBe(false);
    expect(newRow?.renamedFrom).toBeNull();
  });
});

describe("push: rename (renamedFrom only, no separate tombstone row)", () => {
  it("also deletes the old path when only renamedFrom names it", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const oldEntry = model.newEntry({ kind: "post", title: "Solo Rename", date: "2026-01-05" });
    remote.initRepo({ [oldEntry.path]: oldEntry.raw });
    await sync.bootstrap();

    const renamed = model.newEntry({ kind: "post", title: "Solo Rename", date: "2026-01-07" });
    await store.upsertEntry(
      baseEntry({
        path: renamed.path,
        kind: "post",
        workingContent: renamed.raw,
        renamedFrom: oldEntry.path,
        title: "Solo Rename",
      }),
    );
    // The old row still exists but was never itself marked dirty/deleted —
    // push must still remove it via renamedFrom alone.
    await store.removeEntry(oldEntry.path);

    const result = await sync.push();
    expect(result.committed).toBe(true);
    expect(remote.readFile(oldEntry.path)).toBeNull();
    expect(remote.readFile(renamed.path)).toBe(renamed.raw);
  });
});

describe("push: rename where the new path races an independent remote write", () => {
  it("holds back the whole rename instead of committing only the old-path delete", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const oldEntry = model.newEntry({ kind: "post", title: "Move Me", date: "2026-01-05" });
    remote.initRepo({ [oldEntry.path]: oldEntry.raw });
    await sync.bootstrap();

    const existing = await store.getEntry(oldEntry.path);
    if (!existing) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...existing, deleted: true, dirty: true });

    const renamed = model.newEntry({ kind: "post", title: "Move Me", date: "2026-01-06" });
    await store.upsertEntry(
      baseEntry({
        path: renamed.path,
        kind: "post",
        workingContent: renamed.raw,
        renamedFrom: oldEntry.path,
        title: "Move Me",
      }),
    );

    // Someone else's commit lands at the *new* path before we push.
    remote.pushExternalChange({ [renamed.path]: "Someone else's unrelated content" });

    const result = await sync.push();

    expect(result.committed).toBe(false);
    expect(result.conflicts).toContain(renamed.path);
    // The old path must survive: committing only its delete (because the new
    // path is excluded as conflicted) would silently drop the renamed
    // content while still destroying the original file — a partial rename.
    expect(remote.readFile(oldEntry.path)).toBe(oldEntry.raw);
    expect(remote.readFile(renamed.path)).toBe("Someone else's unrelated content");

    const oldRow = await store.getEntry(oldEntry.path);
    expect(oldRow?.dirty).toBe(true);
    expect(oldRow?.deleted).toBe(true);
  });
});

describe("push: rename where the old path races an independent remote edit", () => {
  it("holds back the whole rename instead of destroying the old path's concurrent edit", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const oldEntry = model.newEntry({ kind: "post", title: "Original", date: "2026-01-05" });
    remote.initRepo({ [oldEntry.path]: oldEntry.raw });
    await sync.bootstrap();

    const existing = await store.getEntry(oldEntry.path);
    if (!existing) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...existing, deleted: true, dirty: true });

    const renamed = model.newEntry({ kind: "post", title: "Original", date: "2026-01-06" });
    await store.upsertEntry(
      baseEntry({
        path: renamed.path,
        kind: "post",
        workingContent: renamed.raw,
        renamedFrom: oldEntry.path,
        title: "Original",
      }),
    );

    // Someone else edits the *old* path directly on the remote before we push.
    const editedOld = model.replaceBody(oldEntry.raw, "Edited concurrently on remote.\n");
    if (!editedOld.ok) {
      throw new Error(editedOld.error);
    }
    remote.pushExternalChange({ [oldEntry.path]: editedOld.raw });

    const result = await sync.push();

    expect(result.committed).toBe(false);
    expect(result.conflicts).toContain(oldEntry.path);
    // The concurrent edit at the old path must survive — deleting it via the
    // renamedFrom side-channel would destroy it in the very push whose own
    // result reports that path as unresolved.
    expect(remote.readFile(oldEntry.path)).toBe(editedOld.raw);
    // And the new path must not go live while its paired delete is stuck.
    expect(remote.readFile(renamed.path)).toBeNull();
  });
});

describe("push: rename/publish onto a path that already has different remote content", () => {
  it("refuses to push rather than silently overwriting the other entry's content", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const existingPost = model.newEntry({
      kind: "post",
      title: "Original Post",
      date: "2026-06-01",
    });
    const originalBody = model.replaceBody(
      existingPost.raw,
      "ORIGINAL POST -- DO NOT LOSE THIS.\n",
    );
    if (!originalBody.ok) {
      throw new Error(originalBody.error);
    }
    remote.initRepo({ [existingPost.path]: originalBody.raw });
    await sync.bootstrap();

    // A completely unrelated local draft gets renamed/published onto the
    // exact same computed path (e.g. a coincidental title/date match) —
    // bypassing whatever app-level guard would normally catch this, exactly
    // as a lower-level store mutation or a future caller of the rename
    // plumbing could.
    const draft = model.newEntry({ kind: "draft", title: "Some Draft", date: "2026-01-01" });
    await store.upsertEntry(
      baseEntry({
        path: draft.path,
        kind: "draft",
        workingContent: draft.raw,
        title: "Some Draft",
        draft: true,
      }),
    );
    const draftEntry = await store.getEntry(draft.path);
    if (!draftEntry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...draftEntry, deleted: true, dirty: true });

    const collidingRaw = model.replaceBody(
      existingPost.raw,
      "DRAFT CONTENT -- SHOULD NOT OVERWRITE.\n",
    );
    if (!collidingRaw.ok) {
      throw new Error(collidingRaw.error);
    }
    await store.upsertEntry(
      baseEntry({
        path: existingPost.path,
        kind: "post",
        workingContent: collidingRaw.raw,
        renamedFrom: draft.path,
        title: "Original Post",
      }),
    );

    const result = await sync.push();

    expect(result.committed).toBe(false);
    // Nothing was pushed, so the retry loop must not have kept spinning on
    // this fatal, non-CAS failure.
    expect(result.retries).toBe(0);
    expect(remote.readFile(existingPost.path)).toBe(originalBody.raw);
  });
});

describe("push: CAS retry", () => {
  it("retries exactly once and succeeds when the remote advances mid-push, without forcing", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const mine = model.newEntry({ kind: "post", title: "Mine", date: "2026-01-05" });
    const other = model.newEntry({ kind: "post", title: "Other", date: "2026-01-06" });
    remote.initRepo({ [mine.path]: mine.raw, [other.path]: other.raw });
    await sync.bootstrap();

    const entry = await store.getEntry(mine.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({
      ...entry,
      workingContent: `${mine.raw}my local edit\n`,
      dirty: true,
    });

    const otherEdited = model.replaceBody(other.raw, "raced in from elsewhere\n");
    if (!otherEdited.ok) {
      throw new Error(otherEdited.error);
    }
    remote.raceOnNextUpdateRef({ [other.path]: otherEdited.raw });

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(result.retries).toBe(1);
    expect(remote.readFile(mine.path)).toBe(`${mine.raw}my local edit\n`);
    expect(remote.readFile(other.path)).toBe(otherEdited.raw);
  });
});
