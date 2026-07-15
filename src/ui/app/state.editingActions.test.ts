// @vitest-environment jsdom
// ABOUTME: Tests for deleteEntry, renameEntry, and shareSecretLink, against fakes.
import { expect, it } from "vitest";
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
