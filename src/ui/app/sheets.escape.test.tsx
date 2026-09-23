// @vitest-environment jsdom
// ABOUTME: Escape cancels each sheet (Publish, New Link, Conflict, Versions)
// ABOUTME: with focus anywhere in the window, not only inside the sheet.
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConflictDialog } from "./ConflictDialog";
import { NewLinkDialog } from "./NewLinkDialog";
import { PublishDialog } from "./PublishDialog";
import { renderWithStore } from "./testing/renderWithStore";
import { VersionsPanel } from "./VersionsPanel";

afterEach(cleanup);

function pressEscape() {
  fireEvent.keyDown(document.body, { key: "Escape" });
}

it("Publish", () => {
  const onCancel = vi.fn();
  render(
    <PublishDialog
      today="2026-07-15"
      opaqueId={null}
      path="content/drafts/2026-02-01-a.md"
      title="A"
      onPublish={vi.fn()}
      onCancel={onCancel}
    />,
  );
  pressEscape();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("Conflict", () => {
  const onCancel = vi.fn();
  render(
    <ConflictDialog
      path="content/drafts/2026-01-01-a.md"
      mine="mine"
      theirs="theirs"
      onChoose={vi.fn()}
      onCancel={onCancel}
    />,
  );
  pressEscape();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("New Link", () => {
  const { store } = renderWithStore(<NewLinkDialog fetchTitle={null} />);
  act(() => store.getState().openNewLinkDialog());
  act(() => pressEscape());
  expect(store.getState().newLinkDialogOpen).toBe(false);
});

it("Versions", () => {
  const { store } = renderWithStore(<VersionsPanel />);
  act(() => store.getState().openVersions("content/drafts/2026-01-01-a.md"));
  act(() => pressEscape());
  expect(store.getState().versionsPath).toBeNull();
});

it("a closed sheet doesn't swallow Escape", () => {
  const { store } = renderWithStore(<NewLinkDialog fetchTitle={null} />);
  const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
  document.body.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(store.getState().newLinkDialogOpen).toBe(false);
});
