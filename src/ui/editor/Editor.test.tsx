// @vitest-environment jsdom
// ABOUTME: Component tests for Editor — picks the right child per mode, carries `value`
// ABOUTME: across a mode switch, wires the Toolbar to whichever mode is active, and
// ABOUTME: propagates readOnly. Mode-specific edit *content* is covered by
// ABOUTME: SourceEditor.test.tsx/CrepeEditor.test.tsx; this file is about Editor's own
// ABOUTME: mode-selection and wiring logic, not re-testing either editor's internals.
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import "./jsdom-layout-shim";

afterEach(cleanup);

// Same debounce as CrepeEditor.test.tsx — see @milkdown/plugin-listener.
function noopResolveImage(): Promise<string | null> {
  return Promise.resolve(null);
}

function noopOnImage(): Promise<string | null> {
  return Promise.resolve(null);
}

function queryCmContent(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".cm-content");
}

function queryProseMirror(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".milkdown .ProseMirror");
}

describe("Editor: mode selection", () => {
  it("mode=source renders CodeMirror with the initial value, not Crepe", () => {
    const { container } = render(
      <Editor
        value="hello"
        mode="source"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    expect(queryCmContent(container)?.textContent).toBe("hello");
    expect(queryProseMirror(container)).toBeNull();
  });

  it("mode=wysiwyg renders Crepe with the initial value, not CodeMirror", async () => {
    const { container } = render(
      <Editor
        value="hello"
        mode="wysiwyg"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    await waitFor(() => expect(queryProseMirror(container)?.textContent).toBe("hello"));
    expect(queryCmContent(container)).toBeNull();
  });
});

describe("Editor: switching modes carries the value across", () => {
  it("source -> wysiwyg", async () => {
    const { container, rerender } = render(
      <Editor
        value="hello"
        mode="source"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    expect(queryCmContent(container)?.textContent).toBe("hello");
    rerender(
      <Editor
        value="hello"
        mode="wysiwyg"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    await waitFor(() => expect(queryProseMirror(container)?.textContent).toBe("hello"));
  });

  it("wysiwyg -> source", async () => {
    const { container, rerender } = render(
      <Editor
        value="hello"
        mode="wysiwyg"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    await waitFor(() => expect(queryProseMirror(container)?.textContent).toBe("hello"));
    rerender(
      <Editor
        value="hello"
        mode="source"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    expect(queryCmContent(container)?.textContent).toBe("hello");
  });
});

describe("Editor: the Toolbar drives whichever mode is active", () => {
  it("in source mode, its buttons dispatch CodeMirror transactions", () => {
    const onChange = vi.fn();
    const { getByTitle } = render(
      <Editor
        value="Title"
        mode="source"
        onChange={onChange}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    act(() => {
      fireEvent.click(getByTitle("Heading 2"));
    });
    expect(onChange).toHaveBeenCalledWith("## Title");
  });

  it("in wysiwyg mode the static toolbar is absent — Crepe's selection toolbar owns formatting", async () => {
    const onChange = vi.fn();
    const { container, queryByTitle } = render(
      <Editor
        value="Title"
        mode="wysiwyg"
        onChange={onChange}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    await waitFor(() => expect(queryProseMirror(container)).not.toBeNull());
    // No static button row in Write mode (it lives in source mode only)...
    expect(queryByTitle("Heading 2")).toBeNull();
    expect(queryByTitle("Bold")).toBeNull();
    // ...because Crepe mounts its own selection-triggered toolbar instead.
    await waitFor(() => expect(document.querySelector(".milkdown-toolbar")).not.toBeNull());
    // And the left-gutter block tools (drag handle / plus) are disabled.
    expect(document.querySelector(".milkdown-block-handle")).toBeNull();
  });
});

describe("Editor: sourceLanguage='html' (legacy .html entries)", () => {
  it("renders CodeMirror even when mode='wysiwyg' (defense in depth)", () => {
    const { container } = render(
      <Editor
        value="<p>hi</p>"
        mode="wysiwyg"
        sourceLanguage="html"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    expect(queryCmContent(container)?.textContent).toBe("<p>hi</p>");
    expect(queryProseMirror(container)).toBeNull();
  });

  it("renders CodeMirror when mode='source' too", () => {
    const { container } = render(
      <Editor
        value="<p>hi</p>"
        mode="source"
        sourceLanguage="html"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    expect(queryCmContent(container)?.textContent).toBe("<p>hi</p>");
  });

  it("hides the formatting Toolbar entirely", () => {
    const { queryByTitle } = render(
      <Editor
        value="<p>hi</p>"
        mode="source"
        sourceLanguage="html"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    expect(queryByTitle("Bold")).toBeNull();
    expect(queryByTitle("Insert image")).toBeNull();
  });

  it("still shows the Toolbar for an ordinary markdown entry (sourceLanguage omitted)", () => {
    const { queryByTitle } = render(
      <Editor
        value="hello"
        mode="source"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    expect(queryByTitle("Bold")).not.toBeNull();
  });
});

describe("Editor: readOnly", () => {
  it("disables the toolbar and the active (source) editor", () => {
    const { container, getByTitle } = render(
      <Editor
        value="hello"
        mode="source"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
        readOnly={true}
      />,
    );
    expect(getByTitle("Bold").hasAttribute("disabled")).toBe(true);
    expect(queryCmContent(container)?.getAttribute("contenteditable")).toBe("false");
  });

  it("defaults to editable when omitted", () => {
    const { container, getByTitle } = render(
      <Editor
        value="hello"
        mode="source"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
      />,
    );
    expect(getByTitle("Bold").hasAttribute("disabled")).toBe(false);
    expect(queryCmContent(container)?.getAttribute("contenteditable")).toBe("true");
  });
});
