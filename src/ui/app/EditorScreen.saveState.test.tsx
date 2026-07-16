// @vitest-environment jsdom
// ABOUTME: EditorScreen's save-state indicator — the toolbar line answering
// ABOUTME: "is my work safe, and is this draft still private?" (split from
// ABOUTME: EditorScreen.test.tsx for the line cap).
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import { EditorScreen } from "./EditorScreen";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

const SAVED_TO_GITHUB_PATTERN = /Saved to GitHub/;

afterEach(() => {
  cleanup();
});

async function renderEditorFor(record: ReturnType<typeof makeEntry>, withSync = true) {
  const fake = buildFakeServices({ seedEntries: [record], withSync });
  const store = createAppStore(fake.services);
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

it("a clean draft shows the save-state indicator: on GitHub, not public", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft);

  const indicator = screen.getByText("Saved to GitHub · not public");
  expect(indicator.getAttribute("title")).toContain("Publish");
});

it("a dirty entry shows the save-state indicator: saved on this device", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    dirty: true,
  });
  await renderEditorFor(draft);

  expect(screen.getByText("Saved on this device")).not.toBeNull();
});

it("with no sync configured, the save-state indicator stays local-only", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft, false);

  expect(screen.getByText("Saved on this device")).not.toBeNull();
  expect(screen.queryByText(SAVED_TO_GITHUB_PATTERN)).toBeNull();
});

it("a legacy .html entry gets the indicator too — autosave isn't markdown-only", async () => {
  const post = makeEntry({
    path: "content/blog/2004/2004-01-24-orkut.html",
    kind: "post",
    title: "Orkut",
  });
  await renderEditorFor(post);

  expect(screen.getByText("Saved to GitHub")).not.toBeNull();
});
