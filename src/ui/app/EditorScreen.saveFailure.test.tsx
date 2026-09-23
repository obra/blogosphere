// @vitest-environment jsdom
// ABOUTME: A failed autosave shows in its entry's save status, with Try Again,
// ABOUTME: and not on any other entry.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import "../editor/jsdom-layout-shim";
import { EditorScreen } from "./EditorScreen";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

const failing = makeEntry({
  path: "content/drafts/2026-03-04-one.md",
  kind: "draft",
  title: "One",
});
const other = makeEntry({ path: "content/drafts/2026-03-05-two.md", kind: "draft", title: "Two" });

it("says the save failed, and Try Again retries it", async () => {
  const { store } = renderWithStore(<EditorScreen />, {
    seedEntries: [failing, other],
    shellOptions: { platform: "macos" },
  });
  const retry = vi.fn();
  await act(async () => {
    await store.getState().refresh();
    store.getState().select(failing.path);
    store.setState({
      saveFailure: { path: failing.path, message: "Couldn't save your changes.", retry },
    });
  });
  const status = screen.getByText("Couldn't save");
  expect(status.getAttribute("title")).toBe("Couldn't save your changes.");
  fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
  expect(retry).toHaveBeenCalledTimes(1);

  act(() => store.getState().select(other.path));
  expect(screen.queryByText("Couldn't save")).toBeNull();
});
