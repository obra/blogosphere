// @vitest-environment jsdom
// ABOUTME: Tests for EntryList — year/month grouping, search-box filtering,
// ABOUTME: and the dirty/draft/conflict badges.
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { EntryList } from "./EntryList";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(() => {
  cleanup();
});

function settle(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

it("groups entries by year then month, newest first", async () => {
  const entries = [
    makeEntry({ path: "a.md", kind: "draft", date: "2025-03-01", title: "Old year" }),
    makeEntry({ path: "b.md", kind: "draft", date: "2026-07-10", title: "July late" }),
    makeEntry({ path: "c.md", kind: "draft", date: "2026-01-05", title: "January" }),
  ];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
  });

  const years = screen.getAllByText(/^(2025|2026)$/).map((el) => el.textContent);
  expect(years).toEqual(["2026", "2025"]);
});

it("shows a dirty dot badge only for dirty entries", async () => {
  const entries = [
    makeEntry({ path: "a.md", kind: "draft", date: "2026-01-01", title: "Dirty one", dirty: true }),
    makeEntry({
      path: "b.md",
      kind: "draft",
      date: "2026-01-02",
      title: "Clean one",
      dirty: false,
    }),
  ];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
  });

  const dirtyRow = screen.getByText("Dirty one").closest("button");
  const cleanRow = screen.getByText("Clean one").closest("button");
  expect(dirtyRow && within(dirtyRow).queryByTitle("Unsaved changes")).not.toBeNull();
  expect(cleanRow && within(cleanRow).queryByTitle("Unsaved changes")).toBeNull();
});

it("shows a draft badge for draft:true posts living outside content/drafts", async () => {
  const entries = [
    makeEntry({
      path: "content/blog/2026/2026-01-01-a.md",
      kind: "post",
      draft: true,
      title: "Sneaky draft",
    }),
  ];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
    store.getState().setSection("drafts");
  });

  expect(screen.getByText("Draft")).not.toBeNull();
});

it("shows a conflict badge for a path listed in syncStatus.conflicts", async () => {
  const entries = [makeEntry({ path: "a.md", kind: "draft", title: "Conflicted" })];
  const { store, sync } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
  });
  act(() => {
    sync?.setStatus({ state: "idle", pendingCount: 0, conflicts: ["a.md"], lastSyncAt: null });
  });

  expect(screen.getByText("Conflict")).not.toBeNull();
});

it("filters to search results after the debounce settles", async () => {
  const entries = [
    makeEntry({ path: "a.md", kind: "draft", title: "Findable keyboard post" }),
    makeEntry({ path: "b.md", kind: "draft", title: "Unrelated" }),
  ];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
  });
  expect(screen.getByText("Unrelated")).not.toBeNull();

  fireEvent.change(screen.getByLabelText("Search entries"), { target: { value: "keyboard" } });
  await act(() => settle());

  expect(screen.queryByText("Unrelated")).toBeNull();
  expect(screen.getByText("Findable keyboard post")).not.toBeNull();
});

it("clicking a row selects that entry", async () => {
  const entries = [makeEntry({ path: "a.md", kind: "draft", title: "Pick me" })];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
  });

  fireEvent.click(screen.getByText("Pick me"));

  expect(store.getState().selectedPath).toBe("a.md");
});
