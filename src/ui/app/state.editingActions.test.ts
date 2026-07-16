// @vitest-environment jsdom
// ABOUTME: Tests for deleteEntry and renameEntry against fakes (shareSecretLink
// ABOUTME: is covered separately in state.editingActions.shareLink.test.ts).
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

it("renameEntry preserves the .html extension for a legacy entry's date change", async () => {
  const entry = makeEntry({
    path: "content/blog/2004/2004-01-24-orkut.html",
    kind: "post",
    date: "2004-01-24",
  });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services);

  await store.getState().renameEntry(entry.path, { date: "2004-02-01" });

  const oldRecord = await services.store.getEntry(entry.path);
  expect(oldRecord?.deleted).toBe(true);
  const newRecord = await services.store.getEntry("content/blog/2004/2004-02-01-orkut.html");
  expect(newRecord).not.toBeNull();
  expect(newRecord?.deleted).toBe(false);
});

it("renameEntry does not append .html onto an ordinary .md entry's new path", async () => {
  const entry = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [entry] });
  const store = createAppStore(services);

  await store.getState().renameEntry(entry.path, { slug: "new-slug" });

  const newRecord = await services.store.getEntry("content/drafts/2026-01-01-new-slug.md");
  expect(newRecord).not.toBeNull();
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
