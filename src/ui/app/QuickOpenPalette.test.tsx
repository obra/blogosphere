// @vitest-environment jsdom
// ABOUTME: QuickOpenPalette — fuzzy entry search (recency-first on empty
// ABOUTME: query), keyboard/mouse row activation, and the fixed Commands group.
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { QuickOpenPalette } from "./QuickOpenPalette";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

const SEARCH_LABEL = "Jump to a post";
const ENTRY_11_PATTERN = /Entry 11/;
const ENTRY_10_PATTERN = /Entry 10/;
const ENTRY_0_ONLY_PATTERN = /Entry 0$/;

afterEach(() => {
  cleanup();
});

/** Renders the palette, loads `entries` into the store the same way the
 *  real app does (seeding alone doesn't populate state.entries — a refresh
 *  does), and opens it. */
async function openPalette(entries: ReturnType<typeof makeEntry>[]) {
  const rendered = renderWithStore(<QuickOpenPalette />, { seedEntries: entries });
  await act(async () => {
    await rendered.store.getState().refresh();
    rendered.store.getState().openQuickOpen();
  });
  return rendered;
}

it("renders nothing until opened", () => {
  renderWithStore(<QuickOpenPalette />, { seedEntries: [] });
  expect(screen.queryByRole("dialog", { name: "Quick open" })).toBeNull();
});

it("empty query lists entries most-recently-updated first", async () => {
  await openPalette([
    makeEntry({ path: "a.md", kind: "draft", title: "Older", updatedAt: 100 }),
    makeEntry({ path: "b.md", kind: "draft", title: "Newest", updatedAt: 300 }),
    makeEntry({ path: "c.md", kind: "draft", title: "Middle", updatedAt: 200 }),
  ]);

  const rows = document
    .querySelectorAll(".quick-open-results")[0]
    ?.querySelectorAll(".quick-open-row");
  const titles = [...(rows ?? [])].map((row) => row.textContent);
  expect(titles).toEqual([
    expect.stringContaining("Newest"),
    expect.stringContaining("Middle"),
    expect.stringContaining("Older"),
  ]);
});

it("shows each entry's date as secondary text", async () => {
  await openPalette([
    makeEntry({ path: "a.md", kind: "draft", title: "Older", date: "2026-02-14" }),
  ]);
  expect(screen.getByText("Feb 14, 2026")).not.toBeNull();
});

it("caps entry results at 10, keeping the most recently updated", async () => {
  const entries = Array.from({ length: 12 }, (_, i) =>
    makeEntry({ path: `${i}.md`, kind: "draft", title: `Entry ${i}`, updatedAt: i }),
  );
  await openPalette(entries);

  const rows = document
    .querySelectorAll(".quick-open-results")[0]
    ?.querySelectorAll(".quick-open-row");
  expect(rows).toHaveLength(10);
  // Entry 11 and Entry 10 have the two highest updatedAt values (11, 10).
  expect(screen.getByText(ENTRY_11_PATTERN)).not.toBeNull();
  expect(screen.getByText(ENTRY_10_PATTERN)).not.toBeNull();
  expect(screen.queryByText(ENTRY_0_ONLY_PATTERN)).toBeNull();
});

it("fuzzy-filters by a subsequence that isn't a literal substring", async () => {
  await openPalette([
    makeEntry({ path: "a.md", kind: "post", title: "Kubernetes Notes" }),
    makeEntry({ path: "b.md", kind: "post", title: "Grocery List" }),
  ]);

  fireEvent.change(screen.getByLabelText(SEARCH_LABEL), { target: { value: "kn" } });

  expect(screen.getByText("Kubernetes Notes")).not.toBeNull();
  expect(screen.queryByText("Grocery List")).toBeNull();
});

it("excludes deleted entries", async () => {
  await openPalette([makeEntry({ path: "a.md", kind: "draft", title: "Gone", deleted: true })]);
  expect(screen.queryByText("Gone")).toBeNull();
  expect(screen.getByText("No matching entries.")).not.toBeNull();
});

it("shows an empty-state message when the query matches nothing", async () => {
  await openPalette([makeEntry({ path: "a.md", kind: "draft", title: "Something" })]);
  fireEvent.change(screen.getByLabelText(SEARCH_LABEL), { target: { value: "zzzzz" } });
  expect(screen.getByText("No matching entries.")).not.toBeNull();
});

it("clicking an entry selects it, sets its section, and closes the palette", async () => {
  const { store } = await openPalette([
    makeEntry({ path: "content/drafts/a.md", kind: "draft", title: "My Draft" }),
  ]);

  fireEvent.click(screen.getByText("My Draft"));

  expect(store.getState().selectedPath).toBe("content/drafts/a.md");
  expect(store.getState().section).toBe("drafts");
  expect(store.getState().quickOpenOpen).toBe(false);
});

it("Escape closes the palette", async () => {
  const { store } = await openPalette([
    makeEntry({ path: "a.md", kind: "draft", title: "Something" }),
  ]);
  fireEvent.keyDown(screen.getByLabelText(SEARCH_LABEL), { key: "Escape" });
  expect(store.getState().quickOpenOpen).toBe(false);
});

it("clicking the backdrop closes the palette", async () => {
  const { store } = await openPalette([
    makeEntry({ path: "a.md", kind: "draft", title: "Something" }),
  ]);
  const backdrop = document.querySelector(".dialog-backdrop");
  if (!backdrop) {
    throw new Error("expected a backdrop element");
  }
  fireEvent.click(backdrop);
  expect(store.getState().quickOpenOpen).toBe(false);
});

it("ArrowDown/ArrowUp move the active row, and Enter activates it", async () => {
  const { store } = await openPalette([
    makeEntry({ path: "a.md", kind: "draft", title: "First", updatedAt: 200 }),
    makeEntry({ path: "b.md", kind: "draft", title: "Second", updatedAt: 100 }),
  ]);
  const input = screen.getByLabelText(SEARCH_LABEL);

  // Starts on the first (most recent) row.
  expect(screen.getByText("First").closest("button")).toHaveProperty("dataset.active", "true");

  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getByText("Second").closest("button")).toHaveProperty("dataset.active", "true");
  expect(screen.getByText("First").closest("button")).not.toHaveProperty("dataset.active", "true");

  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(screen.getByText("First").closest("button")).toHaveProperty("dataset.active", "true");

  fireEvent.keyDown(input, { key: "Enter" });
  expect(store.getState().selectedPath).toBe("a.md");
  expect(store.getState().quickOpenOpen).toBe(false);
});

it("arrow-key navigation reaches into the Commands group below the entries", async () => {
  const { store, sync } = await openPalette([
    makeEntry({ path: "a.md", kind: "draft", title: "Only Entry" }),
  ]);
  const input = screen.getByLabelText(SEARCH_LABEL);

  // One entry row (index 0), then the four command rows (indexes 1-4): two
  // ArrowDowns lands on the second command ("New Link…", index 2).
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getByText("New Link…").closest("button")).toHaveProperty("dataset.active", "true");

  // One more (index 3) reaches "Sync Now".
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getByText("Sync Now").closest("button")).toHaveProperty("dataset.active", "true");
  fireEvent.keyDown(input, { key: "Enter" });

  expect(sync?.syncCallCount()).toBe(1);
  expect(store.getState().quickOpenOpen).toBe(false);
});

it("mouse hover sets the active row", async () => {
  await openPalette([
    makeEntry({ path: "a.md", kind: "draft", title: "First", updatedAt: 200 }),
    makeEntry({ path: "b.md", kind: "draft", title: "Second", updatedAt: 100 }),
  ]);

  const secondButton = screen.getByText("Second").closest("button");
  if (!secondButton) {
    throw new Error("expected a row button");
  }
  fireEvent.mouseEnter(secondButton);

  expect(secondButton).toHaveProperty("dataset.active", "true");
  expect(screen.getByText("First").closest("button")).not.toHaveProperty("dataset.active", "true");
});

it("shows a Commands group with New Draft, New Link…, Sync Now, and Activity Log", async () => {
  await openPalette([]);
  expect(screen.getByText("Commands")).not.toBeNull();
  expect(screen.getByText("New Draft")).not.toBeNull();
  expect(screen.getByText("New Link…")).not.toBeNull();
  expect(screen.getByText("Sync Now")).not.toBeNull();
  expect(screen.getByText("Activity Log")).not.toBeNull();
});

it("Sync Now invokes sync and closes the palette", async () => {
  const { store, sync } = await openPalette([]);
  fireEvent.click(screen.getByText("Sync Now"));
  expect(sync?.syncCallCount()).toBe(1);
  expect(store.getState().quickOpenOpen).toBe(false);
});

it("New Link… opens the new-link dialog and closes the palette", async () => {
  const { store } = await openPalette([]);
  fireEvent.click(screen.getByText("New Link…"));
  expect(store.getState().newLinkDialogOpen).toBe(true);
  expect(store.getState().quickOpenOpen).toBe(false);
});

it("Activity Log opens the sync log and closes the palette", async () => {
  const { store } = await openPalette([]);
  fireEvent.click(screen.getByText("Activity Log"));
  expect(store.getState().syncLogOpen).toBe(true);
  expect(store.getState().quickOpenOpen).toBe(false);
});

it("New Draft creates and selects a new draft, and closes the palette", async () => {
  const { store } = await openPalette([]);
  fireEvent.click(screen.getByText("New Draft"));

  expect(store.getState().quickOpenOpen).toBe(false);
  await waitFor(() => {
    expect(store.getState().selectedPath).not.toBeNull();
  });
  expect(store.getState().section).toBe("drafts");
});
