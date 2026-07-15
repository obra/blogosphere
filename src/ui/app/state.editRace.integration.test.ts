// ABOUTME: Cross-module integration test — proves edit()'s immediate
// ABOUTME: burst-start commit (state.entryActions.ts) closes the window
// ABOUTME: where a concurrent pull() could fast-forward/merge straight over
// ABOUTME: an in-flight, not-yet-debounced edit, against the *real* sync
// ABOUTME: engine (core/sync/pull.ts), not a fake.
import { describe, expect, it } from "vitest";
import { DEFAULT_REPO, type Services } from "../../core/services";
import { createHarness, type TestHarness } from "../../core/sync/testing/harness";
import { createFakeShell } from "../../shell/fake";
import { createAppStore } from "./state";

const LONG_DEBOUNCE_MS = 10_000;

/** No `sync` reference: this test drives the real sync engine directly
 *  (`harness.sync`) at controlled points, rather than letting the app
 *  store's own fire-and-forget background sync race it unpredictably. */
function servicesWithoutBackgroundSync(harness: TestHarness): Services {
  return {
    model: harness.model,
    store: harness.store,
    shell: createFakeShell(),
    github: null,
    sync: null,
    repo: DEFAULT_REPO,
  };
}

describe("edit() vs a concurrent pull(): overlapping remote edit", () => {
  it("flags a real conflict instead of silently discarding the remote edit", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Original Title", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const appStore = createAppStore(servicesWithoutBackgroundSync(harness), {
      editDebounceMs: LONG_DEBOUNCE_MS,
    });
    await appStore.getState().refresh();

    // User starts typing a new title — this is the *first* edit() call in a
    // fresh burst, well before the (long) debounce would otherwise fire.
    appStore
      .getState()
      .edit(post.path, { kind: "fields", edits: [{ field: "title", value: "Mine Title" }] });

    // Let edit()'s immediate burst-start commit's microtask chain resolve
    // before anything else runs, exactly as it would in real, unhurried use.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const midBurst = await store.getEntry(post.path);
    expect(midBurst?.dirty).toBe(true);
    expect(midBurst?.workingContent).toContain("Mine Title");

    // While the user is still mid-burst (debounce not yet fired), someone
    // else commits a conflicting edit directly to the remote and a pull()
    // races in — e.g. AppShell's useSyncOnFocus, or another device's sync.
    const theirsEdit = model.applyEdits(post.raw, [{ field: "title", value: "Theirs Title" }]);
    if (!theirsEdit.ok) {
      throw new Error(theirsEdit.error);
    }
    remote.pushExternalChange({ [post.path]: theirsEdit.raw });
    const pullResult = await sync.pull();

    // The real fix under test: because the store's content had *already*
    // diverged from its base by the time pull() ran (not just a dirty flag
    // with stale content), pull() recognizes the overlap and conflicts
    // rather than fast-forwarding/merging straight over it.
    expect(pullResult.conflicts).toEqual([post.path]);

    // Flush the burst's accumulated edit (as the debounce eventually would)
    // and confirm the remote's title survives — push() must exclude this
    // conflicted path rather than silently overwriting "Theirs Title".
    await appStore.getState().flushEdit(post.path);
    const pushResult = await sync.push();
    expect(pushResult.committed).toBe(false);
    expect(pushResult.conflicts).toContain(post.path);
    expect(remote.readFile(post.path)).toBe(theirsEdit.raw);
  });
});

describe("edit() vs a concurrent pull(): non-overlapping remote edit", () => {
  it("still merges the user's in-flight body edit with a remote title edit, keeping both", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Original Title", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const appStore = createAppStore(servicesWithoutBackgroundSync(harness), {
      editDebounceMs: LONG_DEBOUNCE_MS,
    });
    await appStore.getState().refresh();

    appStore.getState().edit(post.path, { kind: "body", body: "My new body, still typing." });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const theirsEdit = model.applyEdits(post.raw, [{ field: "title", value: "Theirs Title" }]);
    if (!theirsEdit.ok) {
      throw new Error(theirsEdit.error);
    }
    remote.pushExternalChange({ [post.path]: theirsEdit.raw });
    await sync.pull();
    // In production, attachSync's onStatus subscription calls refresh() the
    // moment a sync round finishes (state.miscActions.ts) — reproduce that
    // here since this test drives `harness.sync` directly, bypassing it.
    await appStore.getState().refresh();

    await appStore.getState().flushEdit(post.path);
    const record = await store.getEntry(post.path);
    expect(record?.title).toBe("Theirs Title");
    expect(record?.workingContent).toContain("My new body, still typing.");

    const pushResult = await sync.push();
    expect(pushResult.committed).toBe(true);
    expect(remote.readFile(post.path)).toContain("Theirs Title");
    expect(remote.readFile(post.path)).toContain("My new body, still typing.");
  });
});
