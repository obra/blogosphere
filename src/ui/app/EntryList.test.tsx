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

it("shows an HTML badge for a legacy .html entry, not for an ordinary .md one", async () => {
  const entries = [
    makeEntry({
      path: "content/blog/2004/2004-01-24-orkut.html",
      kind: "post",
      title: "Legacy post",
    }),
    makeEntry({
      path: "content/blog/2026/2026-01-01-a.md",
      kind: "post",
      title: "Modern post",
    }),
  ];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
    store.getState().setSection("posts");
  });

  const htmlRow = screen.getByText("Legacy post").closest("button");
  const mdRow = screen.getByText("Modern post").closest("button");
  expect(htmlRow && within(htmlRow).queryByText("HTML")).not.toBeNull();
  expect(mdRow && within(mdRow).queryByText("HTML")).toBeNull();
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

it("renders without an infinite-render loop when no sync is configured yet (no token)", async () => {
  // Regression test: a selector reading `state.syncStatus?.conflicts ?? []`
  // returns a fresh array every call once syncStatus is null (no token
  // saved yet — the ordinary first-run state), which zustand's
  // useSyncExternalStore reads as "changed" on every render and loops
  // forever. See state.types.ts's EMPTY_CONFLICTS.
  const entries = [makeEntry({ path: "a.md", kind: "draft", title: "No sync configured yet" })];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries, withSync: false });
  await act(async () => {
    await store.getState().refresh();
  });

  expect(screen.getByText("No sync configured yet")).not.toBeNull();
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

function rowFor(title: string): HTMLButtonElement {
  const row = screen.getByText(title).closest("button");
  if (!row) {
    throw new Error(`no row button found for "${title}"`);
  }
  return row as HTMLButtonElement;
}

it("ArrowDown moves selection to the next row in visible order and focuses it", async () => {
  const entries = [
    makeEntry({ path: "a.md", kind: "draft", date: "2026-01-02", title: "First" }),
    makeEntry({ path: "b.md", kind: "draft", date: "2026-01-01", title: "Second" }),
  ];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
  });

  const first = rowFor("First");
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowDown" });

  expect(store.getState().selectedPath).toBe("b.md");
  expect(document.activeElement).toBe(rowFor("Second"));
});

it("ArrowUp moves selection to the previous row and stops at the first", async () => {
  const entries = [
    makeEntry({ path: "a.md", kind: "draft", date: "2026-01-02", title: "First" }),
    makeEntry({ path: "b.md", kind: "draft", date: "2026-01-01", title: "Second" }),
  ];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
  });

  const second = rowFor("Second");
  second.focus();
  fireEvent.keyDown(second, { key: "ArrowUp" });
  expect(store.getState().selectedPath).toBe("a.md");

  const first = rowFor("First");
  fireEvent.keyDown(first, { key: "ArrowUp" });
  expect(store.getState().selectedPath).toBe("a.md");
});

it("Home and End jump to the first and last visible rows", async () => {
  const entries = [
    makeEntry({ path: "a.md", kind: "draft", date: "2026-01-03", title: "First" }),
    makeEntry({ path: "b.md", kind: "draft", date: "2026-01-02", title: "Middle" }),
    makeEntry({ path: "c.md", kind: "draft", date: "2026-01-01", title: "Last" }),
  ];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
  });

  const middle = rowFor("Middle");
  middle.focus();
  fireEvent.keyDown(middle, { key: "End" });
  expect(store.getState().selectedPath).toBe("c.md");

  fireEvent.keyDown(rowFor("Last"), { key: "Home" });
  expect(store.getState().selectedPath).toBe("a.md");
});

it("Enter moves focus to the editor surface without changing selection", async () => {
  const entries = [makeEntry({ path: "a.md", kind: "draft", title: "Row" })];
  const { store } = renderWithStore(
    <>
      <EntryList />
      <div className="milkdown">
        <div className="ProseMirror" tabIndex={-1} />
      </div>
    </>,
    { seedEntries: entries },
  );
  await act(async () => {
    await store.getState().refresh();
  });

  const row = rowFor("Row");
  row.focus();
  fireEvent.keyDown(row, { key: "Enter" });

  expect(document.activeElement).toBe(document.querySelector(".milkdown .ProseMirror"));
});

it("does not intercept arrow keys typed in the search input", async () => {
  const entries = [makeEntry({ path: "a.md", kind: "draft", title: "Untouched" })];
  const { store } = renderWithStore(<EntryList />, { seedEntries: entries });
  await act(async () => {
    await store.getState().refresh();
  });

  fireEvent.keyDown(screen.getByLabelText("Search entries"), { key: "ArrowDown" });

  expect(store.getState().selectedPath).toBeNull();
});
