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

it("shareSecretLink succeeds silently — the copy control is its own feedback, not a toast", async () => {
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

  await store.getState().shareSecretLink(entry.path);

  // No toast of any tone on the happy path; failures (push error, offline)
  // still toast — those change what the user should do next.
  expect(store.getState().toasts).toEqual([]);
  expect(sync.syncCallCount()).toBe(1);
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
