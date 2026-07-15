// ABOUTME: Cross-module integration test — proves deleteEntry/renameEntry
// ABOUTME: clear a path's unresolved-conflict bookkeeping instead of leaving
// ABOUTME: it stuck blocking push() forever (see core/sync/meta.ts's
// ABOUTME: discardConflictIfAny), against the *real* sync engine, not a fake.
import { describe, expect, it } from "vitest";
import { DEFAULT_REPO, type Services } from "../../core/services";
import { getConflictPaths, getConflictRemote } from "../../core/sync/meta";
import { createHarness, type TestHarness } from "../../core/sync/testing/harness";
import { createFakeShell } from "../../shell/fake";
import { createAppStore } from "./state";

/** Bootstraps one post, then has "mine" (local, unpushed) and "theirs"
 *  (remote) edit the same title line to different values, and pulls —
 *  landing a genuine overlap conflict, exactly like
 *  engine.conflict.test.ts's setupOverlappingConflict. */
async function setupOverlappingConflict(): Promise<{ harness: TestHarness; path: string }> {
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
  await store.upsertEntry({ ...entry, workingContent: mineEdit.raw, dirty: true, title: "Mine" });

  const theirsEdit = model.applyEdits(post.raw, [{ field: "title", value: "Theirs Title" }]);
  if (!theirsEdit.ok) {
    throw new Error(theirsEdit.error);
  }
  remote.pushExternalChange({ [post.path]: theirsEdit.raw });

  await sync.pull();

  return { harness, path: post.path };
}

/** No `sync` reference, so the app store's own fire-and-forget background
 *  sync (maybeBackgroundSync in state.cache.ts) is a no-op — otherwise it
 *  would race the test's own explicit `harness.sync.push()` call below,
 *  since both would drive the same underlying store/remote concurrently.
 *  deleteEntry/renameEntry only need `store`/`model`; the real sync engine
 *  (`harness.sync`) is still driven directly, deterministically, afterward. */
function realServicesWithoutBackgroundSync(harness: TestHarness): Services {
  return {
    model: harness.model,
    store: harness.store,
    shell: createFakeShell(),
    github: null,
    sync: null,
    repo: DEFAULT_REPO,
  };
}

describe("deleteEntry clears a stuck conflict instead of blocking push forever", () => {
  it("removes the path from conflicts and lets push commit the deletion", async () => {
    const { harness, path } = await setupOverlappingConflict();
    expect(await getConflictPaths(harness.store)).toEqual([path]);

    const appStore = createAppStore(realServicesWithoutBackgroundSync(harness), {
      confirm: () => true,
    });
    // Confirm the app-store cache actually knows about the conflicted entry
    // (deleteEntry reads from the cache first, falling back to the store).
    await appStore.getState().refresh();

    await appStore.getState().deleteEntry(path);

    // sync.status() is a cached snapshot only refreshed by sync operations —
    // deleteEntry writes straight to the store, so the store's own conflict
    // bookkeeping (what push() actually consults) is the real assertion here.
    expect(await getConflictPaths(harness.store)).toEqual([]);
    expect(await getConflictRemote(harness.store, path)).toBeNull();

    const pushResult = await harness.sync.push();
    expect(pushResult.committed).toBe(true);
    expect(harness.remote.readFile(path)).toBeNull();
  });
});

describe("renameEntry clears a stuck conflict on the old path", () => {
  it("removes the old path from conflicts and lets push commit the rename", async () => {
    const { harness, path } = await setupOverlappingConflict();
    expect(await getConflictPaths(harness.store)).toEqual([path]);

    const appStore = createAppStore(realServicesWithoutBackgroundSync(harness), {
      confirm: () => true,
    });
    await appStore.getState().refresh();

    await appStore.getState().renameEntry(path, { slug: "renamed-away" });

    expect(await getConflictPaths(harness.store)).toEqual([]);
    expect(await getConflictRemote(harness.store, path)).toBeNull();

    const pushResult = await harness.sync.push();
    expect(pushResult.committed).toBe(true);
    expect(harness.remote.readFile(path)).toBeNull();
  });
});
