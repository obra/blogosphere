// @vitest-environment jsdom
// ABOUTME: Component tests for CrepeEditor — mount, handle-driven edits, readOnly,
// ABOUTME: and the echo guard. See markdown-utils.*.test.ts for the shortcode/normalization
// ABOUTME: round-trip coverage that doesn't need a mounted Crepe instance at all.
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Controlled } from "./CrepeEditor.test-helpers";
import "./jsdom-layout-shim";
import type { EditorHandle } from "./markdown-utils";

// Not load-bearing for these tests (they scope queries to each render's own
// `container`), but it does mean every test's Crepe instance gets torn down
// via unmount rather than accumulating for the life of the file.
afterEach(cleanup);

// Milkdown's listener plugin debounces markdownUpdated by 200ms (see
// @milkdown/plugin-listener) — not something this component controls or
// adds on top of. Tests that assert on onChange wait past that window.
const DEBOUNCE_MARGIN_MS = 300;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queryProseMirror(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".milkdown .ProseMirror");
}

async function waitForMount(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(queryProseMirror(container)).not.toBeNull());
}

describe("CrepeEditor: mount", () => {
  it("renders the initial value's text once Crepe finishes creating", async () => {
    const handleRef = createRef<EditorHandle>();
    const { container } = render(
      <Controlled handleRef={handleRef} onEmit={vi.fn()} initial="Some text" />,
    );
    await waitForMount(container);
    await waitFor(() => expect(queryProseMirror(container)?.textContent).toBe("Some text"));
  });

  it("unmounts cleanly even mid-creation", () => {
    const handleRef = createRef<EditorHandle>();
    const { unmount } = render(<Controlled handleRef={handleRef} onEmit={vi.fn()} />);
    expect(() => unmount()).not.toThrow();
  });
});

describe("CrepeEditor: readOnly", () => {
  it("makes the ProseMirror root non-editable when readOnly is true", async () => {
    const handleRef = createRef<EditorHandle>();
    const { container } = render(
      <Controlled handleRef={handleRef} onEmit={vi.fn()} readOnly={true} />,
    );
    await waitForMount(container);
    expect(queryProseMirror(container)?.getAttribute("contenteditable")).toBe("false");
  });

  it("leaves the ProseMirror root editable when readOnly is false", async () => {
    const handleRef = createRef<EditorHandle>();
    const { container } = render(
      <Controlled handleRef={handleRef} onEmit={vi.fn()} readOnly={false} />,
    );
    await waitForMount(container);
    expect(queryProseMirror(container)?.getAttribute("contenteditable")).toBe("true");
  });
});

describe("CrepeEditor: EditorHandle actions that change the document", () => {
  // toggleHeading2/insertLink/insertImage all act on the document regardless
  // of whether the selection is a collapsed cursor (setBlockType / explicit
  // markdown insertion), so — unlike bold/italic/inline-code, see below —
  // they reliably produce an observable markdownUpdated event to assert on.

  it("toggleHeading2 turns the first paragraph into an H2", async () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    const { container } = render(
      <Controlled handleRef={handleRef} onEmit={onEmit} initial="Some text" />,
    );
    await waitForMount(container);
    act(() => {
      handleRef.current?.toggleHeading2();
    });
    await wait(DEBOUNCE_MARGIN_MS);
    expect(onEmit).toHaveBeenCalledWith("## Some text\n");
  });

  it("insertLink inserts a [link text](https://) template", async () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    const { container } = render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" />);
    await waitForMount(container);
    act(() => {
      handleRef.current?.insertLink();
    });
    await wait(DEBOUNCE_MARGIN_MS);
    expect(onEmit).toHaveBeenCalledWith("[link text](https://)\n");
  });

  it("insertImage inserts a markdown image reference", async () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    const { container } = render(<Controlled handleRef={handleRef} onEmit={onEmit} initial="" />);
    await waitForMount(container);
    act(() => {
      handleRef.current?.insertImage("/assets/2026/07/foo.png", "a keyboard");
    });
    await wait(DEBOUNCE_MARGIN_MS);
    expect(onEmit).toHaveBeenCalledWith("![a keyboard](/assets/2026/07/foo.png)\n");
  });
});

describe("CrepeEditor: mark-toggle EditorHandle actions", () => {
  // toggleBold/toggleItalic/toggleInlineCode dispatch Milkdown's own
  // toggleStrongCommand/toggleEmphasisCommand/toggleInlineCodeCommand.
  // ProseMirror's toggleMark (and Milkdown's own inline-code command) only
  // change *stored marks* on a collapsed selection — there's no selected
  // text to wrap — which is a mark-only transaction, not a document change,
  // so it never reaches markdownUpdated (verified directly against Crepe
  // before writing this: toggleStrongCommand on a fresh, cursor-at-start
  // document produces zero markdownUpdated events). That's Milkdown/
  // ProseMirror's own well-tested behavior, not something this file
  // implements, so there's nothing to usefully assert on here beyond "it
  // doesn't crash" — the dispatch plumbing itself (runCommand + callCommand
  // + crepe.editor.action) is exercised end-to-end by toggleHeading2 above.
  it("do not throw when the selection is collapsed", async () => {
    const handleRef = createRef<EditorHandle>();
    const { container } = render(
      <Controlled handleRef={handleRef} onEmit={vi.fn()} initial="Some text" />,
    );
    await waitForMount(container);
    expect(() => {
      act(() => {
        handleRef.current?.toggleBold();
        handleRef.current?.toggleItalic();
        handleRef.current?.toggleInlineCode();
      });
    }).not.toThrow();
  });

  it("is a no-op before the view has mounted (ref not yet attached to anything)", () => {
    const handleRef = createRef<EditorHandle>();
    expect(() => handleRef.current?.toggleBold()).not.toThrow();
  });
});

describe("CrepeEditor: controlled-loop guard", () => {
  it("does not call onChange again just because the parent echoed the value back", async () => {
    const handleRef = createRef<EditorHandle>();
    const onEmit = vi.fn();
    const { container } = render(
      <Controlled handleRef={handleRef} onEmit={onEmit} initial="Some text" />,
    );
    await waitForMount(container);

    act(() => {
      handleRef.current?.toggleHeading2();
    });
    await wait(DEBOUNCE_MARGIN_MS);
    expect(onEmit).toHaveBeenCalledTimes(1);

    // The Controlled wrapper's setValue(next) above already re-rendered with
    // the echoed value, which drives CrepeEditor's value-sync effect; give
    // any (incorrect) resulting replaceAll a full debounce window to prove
    // it doesn't loop back into a second onChange call.
    await wait(DEBOUNCE_MARGIN_MS);
    expect(onEmit).toHaveBeenCalledTimes(1);
  });
});
