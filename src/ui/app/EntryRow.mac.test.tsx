// @vitest-environment jsdom
// ABOUTME: macOS entry rows: indicators as words and a dot, a conflict symbol
// ABOUTME: beside the row that opens Resolve for it, and arrow keys between rows.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import { EntryList } from "./EntryList";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

const conflicted = makeEntry({
  path: "content/drafts/2026-03-06-c.md",
  kind: "draft",
  date: "2026-03-06",
  title: "Clashing",
  dirty: true,
});
const plain = makeEntry({
  path: "content/drafts/2026-03-05-p.md",
  kind: "draft",
  date: "2026-03-05",
  title: "Plain",
});
const last = makeEntry({
  path: "content/drafts/2026-03-04-l.md",
  kind: "draft",
  date: "2026-03-04",
  title: "Last",
});

async function renderMacList(platform: "macos" | "web" = "macos") {
  const rendered = renderWithStore(<EntryList />, {
    seedEntries: [conflicted, plain, last],
    shellOptions: { platform },
    syncOptions: {
      status: {
        state: "conflict",
        pendingCount: 0,
        conflicts: [conflicted.path],
        lastSyncAt: null,
      },
    },
  });
  await act(async () => {
    await rendered.store.getState().refresh();
  });
  return rendered;
}

function row(title: string): HTMLElement {
  return screen.getByText(title).closest(".entry-row") as HTMLElement;
}

it("shows Draft as a word and unsaved changes as a dot, not pills", async () => {
  await renderMacList();
  expect(document.querySelector(".pill-badge")).toBeNull();
  expect(row("Plain").querySelector(".entry-row-word")?.textContent).toBe("Draft");
  expect(row("Clashing").querySelector(".dot-badge")).not.toBeNull();
});

it("the conflict symbol, beside its row, opens Resolve for that row only", async () => {
  const { store } = await renderMacList();
  act(() => store.getState().select(plain.path));
  const symbol = screen.getByRole("button", { name: "Resolve conflict in Clashing" });
  expect(row("Clashing").contains(symbol)).toBe(false);
  expect(symbol.tabIndex).toBe(-1);
  fireEvent.click(symbol);
  expect(store.getState().conflictSheetPath).toBe(conflicted.path);
  expect(store.getState().selectedPath).toBe(plain.path);
});

it("marks the selected row's wrapper, so its symbol can follow the selection color", async () => {
  const { store } = await renderMacList();
  act(() => store.getState().select(conflicted.path));
  expect(row("Clashing").parentElement?.getAttribute("data-selected")).toBe("true");
});

it("arrow keys, Home and End still move between rows", async () => {
  const { store } = await renderMacList();
  act(() => store.getState().select(conflicted.path));
  fireEvent.keyDown(row("Clashing"), { key: "ArrowDown" });
  expect(store.getState().selectedPath).toBe(plain.path);
  fireEvent.keyDown(row("Plain"), { key: "End" });
  expect(store.getState().selectedPath).toBe(last.path);
  fireEvent.keyDown(row("Last"), { key: "Home" });
  expect(store.getState().selectedPath).toBe(conflicted.path);
  expect(document.activeElement).toBe(row("Clashing"));
});

it("keeps today's pills elsewhere", async () => {
  await renderMacList("web");
  expect(document.querySelector('.pill-badge[data-kind="conflict"]')).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Resolve conflict in Clashing" })).toBeNull();
});
