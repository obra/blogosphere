// @vitest-environment jsdom
// ABOUTME: Tests for shareSecretLink — split out of state.editingActions.test.ts
// ABOUTME: (which covers deleteEntry/renameEntry) to stay under the per-file line limit.
import { expect, it } from "vitest";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

it("shareSecretLink flushes a still-debounced edit first, so the linked content is current", async () => {
  const entry = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    title: "Old Title",
  });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, {
    editDebounceMs: 10_000,
    createId: () => "fixed-uuid",
    writeClipboardText: () => Promise.resolve(),
  });
  await store.getState().refresh();

  store
    .getState()
    .edit(entry.path, { kind: "fields", edits: [{ field: "title", value: "New Title" }] });
  await store.getState().shareSecretLink(entry.path);

  const saved = await services.store.getEntry(entry.path);
  expect(saved?.title).toBe("New Title");
  expect(saved?.opaqueId).toBe("fixed-uuid");
});

it("shareSecretLink assigns an opaqueId when absent, then copies the /private/ URL", async () => {
  const entry = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const copied: string[] = [];
  const store = createAppStore(services, {
    createId: () => "fixed-uuid",
    writeClipboardText: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
  });

  await store.getState().shareSecretLink(entry.path);

  const saved = await services.store.getEntry(entry.path);
  expect(saved?.opaqueId).toBe("fixed-uuid");
  expect(copied).toEqual(["https://blog.fsck.com/private/fixed-uuid/"]);
});

it("shareSecretLink reuses an existing opaqueId instead of minting a new one", async () => {
  const entry = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    opaqueId: "already-set",
  });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const copied: string[] = [];
  const store = createAppStore(services, {
    createId: () => "should-not-be-used",
    writeClipboardText: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
  });

  await store.getState().shareSecretLink(entry.path);

  expect(copied).toEqual(["https://blog.fsck.com/private/already-set/"]);
});

it("shareSecretLink copies the link but waits for the actual push before toasting success", async () => {
  const entry = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    opaqueId: "already-set",
  });
  const { services, sync } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { writeClipboardText: () => Promise.resolve() });
  if (!sync) {
    throw new Error("test setup");
  }

  // Gate the fake sync behind a controllable promise, standing in for a
  // slow GitHub push, so we can observe state *before* it settles.
  const deferred: { resolve: () => void } = { resolve: () => undefined };
  const gate = new Promise<void>((resolve) => {
    deferred.resolve = resolve;
  });
  const realSync = sync.sync.bind(sync);
  sync.sync = async () => {
    await gate;
    return realSync();
  };

  const sharePromise = store.getState().shareSecretLink(entry.path);
  await Promise.resolve();
  await Promise.resolve();

  // The push hasn't settled yet: no success toast promised prematurely.
  expect(store.getState().toasts.some((toast) => toast.tone === "success")).toBe(false);

  deferred.resolve();
  await sharePromise;

  expect(store.getState().toasts.some((toast) => toast.tone === "success")).toBe(true);
});

it("shareSecretLink reports a specific error (not a false success) when the push fails", async () => {
  const entry = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    opaqueId: "already-set",
  });
  const { services, sync } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { writeClipboardText: () => Promise.resolve() });
  if (!sync) {
    throw new Error("test setup");
  }
  sync.sync = () => Promise.reject(new Error("simulated push failure"));

  await store.getState().shareSecretLink(entry.path);

  expect(store.getState().toasts.some((toast) => toast.tone === "success")).toBe(false);
  const errorToast = store.getState().toasts.find((toast) => toast.tone === "error");
  expect(errorToast?.message.toLowerCase()).toContain("404");
  expect(errorToast?.retry).toBeDefined();
});

it("shareSecretLink shows an offline-aware toast instead of a bare success when offline", async () => {
  const entry = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    opaqueId: "already-set",
  });
  const { services } = buildFakeServices({
    seedEntries: [entry],
    syncOptions: { status: { state: "offline", pendingCount: 0, conflicts: [], lastSyncAt: null } },
  });
  const store = createAppStore(services, { writeClipboardText: () => Promise.resolve() });

  await store.getState().shareSecretLink(entry.path);

  expect(store.getState().toasts.some((toast) => toast.tone === "success")).toBe(false);
  const infoToast = store.getState().toasts.find((toast) => toast.tone === "info");
  expect(infoToast?.message).toContain("back online");
});
