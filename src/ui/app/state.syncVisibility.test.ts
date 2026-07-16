// @vitest-environment jsdom
// ABOUTME: The app store's sync-visibility surface: the activity-log ring
// ABOUTME: buffer fed by SyncApi.onLog, and discardChanges (revert to base).
import { expect, it } from "vitest";
import { createAppStore } from "./state";
import { makeEntry, makeRaw } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

const LOG_CAP = 200;

it("engine log entries land in state.syncLog", () => {
  const { services, sync } = buildFakeServices();
  const store = createAppStore(services);

  sync?.emitLog({ at: 1, level: "info", message: "Pushed 2 changes to GitHub" });

  expect(store.getState().syncLog).toHaveLength(1);
  expect(store.getState().syncLog[0]?.message).toContain("Pushed 2 changes");
});

it("the log is a ring buffer capped at 200 entries", () => {
  const { services, sync } = buildFakeServices();
  const store = createAppStore(services);

  for (let i = 0; i < LOG_CAP + 10; i += 1) {
    sync?.emitLog({ at: i, level: "info", message: `entry ${i}` });
  }

  const log = store.getState().syncLog;
  expect(log).toHaveLength(LOG_CAP);
  expect(log[0]?.message).toBe("entry 10");
  expect(log.at(-1)?.message).toBe(`entry ${LOG_CAP + 9}`);
});

it("detaching sync stops feeding the log but keeps its history", () => {
  const { services, sync } = buildFakeServices();
  const store = createAppStore(services);
  sync?.emitLog({ at: 1, level: "info", message: "before detach" });

  store.getState().attachSync(null);
  sync?.emitLog({ at: 2, level: "info", message: "after detach" });

  expect(store.getState().syncLog).toHaveLength(1);
  expect(store.getState().syncLog[0]?.message).toBe("before detach");
});

it("openSyncLog/closeSyncLog toggle the panel flag", () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  expect(store.getState().syncLogOpen).toBe(false);
  store.getState().openSyncLog();
  expect(store.getState().syncLogOpen).toBe(true);
  store.getState().closeSyncLog();
  expect(store.getState().syncLogOpen).toBe(false);
});

function dirtyEntryWithBase() {
  const base = makeRaw({ title: "Base Title", date: "2026-01-01" });
  return makeEntry({
    path: "content/blog/2026/2026-01-01-a.md",
    kind: "post",
    title: "Edited Title",
    dirty: true,
    baseSha: "base-sha",
    baseContent: base,
    workingContent: makeRaw({ title: "Edited Title", date: "2026-01-01" }),
  });
}

it("discardChanges restores the last-synced content and clears dirty", async () => {
  const entry = dirtyEntryWithBase();
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { confirm: () => true });
  await store.getState().refresh();

  await store.getState().discardChanges(entry.path);

  const saved = await services.store.getEntry(entry.path);
  expect(saved?.workingContent).toBe(entry.baseContent);
  expect(saved?.dirty).toBe(false);
  expect(saved?.title).toBe("Base Title");
  const cached = store.getState().entries.find((e) => e.path === entry.path);
  expect(cached?.workingContent).toBe(entry.baseContent);
  expect(cached?.dirty).toBe(false);
});

it("discardChanges does nothing when the user declines the confirmation", async () => {
  const entry = dirtyEntryWithBase();
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { confirm: () => false });
  await store.getState().refresh();

  await store.getState().discardChanges(entry.path);

  const saved = await services.store.getEntry(entry.path);
  expect(saved?.workingContent).toBe(entry.workingContent);
  expect(saved?.dirty).toBe(true);
});

it("discardChanges cancels a still-debounced edit instead of committing it", async () => {
  const entry = dirtyEntryWithBase();
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { confirm: () => true, editDebounceMs: 10_000 });
  await store.getState().refresh();

  store.getState().edit(entry.path, { kind: "body", body: "Keystrokes mid-flight" });
  await store.getState().discardChanges(entry.path);
  // If the pending slot survived, this would commit the canceled keystrokes.
  await store.getState().flushEdit();

  const saved = await services.store.getEntry(entry.path);
  expect(saved?.workingContent).toBe(entry.baseContent);
  expect(saved?.dirty).toBe(false);
});

it("discardChanges refuses (with a toast, no crash) when there is no synced base", async () => {
  const entry = makeEntry({
    path: "content/drafts/2026-01-01-new.md",
    kind: "draft",
    draft: true,
    dirty: true,
  });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { confirm: () => true });
  await store.getState().refresh();

  await store.getState().discardChanges(entry.path);

  const saved = await services.store.getEntry(entry.path);
  expect(saved?.dirty).toBe(true);
  expect(store.getState().toasts.length).toBeGreaterThan(0);
});
