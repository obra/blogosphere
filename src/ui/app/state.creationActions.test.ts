// @vitest-environment jsdom
// ABOUTME: Tests for newPost/newDraft/newLink and publishDraft, against fakes.
import { expect, it } from "vitest";
import type { EntryRecord } from "../../core/store/types";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

it("newDraft scaffolds a draft, upserts it, and selects it", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const path = await store.getState().newDraft({ title: "My New Draft", date: "2026-03-01" });
  if (path === null) {
    throw new Error("test setup");
  }

  // The real model's slugify preserves author-typed case (paths.ts) — the
  // fake now delegates to it directly rather than reimplementing its own
  // (previously lowercasing) slug logic.
  expect(path).toBe("content/drafts/2026-03-01-My-New-Draft.md");
  expect(store.getState().selectedPath).toBe(path);
  expect(store.getState().section).toBe("drafts");
  const saved = await services.store.getEntry(path);
  expect(saved?.dirty).toBe(true);
  expect(saved?.title).toBe("My New Draft");
});

it("newDraft reports a toast with a retry instead of throwing when the store write fails", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);
  const originalUpsert = services.store.upsertEntry.bind(services.store);
  let attempts = 0;
  services.store.upsertEntry = (record) => {
    attempts += 1;
    if (attempts === 1) {
      return Promise.reject(new Error("disk full (simulated)"));
    }
    return originalUpsert(record);
  };

  const path = await store.getState().newDraft({ title: "My New Draft", date: "2026-03-01" });

  expect(path).toBeNull();
  expect(store.getState().busy.creating).toBe(false);
  const errorToast = store.getState().toasts.find((toast) => toast.tone === "error");
  expect(errorToast?.message).toContain("draft");
  expect(errorToast?.retry).toBeDefined();

  // The retry succeeds now that the store write no longer throws. `retry`
  // is typed `() => void` (Toast's shape), so its actual async work can't
  // be awaited directly here — flush a macrotask instead.
  errorToast?.retry?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const saved = await services.store.getEntry("content/drafts/2026-03-01-My-New-Draft.md");
  expect(saved?.title).toBe("My New Draft");
});

it("newPost scaffolds a kind:post entry directly under content/blog", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const path = await store.getState().newPost({ title: "Direct Post", date: "2026-03-01" });

  expect(path).toBe("content/blog/2026/2026-03-01-Direct-Post.md");
  expect(store.getState().section).toBe("posts");
});

it("newLink scaffolds a link entry with the given url", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const path = await store.getState().newLink({
    title: "Cool Article",
    url: "https://example.com/article",
    date: "2026-03-01",
  });
  if (path === null) {
    throw new Error("test setup");
  }

  const saved = await services.store.getEntry(path);
  expect(saved?.kind).toBe("link");
  expect(store.getState().section).toBe("links");
});

it("newDraft stays local — creating a draft is the start of writing, not a deploy", async () => {
  const { services, sync } = buildFakeServices();
  const store = createAppStore(services);

  await store.getState().newDraft({ title: "Just Starting", date: "2026-03-01" });

  expect(sync?.syncCallCount()).toBe(0);
});

it("newLink pushes — a linkblog entry is publish-on-create", async () => {
  const { services, sync } = buildFakeServices();
  const store = createAppStore(services);

  await store.getState().newLink({
    title: "Cool Article",
    url: "https://example.com/article",
    date: "2026-03-01",
  });

  expect(sync?.syncCallCount()).toBeGreaterThan(0);
});

it("newPost pushes — a kind:post entry is public the moment it lands on main", async () => {
  const { services, sync } = buildFakeServices();
  const store = createAppStore(services);

  await store.getState().newPost({ title: "Direct Post", date: "2026-03-01" });

  expect(sync?.syncCallCount()).toBeGreaterThan(0);
});

it("a second same-day untitled draft gets its own path instead of overwriting the first", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const first = await store.getState().newDraft({ title: "", date: "2026-03-01" });
  const second = await store.getState().newDraft({ title: "", date: "2026-03-01" });
  if (first === null || second === null) {
    throw new Error("test setup");
  }

  expect(second).not.toBe(first);
  expect(await services.store.getEntry(first)).not.toBeNull();
  expect(await services.store.getEntry(second)).not.toBeNull();
});

it("newPost onto an already-occupied path picks a free one rather than clobbering", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const first = await store.getState().newPost({ title: "Same Title", date: "2026-03-01" });
  const second = await store.getState().newPost({ title: "Same Title", date: "2026-03-01" });

  expect(second).not.toBe(first);
});

it("newDraft defaults the date to today when omitted", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services, { now: () => Date.parse("2026-07-15T12:00:00Z") });

  const path = await store.getState().newDraft({ title: "Untitled" });

  expect(path).toContain("2026-07-15");
});

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
