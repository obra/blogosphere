// @vitest-environment jsdom
// ABOUTME: The editor's "Discard changes" affordance — shown only when there
// ABOUTME: are unsynced changes on top of a version that exists on GitHub.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import { EditorScreen } from "./EditorScreen";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { makeEntry, makeRaw } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

afterEach(() => {
  cleanup();
});

function dirtyPublishedPost() {
  return makeEntry({
    path: "content/blog/2026/2026-01-01-a.md",
    kind: "post",
    title: "Edited Title",
    dirty: true,
    baseSha: "base-sha",
    baseContent: makeRaw({ title: "Base Title", date: "2026-01-01" }),
    workingContent: makeRaw({ title: "Edited Title", date: "2026-01-01" }),
  });
}

async function renderEditorFor(record: ReturnType<typeof makeEntry>, confirmAnswer = true) {
  const fake = buildFakeServices({ seedEntries: [record] });
  const store = createAppStore(fake.services, { confirm: () => confirmAnswer });
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

it("offers Discard changes on a dirty entry with a synced base", async () => {
  await renderEditorFor(dirtyPublishedPost());
  expect(screen.getByText("Discard changes")).not.toBeNull();
});

it("hides Discard changes when the entry is clean", async () => {
  const clean = makeEntry({
    path: "content/blog/2026/2026-01-01-a.md",
    kind: "post",
    baseSha: "sha",
    baseContent: makeRaw({ title: "Test title", date: "2026-01-01" }),
  });
  await renderEditorFor(clean);
  expect(screen.queryByText("Discard changes")).toBeNull();
});

it("hides Discard changes when there is no synced base (never-pushed draft)", async () => {
  const fresh = makeEntry({
    path: "content/drafts/2026-01-01-new.md",
    kind: "draft",
    draft: true,
    dirty: true,
  });
  await renderEditorFor(fresh);
  expect(screen.queryByText("Discard changes")).toBeNull();
});

it("typing first, then discarding, still restores the base into the visible editor", async () => {
  // Regression: on a clean synced entry (working === base), discard restores
  // content equal to the editor's last-reconciled snapshot, so a naive "did
  // workingContent change?" guard skips the revert and leaves the regretted
  // keystrokes on screen (found live, 2026-07-16).
  const raw = makeRaw({ title: "Base Title", date: "2026-01-01" });
  const record = makeEntry({
    path: "content/blog/2026/2026-01-01-a.md",
    kind: "post",
    title: "Base Title",
    baseSha: "base-sha",
    baseContent: raw,
    workingContent: raw,
  });
  const { services } = await renderEditorFor(record);

  const titleInput = screen.getByLabelText("Title") as HTMLInputElement;
  fireEvent.change(titleInput, { target: { value: "Regretted title" } });
  // Let the local-edit window and the store debounce fully settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 900));
  });

  await act(async () => {
    fireEvent.click(screen.getByText("Discard changes"));
    await Promise.resolve();
  });

  const saved = await services.store.getEntry(record.path);
  expect(saved?.workingContent).toBe(record.baseContent);
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Base Title");
});

it("discarding while keystrokes are still debouncing restores the base once the window passes", async () => {
  const record = dirtyPublishedPost();
  await renderEditorFor(record);

  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Mid-flight regret" } });
  // Discard immediately — inside the local-edit window.
  await act(async () => {
    fireEvent.click(screen.getByText("Discard changes"));
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 900));
  });

  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Base Title");
});

it("clicking Discard changes restores the base content into the visible editor", async () => {
  const record = dirtyPublishedPost();
  const { services } = await renderEditorFor(record);

  await act(async () => {
    fireEvent.click(screen.getByText("Discard changes"));
    await Promise.resolve();
  });

  const saved = await services.store.getEntry(record.path);
  expect(saved?.workingContent).toBe(record.baseContent);
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Base Title");
  expect(screen.queryByText("Discard changes")).toBeNull();
});
