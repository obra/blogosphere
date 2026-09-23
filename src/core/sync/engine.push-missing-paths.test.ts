// ABOUTME: Push scenarios where a deletion names a path GitHub doesn't have
// ABOUTME: (never-pushed drafts, files removed elsewhere) — createTree would 422.
import { describe, expect, it } from "vitest";
import { baseEntry } from "./testing/fixtures";
import { createHarness } from "./testing/harness";

describe("push: publishing a draft that was never pushed", () => {
  it("adds the post without trying to delete the draft path GitHub never had", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    const draft = model.newEntry({ kind: "draft", title: "Fresh Idea", date: "2026-01-05" });
    await store.upsertEntry(
      baseEntry({
        path: draft.path,
        kind: "draft",
        workingContent: draft.raw,
        title: "Fresh Idea",
        deleted: true,
      }),
    );
    const post = model.newEntry({ kind: "post", title: "Fresh Idea", date: "2026-01-05" });
    await store.upsertEntry(
      baseEntry({
        path: post.path,
        kind: "post",
        workingContent: post.raw,
        renamedFrom: draft.path,
        title: "Fresh Idea",
      }),
    );

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(remote.readFile(post.path)).toBe(post.raw);
    expect(await store.getEntry(draft.path)).toBeNull();
    expect(await store.listDirty()).toEqual([]);
  });
});

describe("push: delete of an entry that never reached GitHub", () => {
  it("drops the tombstone locally without making a commit", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const headBefore = remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    const draft = model.newEntry({ kind: "draft", title: "Never Pushed", date: "2026-01-05" });
    await store.upsertEntry(
      baseEntry({
        path: draft.path,
        kind: "draft",
        workingContent: draft.raw,
        title: "Never Pushed",
        deleted: true,
      }),
    );

    const result = await sync.push();

    expect(result.committed).toBe(false);
    expect(result.retries).toBe(0);
    expect(await remote.getRef()).toBe(headBefore);
    expect(await store.getEntry(draft.path)).toBeNull();
    expect(await store.listDirty()).toEqual([]);
  });
});

describe("push: delete of a path another writer already removed", () => {
  it("still pushes the rest of the batch and drops the tombstone", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const gone = model.newEntry({ kind: "post", title: "Gone Already", date: "2026-01-05" });
    remote.initRepo({ [gone.path]: gone.raw });
    await sync.bootstrap();

    const entry = await store.getEntry(gone.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...entry, deleted: true, dirty: true });
    remote.pushExternalChange({ [gone.path]: null }, "Deleted elsewhere");

    const fresh = model.newEntry({ kind: "post", title: "Fresh", date: "2026-01-06" });
    await store.upsertEntry(
      baseEntry({ path: fresh.path, kind: "post", workingContent: fresh.raw, title: "Fresh" }),
    );

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(remote.readFile(fresh.path)).toBe(fresh.raw);
    expect(await store.getEntry(gone.path)).toBeNull();
    expect(await store.listDirty()).toEqual([]);
  });
});
