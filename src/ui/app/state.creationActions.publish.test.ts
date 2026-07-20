// @vitest-environment jsdom
// ABOUTME: Tests for publishDraft — the move to content/blog, opaqueId and
// ABOUTME: last-position handling, debounce flushing, and collision refusal
// ABOUTME: (split from state.creationActions.test.ts: per-file line limit).
import { expect, it } from "vitest";
import type { EntryRecord } from "../../core/store/types";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

it("publishDraft moves a draft to content/blog and clears the draft flag", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    baseSha: "abc123",
    baseContent: "irrelevant",
  });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services);
  store.getState().select(draft.path);

  await store.getState().publishDraft(draft.path, { date: "2026-07-15" });

  const oldRecord = await services.store.getEntry(draft.path);
  expect(oldRecord?.deleted).toBe(true);
  // The filename's slug ("a") is preserved; only date/directory change.
  const newPath = "content/blog/2026/2026-07-15-a.md";
  const newRecord = await services.store.getEntry(newPath);
  expect(newRecord?.draft).toBe(false);
  expect(newRecord?.renamedFrom).toBe(draft.path);
  // publishDraft follows the selection to the new path only when the
  // published entry was the one selected — true here, matching real usage
  // (Publish is clicked from the open entry).
  expect(store.getState().selectedPath).toBe(newPath);
  expect(store.getState().toasts.some((toast) => toast.tone === "success")).toBe(true);
});

it("publishDraft moves the pick-up-where-you-left-off meta to the published path", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
  });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services);
  store.getState().select(draft.path);

  await store.getState().publishDraft(draft.path, { date: "2026-07-15" });

  // The old path is tombstoned (listEntries filters it out), so a persisted
  // stale path would fail the next launch's existence check and silently
  // lose the user's place.
  expect(await services.store.getMeta("ui:lastSelectedPath")).toBe(
    "content/blog/2026/2026-07-15-a.md",
  );
});

it("publishDraft leaves the last-position meta alone when the published entry wasn't selected", async () => {
  const selected = makeEntry({ path: "content/drafts/2026-01-01-b.md", kind: "draft" });
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  const { services } = buildFakeServices({ seedEntries: [selected, draft] });
  const store = createAppStore(services);
  store.getState().select(selected.path);

  await store.getState().publishDraft(draft.path, { date: "2026-07-15" });

  expect(await services.store.getMeta("ui:lastSelectedPath")).toBe(selected.path);
});

it("publishDraft removes the opaqueId unless keepOpaqueId is set", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    opaqueId: "secret-uuid",
  });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services);

  await store.getState().publishDraft(draft.path, { date: "2026-07-15", keepOpaqueId: true });

  const newRecord = await services.store.getEntry("content/blog/2026/2026-07-15-a.md");
  expect(newRecord?.opaqueId).toBe("secret-uuid");
});

it("publishDraft reports a toast instead of throwing when the entry is gone", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  await store.getState().publishDraft("content/drafts/missing.md", { date: "2026-07-15" });

  expect(store.getState().toasts.some((toast) => toast.tone === "error")).toBe(true);
});

it("publishDraft flushes a still-debounced edit first, instead of publishing a stale snapshot", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    title: "Draft Title",
  });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  // A long debounce so the edit below is still pending when publish runs —
  // modeling a fast click-through right after the last keystroke.
  const store = createAppStore(services, { editDebounceMs: 10_000 });
  await store.getState().refresh();

  store.getState().edit(draft.path, { kind: "body", body: "Last sentence I just typed." });
  await store.getState().publishDraft(draft.path, { date: "2026-07-15" });

  const published = await services.store.getEntry("content/blog/2026/2026-07-15-a.md");
  expect(published?.workingContent).toContain("Last sentence I just typed.");
});

it("publishDraft refuses to overwrite a different entry already at the target path", async () => {
  // An existing, already-synced post at the exact path the draft below will
  // compute as its publish target (same date, same filename slug "a").
  const scaffold = makeEntry({
    path: "content/blog/2026/2026-07-15-a.md",
    kind: "post",
    title: "Existing Post",
  });
  const existingPost: EntryRecord = {
    ...scaffold,
    baseSha: "already-synced-sha",
    baseContent: scaffold.workingContent,
    dirty: false,
  };
  // A completely unrelated draft whose publish target coincidentally
  // collides with the existing post's path.
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    title: "Some Draft",
  });
  const { services } = buildFakeServices({ seedEntries: [existingPost, draft] });
  const store = createAppStore(services);

  await store.getState().publishDraft(draft.path, { date: "2026-07-15" });

  // The existing post must survive completely untouched — not silently
  // clobbered by the draft's content.
  const stillThere = await services.store.getEntry(existingPost.path);
  expect(stillThere?.title).toBe("Existing Post");
  expect(stillThere?.dirty).toBe(false);
  // The draft itself must not have been tombstoned — publishing failed, so
  // it must still be right where it was.
  const draftStillThere = await services.store.getEntry(draft.path);
  expect(draftStillThere?.deleted).toBe(false);
  expect(store.getState().toasts.some((toast) => toast.tone === "error")).toBe(true);
  expect(store.getState().toasts.some((toast) => toast.tone === "success")).toBe(false);
});

it("publishDraft succeeds even when store.transaction is broken (tauri-plugin-sql pools connections)", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
  });
  const fake = buildFakeServices({ seedEntries: [draft] });
  // The real Tauri driver's cross-call BEGIN/COMMIT lands on arbitrary pooled
  // connections and dies under concurrency ("database is locked" — seen live
  // on Windows). Publishing must not depend on transaction() at all.
  const services = {
    ...fake.services,
    store: {
      ...fake.services.store,
      transaction: () => Promise.reject(new Error("database is locked")),
    },
  };
  const store = createAppStore(services);

  await store.getState().publishDraft(draft.path, { date: "2026-07-20" });

  const newRecord = await services.store.getEntry("content/blog/2026/2026-07-20-a.md");
  expect(newRecord?.draft).toBe(false);
  expect((await services.store.getEntry(draft.path))?.deleted).toBe(true);
  expect(store.getState().toasts.some((toast) => toast.tone === "success")).toBe(true);
});

it("a store failure during publish surfaces the underlying error in the toast", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
  });
  const fake = buildFakeServices({ seedEntries: [draft] });
  const services = {
    ...fake.services,
    store: {
      ...fake.services.store,
      upsertEntryPair: () => Promise.reject(new Error("database is locked")),
    },
  };
  const store = createAppStore(services);

  await store.getState().publishDraft(draft.path, { date: "2026-07-20" });

  // "Couldn't publish this entry." alone made a live Windows failure
  // undiagnosable — the toast must carry the real reason.
  const errorToast = store.getState().toasts.find((toast) => toast.tone === "error");
  expect(errorToast?.message).toContain("database is locked");
});
