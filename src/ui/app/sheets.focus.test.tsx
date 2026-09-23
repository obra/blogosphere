// @vitest-environment jsdom
// ABOUTME: A sheet takes keyboard focus when it opens, so arrow keys and Return
// ABOUTME: can't keep driving the list or editor behind it.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConflictDialog } from "./ConflictDialog";
import { NewLinkDialog } from "./NewLinkDialog";
import { PublishDialog } from "./PublishDialog";
import { renderWithStore } from "./testing/renderWithStore";
import { VersionsPanel } from "./VersionsPanel";

afterEach(cleanup);

const CONFLICT_SHEET = /Resolve conflict/;

function focusIsIn(name: string | RegExp): boolean {
  return screen.getByRole("dialog", { name }).contains(document.activeElement);
}

it("Publish focuses its first field", () => {
  render(
    <PublishDialog
      today="2026-07-15"
      opaqueId={null}
      path="content/drafts/2026-02-01-a.md"
      title="A"
      onPublish={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(document.activeElement).toBe(screen.getByLabelText("Publish date"));
});

it("New Link focuses the URL field", () => {
  const { store } = renderWithStore(<NewLinkDialog fetchTitle={null} />);
  act(() => store.getState().openNewLinkDialog());
  expect(document.activeElement).toBe(screen.getByLabelText("URL"));
});

it("Conflict takes focus", () => {
  render(
    <ConflictDialog
      path="content/drafts/2026-01-01-a.md"
      mine="mine"
      theirs="theirs"
      onChoose={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(focusIsIn(CONFLICT_SHEET)).toBe(true);
});

it("Versions takes focus", () => {
  const { store } = renderWithStore(<VersionsPanel />);
  act(() => store.getState().openVersions("content/drafts/2026-01-01-a.md"));
  expect(focusIsIn("Versions")).toBe(true);
});
