// @vitest-environment jsdom
// ABOUTME: Context menus on macOS: a row's menu acts on that row (not the
// ABOUTME: selection), sections offer New Post / New Link…, other platforms keep the default.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EntryList } from "./EntryList";
import type { MenuCommandId, MenuItemModel } from "./menuModel";
import { Sidebar } from "./Sidebar";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

// The native popup is the boundary: these tests check which items it's
// given and what choosing one does, not how macOS draws the menu.
const popups: Array<{
  key: string;
  models: readonly MenuItemModel[];
  run: (id: MenuCommandId) => void;
  dismiss: () => void;
}> = [];
vi.mock("./menuPopup", () => ({
  popupMenu: (key: string, models: readonly MenuItemModel[], run: (id: MenuCommandId) => void) =>
    new Promise<void>((resolve) => {
      popups.push({ key, models, run, dismiss: resolve });
    }),
}));

beforeEach(() => {
  popups.length = 0;
});
afterEach(cleanup);

const first = makeEntry({
  path: "content/drafts/2026-03-04-first.md",
  kind: "draft",
  date: "2026-03-04",
  title: "First",
});
const second = makeEntry({
  path: "content/drafts/2026-03-05-second.md",
  kind: "draft",
  date: "2026-03-05",
  title: "Second",
});

async function renderList(platform: "macos" | "web") {
  const rendered = renderWithStore(<EntryList />, {
    seedEntries: [first, second],
    shellOptions: { platform },
    storeOverrides: { confirm: () => true },
  });
  await act(async () => {
    await rendered.store.getState().refresh();
  });
  act(() => rendered.store.getState().select(first.path));
  return rendered;
}

function ids(models: readonly MenuItemModel[]): string[] {
  return models.map((model) => (model.kind === "command" ? model.id : "—"));
}

it("right-clicking a row offers that row's commands and acts on it, leaving the selection", async () => {
  const { store } = await renderList("macos");
  fireEvent.contextMenu(screen.getByText("Second"));
  expect(popups).toHaveLength(1);
  expect(popups[0]?.key).toBe("entryRow");
  expect(ids(popups[0]?.models ?? [])).toEqual([
    "openOnSite",
    "copySecretLink",
    "—",
    "publish",
    "delete",
  ]);
  expect(store.getState().selectedPath).toBe(first.path);

  popups[0]?.run("delete");
  await vi.waitFor(() => {
    expect(store.getState().entries.map((entry) => entry.path)).toEqual([first.path]);
  });
});

it("marks the right-clicked row while its menu is up", async () => {
  await renderList("macos");
  const row = screen.getByText("Second").closest(".entry-row");
  fireEvent.contextMenu(row as Element);
  expect(row?.getAttribute("data-context")).toBe("true");
  await act(async () => {
    popups[0]?.dismiss();
    await Promise.resolve();
  });
  expect(row?.getAttribute("data-context")).toBeNull();
});

it("leaves right-click alone on other platforms", async () => {
  await renderList("web");
  fireEvent.contextMenu(screen.getByText("Second"));
  expect(popups).toHaveLength(0);
});

it("sections offer New Post or New Link…, each list under its own key", () => {
  renderWithStore(<Sidebar />, { shellOptions: { platform: "macos" } });
  fireEvent.contextMenu(screen.getByText("Drafts"));
  fireEvent.contextMenu(screen.getByText("Links"));
  fireEvent.contextMenu(screen.getByText("Releases"));
  expect(popups.map((popup) => [popup.key, ids(popup.models)])).toEqual([
    ["section:drafts", ["newPost"]],
    ["section:links", ["newLink"]],
  ]);
});

it("uses the entry as it is now, not a stale search result", async () => {
  const { store } = await renderList("macos");
  const publishedNow = { ...second, draft: false, kind: "post" as const };
  act(() => {
    store.setState({ searchResults: [second], entries: [first, publishedNow] });
  });
  fireEvent.contextMenu(screen.getByText("Second"));
  const publish = popups[0]?.models.find(
    (model) => model.kind === "command" && model.id === "publish",
  );
  expect(publish).toMatchObject({ enabled: false });
});

it("offers no menu for a search result that no longer exists", async () => {
  const { store } = await renderList("macos");
  act(() => {
    store.setState({ searchResults: [second], entries: [first] });
  });
  fireEvent.contextMenu(screen.getByText("Second"));
  expect(popups).toHaveLength(0);
});
