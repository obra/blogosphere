// @vitest-environment jsdom
// ABOUTME: The title field wraps instead of truncating, stays one line of text:
// ABOUTME: Return moves to the body (except mid-IME), pasted newlines become spaces.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TitleField } from "./EditorFieldControls";

afterEach(() => {
  cleanup();
  for (const body of document.querySelectorAll(".cm-content")) {
    body.remove();
  }
});

function renderTitle(value = "A long title") {
  const onChange = vi.fn();
  const body = document.createElement("div");
  body.className = "cm-content";
  body.tabIndex = 0;
  document.body.append(body);
  render(<TitleField value={value} onChange={onChange} />);
  const field = screen.getByLabelText("Title") as HTMLTextAreaElement;
  return { field, onChange, body };
}

it("is a text area, so a long title wraps", () => {
  const { field } = renderTitle();
  expect(field.tagName).toBe("TEXTAREA");
  expect(field.rows).toBe(1);
});

it("Return moves focus to the body without adding a line", () => {
  const { field, onChange, body } = renderTitle();
  field.focus();
  const event = fireEvent.keyDown(field, { key: "Enter" });
  expect(event).toBe(false); // default prevented
  expect(document.activeElement).toBe(body);
  expect(onChange).not.toHaveBeenCalled();
});

it("leaves Return alone while an IME is composing", () => {
  const { field } = renderTitle();
  field.focus();
  const event = fireEvent.keyDown(field, { key: "Enter", isComposing: true });
  expect(event).toBe(true);
  expect(document.activeElement).toBe(field);
});

it("turns pasted line breaks into spaces", () => {
  const { field, onChange } = renderTitle("");
  fireEvent.change(field, { target: { value: "Line one\nline two\r\nthree" } });
  expect(onChange).toHaveBeenCalledWith("Line one line two three");
});
