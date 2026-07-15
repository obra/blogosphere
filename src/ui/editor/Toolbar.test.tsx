// @vitest-environment jsdom
// ABOUTME: Component tests for Toolbar — each button dispatches the right EditorHandle
// ABOUTME: method, readOnly disables all of them, and the image button drives file-picker + onImage.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorHandle } from "./markdown-utils";
import { Toolbar } from "./Toolbar";

// This project doesn't wire up @testing-library/react's automatic
// per-test cleanup (no vitest setupFiles), and every test here renders a
// fresh Toolbar into document.body — without this, getByTitle would match
// leftover buttons from earlier tests in the same file.
afterEach(cleanup);

function createFakeHandle(): EditorHandle {
  return {
    toggleBold: vi.fn(),
    toggleItalic: vi.fn(),
    toggleInlineCode: vi.fn(),
    toggleHeading2: vi.fn(),
    insertLink: vi.fn(),
    insertImage: vi.fn(),
  };
}

function noopOnImage(): Promise<string | null> {
  return Promise.resolve(null);
}

function queryFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) {
    throw new Error("expected a hidden file input");
  }
  return input;
}

describe("Toolbar: button wiring", () => {
  it.each([
    ["Bold", "toggleBold"],
    ["Italic", "toggleItalic"],
    ["Inline code", "toggleInlineCode"],
    ["Heading 2", "toggleHeading2"],
    ["Insert link", "insertLink"],
  ] as const)("%s calls handle.%s", (title, method) => {
    const handle = createFakeHandle();
    const handleRef = createRef<EditorHandle>();
    handleRef.current = handle;
    const { getByTitle } = render(
      <Toolbar handle={handleRef} onImage={noopOnImage} readOnly={false} />,
    );
    fireEvent.click(getByTitle(title));
    expect(handle[method]).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the handle ref isn't attached to anything yet", () => {
    const handleRef = createRef<EditorHandle>();
    const { getByTitle } = render(
      <Toolbar handle={handleRef} onImage={noopOnImage} readOnly={false} />,
    );
    expect(() => fireEvent.click(getByTitle("Bold"))).not.toThrow();
  });
});

describe("Toolbar: readOnly", () => {
  it("disables every button", () => {
    const handleRef = createRef<EditorHandle>();
    const { getByTitle } = render(
      <Toolbar handle={handleRef} onImage={noopOnImage} readOnly={true} />,
    );
    for (const title of [
      "Bold",
      "Italic",
      "Inline code",
      "Heading 2",
      "Insert link",
      "Insert image",
    ]) {
      const button = getByTitle(title);
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });

  it("a disabled button's click does not reach the handle", () => {
    const handle = createFakeHandle();
    const handleRef = createRef<EditorHandle>();
    handleRef.current = handle;
    const { getByTitle } = render(
      <Toolbar handle={handleRef} onImage={noopOnImage} readOnly={true} />,
    );
    fireEvent.click(getByTitle("Bold"));
    expect(handle.toggleBold).not.toHaveBeenCalled();
  });
});

describe("Toolbar: image button", () => {
  it("clicking the Image button opens the hidden file picker", () => {
    const handleRef = createRef<EditorHandle>();
    const { container, getByTitle } = render(
      <Toolbar handle={handleRef} onImage={noopOnImage} readOnly={false} />,
    );
    const fileInput = queryFileInput(container);
    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(getByTitle("Insert image"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("picking a file reads its bytes, calls onImage, and inserts the returned ref", async () => {
    const handle = createFakeHandle();
    const handleRef = createRef<EditorHandle>();
    handleRef.current = handle;
    const onImage = vi.fn<(bytes: Uint8Array, ext: string) => Promise<string | null>>(() =>
      Promise.resolve("/assets/2026/07/foo.jpg"),
    );
    const { container } = render(<Toolbar handle={handleRef} onImage={onImage} readOnly={false} />);
    const fileInput = queryFileInput(container);
    const file = new File(["content"], "photo.jpg", { type: "image/jpeg" });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await vi.waitFor(() => expect(handle.insertImage).toHaveBeenCalledTimes(1));

    expect(onImage).toHaveBeenCalledTimes(1);
    const [bytes, ext] = onImage.mock.calls[0] ?? [];
    expect(ext).toBe("jpg");
    expect(bytes && new TextDecoder().decode(bytes)).toBe("content");
    expect(handle.insertImage).toHaveBeenCalledWith("/assets/2026/07/foo.jpg");
  });

  it("does not insert anything when onImage cancels (returns null)", async () => {
    const handle = createFakeHandle();
    const handleRef = createRef<EditorHandle>();
    handleRef.current = handle;
    const { container } = render(
      <Toolbar handle={handleRef} onImage={noopOnImage} readOnly={false} />,
    );
    const fileInput = queryFileInput(container);
    const file = new File(["content"], "photo.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await Promise.resolve();
    await Promise.resolve();

    expect(handle.insertImage).not.toHaveBeenCalled();
  });
});
