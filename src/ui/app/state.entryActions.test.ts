// @vitest-environment jsdom
// ABOUTME: Tests for refresh/select/section/search and the debounced
// ABOUTME: edit -> flushEdit -> saveNow autosave pipeline, against fakes.
import { expect, it } from "vitest";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

const FAST_DEBOUNCE_MS = 5;
const SETTLE_MS = 30;

function settle(ms: number = SETTLE_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

it("refresh loads entries from the store", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services);

  await store.getState().refresh();

  expect(store.getState().entries).toEqual([draft]);
});

it("select sets selectedPath and hydrates a persisted editor mode", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  await services.store.setMeta(`editorMode:${draft.path}`, "source");
  const store = createAppStore(services);

  store.getState().select(draft.path);
  expect(store.getState().selectedPath).toBe(draft.path);

  await settle();
  expect(store.getState().editorModes[draft.path]).toBe("source");
});

it("setSection changes the section and clears the selection", () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);
  store.getState().select("content/drafts/2026-01-01-a.md");

  store.getState().setSection("posts");

  expect(store.getState().section).toBe("posts");
  expect(store.getState().selectedPath).toBeNull();
});

it("setSearchQuery debounces a call to store.searchEntries", async () => {
  const match = makeEntry({
    path: "content/drafts/2026-01-01-match.md",
    kind: "draft",
    title: "Findable",
  });
  const { services } = buildFakeServices({ seedEntries: [match] });
  const store = createAppStore(services, { searchDebounceMs: FAST_DEBOUNCE_MS });

  store.getState().setSearchQuery("Findable");
  expect(store.getState().searchResults).toBeNull();

  await settle();
  expect(store.getState().searchResults).toEqual([match]);
});

it("clearing the search query clears searchResults without a store round-trip", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services, { searchDebounceMs: FAST_DEBOUNCE_MS });

  store.getState().setSearchQuery("anything");
  await settle();
  store.getState().setSearchQuery("");
  await settle();

  expect(store.getState().searchResults).toBeNull();
});

it("edit debounce-saves a body change with recomputed denormalized fields", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", dirty: false });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: FAST_DEBOUNCE_MS });
  await store.getState().refresh();

  store.getState().edit(draft.path, { kind: "body", body: "New body" });
  await settle();

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.dirty).toBe(true);
  expect(saved?.workingContent).toContain("New body");
  const cached = store.getState().entries.find((e) => e.path === draft.path);
  expect(cached?.workingContent).toContain("New body");
});

it("edit debounce-saves a field change and triggers a background sync", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services, sync } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: FAST_DEBOUNCE_MS });

  store
    .getState()
    .edit(draft.path, { kind: "fields", edits: [{ field: "title", value: "Renamed" }] });
  await settle();

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.title).toBe("Renamed");
  expect(sync?.syncCallCount()).toBeGreaterThan(0);
});

it("a second edit within the debounce window replaces the first (last write wins)", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: FAST_DEBOUNCE_MS });

  store.getState().edit(draft.path, { kind: "body", body: "First" });
  store.getState().edit(draft.path, { kind: "body", body: "Second" });
  await settle();

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.workingContent).toContain("Second");
  expect(saved?.workingContent).not.toContain("First");
});

it("a title edit followed by a body edit within the debounce window merges both instead of clobbering the title", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    title: "Original Title",
  });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: FAST_DEBOUNCE_MS });
  await store.getState().refresh();

  store
    .getState()
    .edit(draft.path, { kind: "fields", edits: [{ field: "title", value: "New Title" }] });
  store.getState().edit(draft.path, { kind: "body", body: "New body text" });
  await settle();

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.title).toBe("New Title");
  expect(saved?.workingContent).toContain("New body text");
});

it("a body edit followed by a title edit within the debounce window merges both instead of clobbering the body", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    title: "Original Title",
  });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: FAST_DEBOUNCE_MS });
  await store.getState().refresh();

  store.getState().edit(draft.path, { kind: "body", body: "New body text" });
  store
    .getState()
    .edit(draft.path, { kind: "fields", edits: [{ field: "title", value: "New Title" }] });
  await settle();

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.title).toBe("New Title");
  expect(saved?.workingContent).toContain("New body text");
});

it("edits to two different fields within the debounce window both survive", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    title: "Original Title",
  });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: FAST_DEBOUNCE_MS });
  await store.getState().refresh();

  store
    .getState()
    .edit(draft.path, { kind: "fields", edits: [{ field: "title", value: "New Title" }] });
  store
    .getState()
    .edit(draft.path, { kind: "fields", edits: [{ field: "tags", value: ["a", "b"] }] });
  await settle();

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.title).toBe("New Title");
  expect(saved?.workingContent).toContain('tags: ["a", "b"]');
});

it("flushEdit(path) applies a pending edit immediately, without waiting out the debounce", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: 10_000 });

  store.getState().edit(draft.path, { kind: "body", body: "Flushed now" });
  await store.getState().flushEdit(draft.path);

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.workingContent).toContain("Flushed now");
});

it("saveNow flushes all pending edits and calls sync() when online", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services, sync } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: 10_000 });

  store.getState().edit(draft.path, { kind: "body", body: "Saved via Cmd-S" });
  await store.getState().saveNow();

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.workingContent).toContain("Saved via Cmd-S");
  expect(sync?.syncCallCount()).toBeGreaterThan(0);
});

it("an unsurgical edit reports a toast with a retry instead of throwing", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    workingContent: "not front matter at all",
  });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: FAST_DEBOUNCE_MS });

  store.getState().edit(draft.path, { kind: "body", body: "irrelevant" });
  await settle();

  expect(store.getState().toasts).toHaveLength(1);
  expect(store.getState().toasts[0]?.tone).toBe("error");
});
