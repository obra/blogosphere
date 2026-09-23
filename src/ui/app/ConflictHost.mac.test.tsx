// @vitest-environment jsdom
// ABOUTME: macOS conflicts never interrupt: no sheet on detection or selection;
// ABOUTME: it opens from Resolve… in the editor bar or the Activity popover.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ConflictHost } from "./ConflictHost";
import { EditorScreen } from "./EditorScreen";
import { SyncStatusButton } from "./SyncStatusButton";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

const PATH = "content/drafts/2026-01-01-a.md";
const entry = makeEntry({
  path: PATH,
  kind: "draft",
  title: "Clashing draft",
  workingContent: "---\ntitle: Clashing draft\ndate: 2026-01-01\ndraft: true\n---\nmine",
  baseContent: "base",
  dirty: true,
});
const CONFLICTED = {
  status: { state: "conflict" as const, pendingCount: 0, conflicts: [PATH], lastSyncAt: null },
};

async function renderMac(ui: React.ReactElement, platform: "macos" | "web" = "macos") {
  const rendered = renderWithStore(ui, {
    seedEntries: [entry],
    syncOptions: CONFLICTED,
    shellOptions: { platform },
  });
  await act(async () => {
    await rendered.store.getState().refresh();
  });
  return rendered;
}

function conflictSheet() {
  return screen.queryByRole("dialog", { name: `Resolve conflict in ${PATH}` });
}

it("shows no sheet for a detected conflict, even with the entry selected", async () => {
  const { store } = await renderMac(<ConflictHost />);
  act(() => store.getState().select(PATH));
  expect(conflictSheet()).toBeNull();
});

it("still opens by itself on other platforms", async () => {
  await renderMac(<ConflictHost />, "web");
  expect(conflictSheet()).not.toBeNull();
});

it("opens from the editor's Resolve… and closes with Not now", async () => {
  const { store } = await renderMac(
    <>
      <EditorScreen />
      <ConflictHost />
    </>,
  );
  act(() => store.getState().select(PATH));
  fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
  expect(conflictSheet()).not.toBeNull();
  fireEvent.click(screen.getByText("Not now"));
  expect(conflictSheet()).toBeNull();
  expect(store.getState().conflictSheetPath).toBeNull();
});

it("opens from the Activity popover, selecting the entry", async () => {
  const { store } = await renderMac(
    <>
      <SyncStatusButton />
      <ConflictHost />
    </>,
  );
  act(() => store.getState().openSyncLog());
  fireEvent.click(screen.getByRole("button", { name: "Clashing draft" }));
  expect(store.getState().selectedPath).toBe(PATH);
  expect(store.getState().syncLogOpen).toBe(false);
  expect(conflictSheet()).not.toBeNull();
});

it("elsewhere, waits for an open sheet to close instead of stacking on it", async () => {
  const { store, sync } = renderWithStore(<ConflictHost />, {
    seedEntries: [entry],
    shellOptions: { platform: "web" },
  });
  await act(async () => {
    await store.getState().refresh();
  });
  act(() => store.getState().openNewLinkDialog());
  act(() => sync?.setStatus(CONFLICTED.status));
  expect(conflictSheet()).toBeNull();
  act(() => store.getState().closeNewLinkDialog());
  expect(conflictSheet()).not.toBeNull();
  expect(store.getState().conflictSheetPath).toBe(PATH);
  fireEvent.click(screen.getByText("Not now"));
  expect(conflictSheet()).toBeNull();
  expect(store.getState().conflictSheetPath).toBeNull();
});
