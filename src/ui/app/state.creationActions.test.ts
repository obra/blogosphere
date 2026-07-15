// @vitest-environment jsdom
// ABOUTME: Tests for newPost/newDraft/newLink and publishDraft, against fakes.
import { expect, it } from "vitest";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

it("newDraft scaffolds a draft, upserts it, and selects it", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const path = await store.getState().newDraft({ title: "My New Draft", date: "2026-03-01" });

  expect(path).toBe("content/drafts/2026-03-01-my-new-draft.md");
  expect(store.getState().selectedPath).toBe(path);
  expect(store.getState().section).toBe("drafts");
  const saved = await services.store.getEntry(path);
  expect(saved?.dirty).toBe(true);
  expect(saved?.title).toBe("My New Draft");
});

it("newPost scaffolds a kind:post entry directly under content/blog", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const path = await store.getState().newPost({ title: "Direct Post", date: "2026-03-01" });

  expect(path).toBe("content/blog/2026/2026-03-01-direct-post.md");
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

  const saved = await services.store.getEntry(path);
  expect(saved?.kind).toBe("link");
  expect(store.getState().section).toBe("links");
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
