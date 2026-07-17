// @vitest-environment jsdom
// ABOUTME: Tests for newPost/newDraft/newLink, against fakes (publishDraft is
// ABOUTME: covered separately in state.creationActions.publish.test.ts).
import { expect, it } from "vitest";
import { createAppStore } from "./state";
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

it("newDraft records the new entry in the pick-up-where-you-left-off meta", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const path = await store.getState().newDraft({ title: "Fresh Draft", date: "2026-03-01" });

  // Quitting right after Cmd-N must reopen on the draft just started — the
  // selection set by creation has to reach the same meta select() persists.
  expect(await services.store.getMeta("ui:lastSelectedPath")).toBe(path);
  expect(await services.store.getMeta("ui:lastSection")).toBe("drafts");
});

it("newPost persists the section switch it makes", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const path = await store.getState().newPost({ title: "Direct Post", date: "2026-03-01" });

  expect(await services.store.getMeta("ui:lastSection")).toBe("posts");
  expect(await services.store.getMeta("ui:lastSelectedPath")).toBe(path);
});

it("newLink persists the section switch it makes", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const path = await store.getState().newLink({
    title: "Cool Article",
    url: "https://example.com/article",
    date: "2026-03-01",
  });

  expect(await services.store.getMeta("ui:lastSection")).toBe("links");
  expect(await services.store.getMeta("ui:lastSelectedPath")).toBe(path);
});

it("newDraft defaults the date to today when omitted", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services, { now: () => Date.parse("2026-07-15T12:00:00Z") });

  const path = await store.getState().newDraft({ title: "Untitled" });

  expect(path).toContain("2026-07-15");
});
