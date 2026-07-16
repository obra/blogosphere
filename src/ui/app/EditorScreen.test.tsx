// @vitest-environment jsdom
// ABOUTME: Tests for EditorScreen, focused on the publish dialog flow: open,
// ABOUTME: date default, keepOpaqueId visibility, submit, and cancel; and legacy-.html behavior.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import { EditorScreen } from "./EditorScreen";
import { todayIso } from "./format";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

afterEach(() => {
  cleanup();
});

async function renderEditorFor(record: ReturnType<typeof makeEntry>, withSync = true) {
  const fake = buildFakeServices({ seedEntries: [record], withSync });
  const store = createAppStore(fake.services, { now: () => Date.parse("2026-07-15T09:00:00Z") });
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <EditorScreen />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await store.getState().refresh();
    store.getState().select(record.path);
  });
  return { store, ...fake };
}

it("shows the empty state when nothing is selected", () => {
  const fake = buildFakeServices();
  const store = createAppStore(fake.services);
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <EditorScreen />
      </AppStoreProvider>
    </ServicesProvider>,
  );

  expect(screen.getByText("Select an entry, or start a new one.")).not.toBeNull();
});

it("Publish opens a dialog defaulting the date to today", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));

  // PublishSection reads the real clock (todayIso(Date.now())), not the
  // store's injected one — compare against the same clock, not a literal
  // that silently expires at midnight.
  expect(screen.getByLabelText("Publish date")).toHaveProperty("value", todayIso(Date.now()));
});

it("does not show the keep-secret-link checkbox when there is no opaqueId", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));

  expect(screen.queryByLabelText("Keep secret link alive")).toBeNull();
});

it("shows the keep-secret-link checkbox when the entry has an opaqueId", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    opaqueId: "secret-id",
  });
  await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));

  expect(screen.getByLabelText("Keep secret link alive")).not.toBeNull();
});

it("submitting Publish calls publishDraft with the chosen date and keepOpaqueId, then closes", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    opaqueId: "secret-id",
  });
  const { store, services } = await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));
  fireEvent.change(screen.getByLabelText("Publish date"), { target: { value: "2026-08-01" } });
  fireEvent.click(screen.getByLabelText("Keep secret link alive"));
  const dialog = screen.getByRole("dialog", { name: "Publish" });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    await Promise.resolve();
  });

  expect(screen.queryByLabelText("Publish date")).toBeNull();
  const published = await services.store.getEntry("content/blog/2026/2026-08-01-a.md");
  expect(published?.opaqueId).toBe("secret-id");
  expect(store.getState().toasts.some((t) => t.tone === "success")).toBe(true);
});

it("Cancel closes the publish dialog without publishing", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));
  fireEvent.click(screen.getByText("Cancel"));

  expect(screen.queryByLabelText("Publish date")).toBeNull();
});

it("picks up a same-path external content change (pull/merge/resolved conflict) without switching entries", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    title: "Original Title",
  });
  const { store, services } = await renderEditorFor(draft);

  const titleInput = screen.getByLabelText("Title") as HTMLInputElement;
  expect(titleInput.value).toBe("Original Title");

  // Simulate what pull.ts's fastForwardClean/mergeAgainstRemote and
  // engine.ts's runResolveConflict all do: write straight to the store,
  // bypassing this component (and even the app-store's own edit()/commit
  // path) entirely, then attachSync's subscription reloads the cache.
  const externallyUpdated = services.model.applyEdits(draft.workingContent, [
    { field: "title", value: "Resolved Elsewhere" },
  ]);
  if (!externallyUpdated.ok) {
    throw new Error(externallyUpdated.error);
  }
  await act(async () => {
    await services.store.upsertEntry({
      ...draft,
      workingContent: externallyUpdated.raw,
      title: "Resolved Elsewhere",
      dirty: false,
    });
    await store.getState().refresh();
  });

  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Resolved Elsewhere");
});

it("does not clobber an in-progress local edit with a same-path external change landing mid-keystroke", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    title: "Original Title",
  });
  const { store, services } = await renderEditorFor(draft);

  const titleInput = screen.getByLabelText("Title") as HTMLInputElement;
  fireEvent.change(titleInput, { target: { value: "What I Am Typing Right Now" } });

  // An unrelated external change (e.g. a background pull merging a
  // different field) lands while the keystroke above is still "fresh" —
  // the title the user is actively editing must not be reverted out from
  // under them the instant it arrives.
  const externallyChangedDate = services.model.applyEdits(draft.workingContent, [
    { field: "date", value: "2026-02-02" },
  ]);
  if (!externallyChangedDate.ok) {
    throw new Error(externallyChangedDate.error);
  }
  await act(async () => {
    await services.store.upsertEntry({
      ...draft,
      workingContent: externallyChangedDate.raw,
      date: "2026-02-02",
    });
    await store.getState().refresh();
  });

  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
    "What I Am Typing Right Now",
  );
});

it("Delete tombstones the entry once the user confirms", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  const fake = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(fake.services, { confirm: () => true });
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <EditorScreen />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await store.getState().refresh();
    store.getState().select(draft.path);
  });

  await act(async () => {
    fireEvent.click(screen.getByText("Delete"));
    await Promise.resolve();
  });

  const saved = await fake.services.store.getEntry(draft.path);
  expect(saved?.deleted).toBe(true);
});

it("Delete does nothing when the user declines the confirmation", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  const fake = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(fake.services, { confirm: () => false });
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <EditorScreen />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await store.getState().refresh();
    store.getState().select(draft.path);
  });

  await act(async () => {
    fireEvent.click(screen.getByText("Delete"));
    await Promise.resolve();
  });

  const saved = await fake.services.store.getEntry(draft.path);
  expect(saved?.deleted).toBe(false);
});

it("renders without an infinite-render loop when no sync is configured yet (no token)", async () => {
  // Regression test: useEditorScreenState's `isConflicted` selector read
  // `state.syncStatus?.conflicts ?? []`, a fresh array every call once
  // syncStatus is null (no token saved yet — the ordinary first-run state),
  // which zustand's useSyncExternalStore reads as "changed" on every render
  // and loops forever. See state.types.ts's EMPTY_CONFLICTS.
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft, false);

  expect(screen.getByLabelText("Title")).not.toBeNull();
});

function queryCmContent(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".cm-content");
}

function queryProseMirror(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".milkdown .ProseMirror");
}

it("a legacy .html entry shows the Preview/HTML toggle instead of Write/Markdown", async () => {
  const post = makeEntry({
    path: "content/blog/2004/2004-01-24-orkut.html",
    kind: "post",
    title: "Orkut",
  });
  await renderEditorFor(post);

  expect(screen.getByRole("button", { name: "Preview" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "HTML" })).not.toBeNull();
  expect(screen.queryByText("Write")).toBeNull();
  expect(screen.queryByText("Markdown")).toBeNull();
});

it("an ordinary .md entry shows the Write/Markdown toggle, not an HTML chip", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft);

  expect(screen.getByText("Write")).not.toBeNull();
  expect(screen.getByText("Markdown")).not.toBeNull();
  expect(screen.queryByTitle("Legacy HTML post — source editing only")).toBeNull();
});

it("a legacy .html entry opens in rendered preview; HTML mode is CodeMirror, never WYSIWYG", async () => {
  const post = makeEntry({
    path: "content/blog/2004/2004-01-24-orkut.html",
    kind: "post",
    title: "Orkut",
  });
  const { store } = await renderEditorFor(post);

  // Default view: the sandboxed rendered preview, no editors mounted.
  const frame = document.body.querySelector("iframe.html-preview");
  expect(frame).not.toBeNull();
  expect(frame?.getAttribute("sandbox")).toBe("");
  expect(queryProseMirror(document.body)).toBeNull();

  // Switch to source: CodeMirror, still never Milkdown — even if a stale
  // per-entry "wysiwyg" mode was persisted before this file existed.
  fireEvent.click(screen.getByRole("button", { name: "HTML" }));
  await act(async () => {
    await store.getState().setEditorMode(post.path, "wysiwyg");
  });
  expect(queryCmContent(document.body)).not.toBeNull();
  expect(queryProseMirror(document.body)).toBeNull();
});

it("the formatting Toolbar is hidden for a legacy .html entry's body editor", async () => {
  const post = makeEntry({
    path: "content/blog/2004/2004-01-24-orkut.html",
    kind: "post",
    title: "Orkut",
  });
  await renderEditorFor(post);

  expect(screen.queryByTitle("Bold")).toBeNull();
  expect(screen.queryByTitle("Insert image")).toBeNull();
});
