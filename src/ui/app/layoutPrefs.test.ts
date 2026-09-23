// ABOUTME: layoutPrefs — the window-layout preferences read before first render:
// ABOUTME: defaults when missing or garbled, and the persisted values otherwise.
import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT_PREFS, loadLayoutPrefs, META_SIDEBAR_HIDDEN } from "./layoutPrefs";
import { createFakeStore } from "./testing/fakeStore";

describe("loadLayoutPrefs", () => {
  it("uses the defaults when nothing is stored", async () => {
    expect(await loadLayoutPrefs(createFakeStore())).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it("reads a hidden sidebar", async () => {
    const store = createFakeStore();
    await store.setMeta(META_SIDEBAR_HIDDEN, "true");
    expect((await loadLayoutPrefs(store)).sidebarHidden).toBe(true);
  });

  it('treats anything but "true" as shown', async () => {
    const store = createFakeStore();
    await store.setMeta(META_SIDEBAR_HIDDEN, "yes please");
    expect((await loadLayoutPrefs(store)).sidebarHidden).toBe(false);
  });

  it("falls back to the defaults when the store can't be read", async () => {
    const store = createFakeStore();
    store.getMeta = () => Promise.reject(new Error("disk gone"));
    expect(await loadLayoutPrefs(store)).toEqual(DEFAULT_LAYOUT_PREFS);
  });
});
