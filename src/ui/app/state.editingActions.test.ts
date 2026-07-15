// @vitest-environment jsdom
// ABOUTME: Tests for deleteEntry, renameEntry, and shareSecretLink, against fakes.
import { expect, it } from "vitest";
import type { EntryRecord } from "../../core/store/types";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

it("deleteEntry tombstones the entry once the user confirms", async () => {
  const entry = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { confirm: () => true });

  await store.getState().deleteEntry(entry.path);

  const saved = await services.store.getEntry(entry.path);
  expect(saved?.deleted).toBe(true);
  expect(store.getState().entries.some((e) => e.path === entry.path)).toBe(false);
});

it("deleteEntry flushes a still-debounced edit first, so the confirm dialog shows the current title", async () => {
  const entry = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    title: "Old Title",
  });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { editDebounceMs: 10_000, confirm: () => true });
  await store.getState().refresh();

  store
    .getState()
    .edit(entry.path, { kind: "fields", edits: [{ field: "title", value: "New Title" }] });
  await store.getState().deleteEntry(entry.path);

  const saved = await services.store.getEntry(entry.path);
  expect(saved?.title).toBe("New Title");
  expect(saved?.deleted).toBe(true);
});

it("deleteEntry does nothing when the user declines the confirmation", async () => {
  const entry = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { confirm: () => false });

  await store.getState().deleteEntry(entry.path);

  const saved = await services.store.getEntry(entry.path);
  expect(saved?.deleted).toBe(false);
});

it("renameEntry with a new slug moves the entry and tombstones the old path", async () => {
  const entry = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services);

  await store.getState().renameEntry(entry.path, { slug: "new-slug" });

  const oldRecord = await services.store.getEntry(entry.path);
  expect(oldRecord?.deleted).toBe(true);
  const newRecord = await services.store.getEntry("content/drafts/2026-01-01-new-slug.md");
  expect(newRecord?.renamedFrom).toBe(entry.path);
});

it("renameEntry warns before changing a previously-synced entry's URL", async () => {
  const entry = makeEntry({
    path: "content/blog/2026/2026-01-01-a.md",
    kind: "post",
    baseSha: "abc123",
    baseContent: "irrelevant",
  });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  let confirmedMessage: string | null = null;
  const store = createAppStore(services, {
    confirm: (message) => {
      confirmedMessage = message;
      return false;
    },
  });

  await store.getState().renameEntry(entry.path, { slug: "new-slug" });

  expect(confirmedMessage).toContain("web address");
  const unchanged = await services.store.getEntry(entry.path);
  expect(unchanged?.deleted).toBe(false);
});

it("renameEntry refuses to overwrite a different entry already at the target path", async () => {
  const scaffold = makeEntry({
    path: "content/drafts/2026-02-02-new-slug.md",
    kind: "draft",
    title: "Post B",
  });
  const postB: EntryRecord = { ...scaffold, baseSha: null, baseContent: null, dirty: false };
  const postA = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    title: "Post A",
  });
  const { services } = buildFakeServices({ seedEntries: [postB, postA] });
  const store = createAppStore(services, { confirm: () => true });

  // Rename postA onto postB's exact path.
  await store.getState().renameEntry(postA.path, { slug: "new-slug", date: "2026-02-02" });

  const untouchedB = await services.store.getEntry(postB.path);
  expect(untouchedB?.title).toBe("Post B");
  expect(untouchedB?.deleted).toBe(false);
  const untouchedA = await services.store.getEntry(postA.path);
  expect(untouchedA?.deleted).toBe(false);
  expect(store.getState().toasts.some((toast) => toast.tone === "error")).toBe(true);
});

it("renameEntry skips the confirmation for a never-synced (local-only) entry", async () => {
  const entry = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", baseSha: null });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  let confirmCalled = false;
  const store = createAppStore(services, {
    confirm: () => {
      confirmCalled = true;
      return true;
    },
  });

  await store.getState().renameEntry(entry.path, { slug: "new-slug" });

  expect(confirmCalled).toBe(false);
});

it("renameEntry flushes a still-debounced edit first, carrying it to the new path", async () => {
  const entry = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    title: "Old Title",
  });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services, { editDebounceMs: 10_000 });
  await store.getState().refresh();

  store.getState().edit(entry.path, { kind: "body", body: "Last sentence before renaming." });
  await store.getState().renameEntry(entry.path, { slug: "new-slug" });

  const renamed = await services.store.getEntry("content/drafts/2026-01-01-new-slug.md");
  expect(renamed?.workingContent).toContain("Last sentence before renaming.");
});

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
