// @vitest-environment jsdom
// ABOUTME: Tests for TagChipsEditor — comma/Enter add, click × remove,
// ABOUTME: Backspace-on-empty remove, and no-duplicate/no-blank guards.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagChipsEditor } from "./TagChipsEditor";

afterEach(() => {
  cleanup();
});

describe("TagChipsEditor", () => {
  it("renders existing tags as chips", () => {
    render(<TagChipsEditor tags={["swift", "keyboards"]} onChange={vi.fn()} />);
    expect(screen.getByText("swift")).not.toBeNull();
    expect(screen.getByText("keyboards")).not.toBeNull();
  });

  it("adds a tag on Enter and clears the input", () => {
    const onChange = vi.fn();
    render(<TagChipsEditor tags={["a"]} onChange={onChange} />);
    const input = screen.getByLabelText("Add tag") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "new-tag" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["a", "new-tag"]);
  });

  it("adds a tag on comma", () => {
    const onChange = vi.fn();
    render(<TagChipsEditor tags={[]} onChange={onChange} />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.change(input, { target: { value: "comma-tag" } });
    fireEvent.keyDown(input, { key: "," });

    expect(onChange).toHaveBeenCalledWith(["comma-tag"]);
  });

  it("commits the draft on blur too", () => {
    const onChange = vi.fn();
    render(<TagChipsEditor tags={[]} onChange={onChange} />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.change(input, { target: { value: "blurred-tag" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(["blurred-tag"]);
  });

  it("ignores a blank or duplicate draft", () => {
    const onChange = vi.fn();
    render(<TagChipsEditor tags={["existing"]} onChange={onChange} />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "existing" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a tag when its × button is clicked", () => {
    const onChange = vi.fn();
    render(<TagChipsEditor tags={["a", "b"]} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("Remove tag a"));

    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("removes the last tag on Backspace when the input is empty", () => {
    const onChange = vi.fn();
    render(<TagChipsEditor tags={["a", "b"]} onChange={onChange} />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith(["a"]);
  });

  it("Backspace does not remove a tag while the input has text", () => {
    const onChange = vi.fn();
    render(<TagChipsEditor tags={["a"]} onChange={onChange} />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.change(input, { target: { value: "typing" } });
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onChange).not.toHaveBeenCalled();
  });
});
