// @vitest-environment jsdom
// ABOUTME: Component tests for SourceEditor — mount, handle-driven edits (bold/
// ABOUTME: italic/code/heading/link/image), the value/readOnly sync effects, and the echo guard.
import { EditorSelection, EditorState } from "@codemirror/state";
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./jsdom-layout-shim";
import type { EditorHandle } from "./markdown-utils";
import { wrapSelection } from "./markdown-utils";
import { Controlled } from "./SourceEditor.test-helpers";

// Not load-bearing for these tests (they scope queries to each render's own
// `container`), but it does mean every test's CodeMirror view gets torn down
// via unmount rather than accumulating for the life of the file.
afterEach(cleanup);

function queryContent(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".cm-content");
}

describe("SourceEditor: mount", () => {
  it("renders the initial value into a CodeMirror content element", () => {
    const handleRef = createRef<EditorHandle>();
    const { container } = render(
      <Controlled handleRef={handleRef} onEmit={vi.fn()} initial="hello world" />,
    );
    expect(queryContent(container)?.textContent).toBe("hello world");
  });

  it("unmounts cleanly", () => {
    const handleRef = createRef<EditorHandle>();
    const { container, unmount } = render(<Controlled handleRef={handleRef} onEmit={vi.fn()} />);
    expect(queryContent(container)).not.toBeNull();
    expect(() => unmount()).not.toThrow();
  });
});

describe("SourceEditor: readOnly", () => {
  it("makes the content element non-editable when readOnly is true", () => {
    const handleRef = createRef<EditorHandle>();
    const { container } = render(
      <Controlled handleRef={handleRef} onEmit={vi.fn()} readOnly={true} />,
    );
    expect(queryContent(container)?.getAttribute("contenteditable")).toBe("false");
  });

  it("leaves the content element editable when readOnly is false", () => {
    const handleRef = createRef<EditorHandle>();
    const { container } = render(
      <Controlled handleRef={handleRef} onEmit={vi.fn()} readOnly={false} />,
    );
    expect(queryContent(container)?.getAttribute("contenteditable")).toBe("true");
  });
});

describe("SourceEditor: EditorHandle actions", () => {
  it("toggleBold wraps an empty selection with ** and calls onChange", () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" />);
    act(() => {
      handleRef.current?.toggleBold();
    });
    expect(onEmit).toHaveBeenCalledWith("****");
  });

  it("toggleItalic wraps an empty selection with _", () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" />);
    act(() => {
      handleRef.current?.toggleItalic();
    });
    expect(onEmit).toHaveBeenCalledWith("__");
  });

  it("toggleInlineCode wraps an empty selection with a backtick pair", () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" />);
    act(() => {
      handleRef.current?.toggleInlineCode();
    });
    expect(onEmit).toHaveBeenCalledWith("``");
  });

  it("toggleHeading2 prefixes the current line with ## ", () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="Title" />);
    act(() => {
      handleRef.current?.toggleHeading2();
    });
    expect(onEmit).toHaveBeenCalledWith("## Title");
  });
});

describe("SourceEditor: EditorHandle actions, continued", () => {
  it("insertLink inserts a [link text](https://) template", () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" />);
    act(() => {
      handleRef.current?.insertLink();
    });
    expect(onEmit).toHaveBeenCalledWith("[link text](https://)");
  });

  it("insertImage inserts a markdown image reference", () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" />);
    act(() => {
      handleRef.current?.insertImage("/assets/2026/07/foo.png", "a keyboard");
    });
    expect(onEmit).toHaveBeenCalledWith("![a keyboard](/assets/2026/07/foo.png)");
  });

  it("is a no-op before the view has mounted (ref not yet attached to anything)", () => {
    const handleRef = createRef<EditorHandle>();
    expect(() => handleRef.current?.toggleBold()).not.toThrow();
  });
});

describe("SourceEditor: sourceLanguage='html'", () => {
  it("insertImage inserts an <img> tag instead of markdown", () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" sourceLanguage="html" />);
    act(() => {
      handleRef.current?.insertImage("/assets/2026/07/foo.png", "a keyboard");
    });
    expect(onEmit).toHaveBeenCalledWith('<img src="/assets/2026/07/foo.png" alt="a keyboard">');
  });

  it("still mounts and renders the initial value (a real .html file's raw text)", () => {
    const handleRef = createRef<EditorHandle>();
    const { container } = render(
      <Controlled
        handleRef={handleRef}
        onEmit={vi.fn()}
        initial="<p>Legacy post body.</p>"
        sourceLanguage="html"
      />,
    );
    expect(queryContent(container)?.textContent).toBe("<p>Legacy post body.</p>");
  });
});

describe("SourceEditor: controlled-loop guard", () => {
  it("does not reset the cursor when the parent echoes the just-emitted value back", () => {
    const handleRef = createRef<EditorHandle>();
    let lastEmitted = "";
    const onEmit = vi.fn((v: string) => {
      lastEmitted = v;
    });
    render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" />);

    act(() => {
      handleRef.current?.toggleBold();
    });
    const afterFirstToggle = lastEmitted;

    // Ground truth, computed independently with the same pure function under
    // test: right after toggleBold on an empty doc, the cursor sits between
    // the two "**" markers. If SourceEditor's guard against re-syncing an
    // echoed value is missing, the parent's re-render (value =
    // afterFirstToggle) would have reset the live selection, and this
    // second toggle would land somewhere else instead.
    const groundTruthState = EditorState.create({
      doc: afterFirstToggle,
      selection: EditorSelection.cursor("**".length),
    });
    const expected = groundTruthState
      .update(wrapSelection(groundTruthState, "_"))
      .state.doc.toString();

    act(() => {
      handleRef.current?.toggleItalic();
    });

    expect(lastEmitted).toBe(expected);
  });

  it("does not call onChange again just because the parent echoed the value back", () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" />);

    act(() => {
      handleRef.current?.toggleBold();
    });
    expect(onEmit).toHaveBeenCalledTimes(1);

    // The Controlled wrapper's setValue(next) above already re-rendered with
    // the echoed value; nothing further should have fired from that alone.
    expect(onEmit).toHaveBeenCalledTimes(1);
  });
});
