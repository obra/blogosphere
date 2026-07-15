// @vitest-environment jsdom
// ABOUTME: Tests for ConflictDialog — mine/theirs compare rendering and each
// ABOUTME: resolution callback (keep mine / use theirs / edit merged).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictDialog } from "./ConflictDialog";

afterEach(() => {
  cleanup();
});

const BASE_PROPS = {
  path: "content/drafts/2026-01-01-a.md",
  mine: "my version of the text",
  theirs: "their version of the text",
};

describe("ConflictDialog", () => {
  it("shows the mine and theirs text read-only, side by side", () => {
    render(<ConflictDialog {...BASE_PROPS} onChoose={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("Your version")).toHaveProperty("value", BASE_PROPS.mine);
    expect(screen.getByLabelText("Their version")).toHaveProperty("value", BASE_PROPS.theirs);
    expect(screen.getByLabelText("Your version")).toHaveProperty("readOnly", true);
  });

  it("calls onChoose({choose: mine}) for Keep mine", () => {
    const onChoose = vi.fn();
    render(<ConflictDialog {...BASE_PROPS} onChoose={onChoose} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText("Keep mine"));

    expect(onChoose).toHaveBeenCalledWith({ choose: "mine" });
  });

  it("calls onChoose({choose: theirs}) for Use theirs", () => {
    const onChoose = vi.fn();
    render(<ConflictDialog {...BASE_PROPS} onChoose={onChoose} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText("Use theirs"));

    expect(onChoose).toHaveBeenCalledWith({ choose: "theirs" });
  });

  it("calls onCancel for Not now", () => {
    const onCancel = vi.fn();
    render(<ConflictDialog {...BASE_PROPS} onChoose={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByText("Not now"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Edit merged opens an editable textarea seeded with mine, and submits {choose: content}", () => {
    const onChoose = vi.fn();
    render(<ConflictDialog {...BASE_PROPS} onChoose={onChoose} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText("Edit merged"));
    const editor = screen.getByDisplayValue(BASE_PROPS.mine);
    fireEvent.change(editor, { target: { value: "hand-merged result" } });
    fireEvent.click(screen.getByText("Use this version"));

    expect(onChoose).toHaveBeenCalledWith({ choose: "content", content: "hand-merged result" });
  });

  it("Edit merged's Back button returns to the compare view without choosing", () => {
    const onChoose = vi.fn();
    render(<ConflictDialog {...BASE_PROPS} onChoose={onChoose} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText("Edit merged"));
    fireEvent.click(screen.getByText("Back"));

    expect(screen.getByText("Keep mine")).not.toBeNull();
    expect(onChoose).not.toHaveBeenCalled();
  });
});
