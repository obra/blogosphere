// @vitest-environment jsdom
// ABOUTME: The title field wraps instead of truncating, stays one line of text:
// ABOUTME: Return moves to the body (except mid-IME), pasted newlines become spaces.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TitleField } from "./TitleField";

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

it("leaves the Return that confirms an IME candidate alone (WebKit ends composition first)", () => {
  const { field } = renderTitle();
  field.focus();
  // WebKit: keyCode 229 on the confirming keydown…
  expect(fireEvent.keyDown(field, { key: "Enter", keyCode: 229 })).toBe(true);
  // …and compositionend already fired just before it.
  fireEvent.compositionEnd(field);
  expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(true);
  expect(document.activeElement).toBe(field);
});

it("turns pasted line breaks into spaces", () => {
  const { field, onChange } = renderTitle("");
  fireEvent.change(field, { target: { value: "Line one\nline two\r\nthree" } });
  expect(onChange).toHaveBeenCalledWith("Line one line two three");
});

it("a pasted multi-line title lands where the caret is, on one line", () => {
  const { field, onChange } = renderTitle("Hello world");
  field.setSelectionRange(6, 11);
  fireEvent.paste(field, { clipboardData: { getData: () => "big\nnew world" } });
  expect(onChange).toHaveBeenLastCalledWith("Hello big new world");
  expect(field.selectionStart).toBe("Hello big new world".length);
});

describe("fitting the height", () => {
  function withScrollHeight(field: HTMLTextAreaElement, height: () => number) {
    Object.defineProperty(field, "scrollHeight", { configurable: true, get: height });
  }

  it("grows to the wrapped text when the layout changes", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TitleField value="Title" onChange={onChange} layoutKey="markdown" />,
    );
    const field = screen.getByLabelText("Title") as HTMLTextAreaElement;
    withScrollHeight(field, () => 100);
    rerender(<TitleField value="Title" onChange={onChange} layoutKey="write" />);
    expect(field.style.height).toBe("100px");
  });

  it("measures again when a web font finishes loading", () => {
    const listeners: Array<() => void> = [];
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
        removeEventListener: () => undefined,
      },
    });
    render(<TitleField value="Title" onChange={vi.fn()} />);
    const field = screen.getByLabelText("Title") as HTMLTextAreaElement;
    withScrollHeight(field, () => 120);
    for (const listener of listeners) {
      listener();
    }
    expect(field.style.height).toBe("120px");
  });
});
