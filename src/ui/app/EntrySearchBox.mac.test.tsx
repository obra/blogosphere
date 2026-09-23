// @vitest-environment jsdom
// ABOUTME: The macOS search field: a leading magnifier, and WebKit's own clear
// ABOUTME: button (and Escape) emptying the search in the store, not just the field.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EntryList } from "./EntryList";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

it("shows a magnifier on macOS only", () => {
  renderWithStore(<EntryList />, { shellOptions: { platform: "macos" } });
  expect(document.querySelector(".entry-list-search .search-magnifier")).not.toBeNull();
  cleanup();
  renderWithStore(<EntryList />);
  expect(document.querySelector(".entry-list-search .search-magnifier")).toBeNull();
});

it("clearing the field (WebKit's clear button fires input) clears the search", () => {
  const { store } = renderWithStore(<EntryList />, { shellOptions: { platform: "macos" } });
  const field = screen.getByLabelText("Search entries");
  fireEvent.change(field, { target: { value: "birds" } });
  expect(store.getState().searchQuery).toBe("birds");
  act(() => {
    fireEvent.input(field, { target: { value: "" } });
  });
  expect(store.getState().searchQuery).toBe("");
});
