// @vitest-environment jsdom
// ABOUTME: focusEntrySearch — Edit › Find › Search Entries puts the cursor in
// ABOUTME: the list's search field with any existing query selected.
import { act, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EntryList } from "./EntryList";
import { focusEntrySearch } from "./entrySearchFocus";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

it("focuses the search field and selects what's already there", () => {
  const { getByLabelText, store } = renderWithStore(<EntryList />);
  act(() => {
    store.getState().setSearchQuery("hello");
  });
  const field = getByLabelText("Search entries") as HTMLInputElement;
  focusEntrySearch();
  expect(document.activeElement).toBe(field);
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, 5]);
});

it("does nothing when the list isn't on screen", () => {
  expect(() => focusEntrySearch()).not.toThrow();
});
