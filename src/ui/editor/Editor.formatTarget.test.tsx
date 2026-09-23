// @vitest-environment jsdom
// ABOUTME: Editor as the Format menu's target: registered while its body has
// ABOUTME: focus (Write or Markdown), never for legacy HTML or read-only bodies.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveEditor } from "./activeEditor";
import { Editor } from "./Editor";
import "./jsdom-layout-shim";

afterEach(cleanup);

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

describe("Editor: the Format menu's target", () => {
  function renderEditor(props: Partial<Parameters<typeof Editor>[0]> = {}) {
    return render(
      <Editor
        value="hello"
        mode="source"
        onChange={vi.fn()}
        resolveImage={noopResolveImage}
        onImage={noopOnImage}
        {...props}
      />,
    );
  }

  it("is the Format menu's editor while its body has focus, and not after", () => {
    const { container } = renderEditor();
    const content = queryCmContent(container);
    if (!content) {
      throw new Error("no CodeMirror content");
    }
    fireEvent.focusIn(content);
    expect(getActiveEditor()).not.toBeNull();
    expect(getActiveEditor()?.handle()).toBeTruthy();
    fireEvent.focusOut(content, { relatedTarget: document.body });
    expect(getActiveEditor()).toBeNull();
  });

  it("stays the target while focus moves within the editor", () => {
    const { container } = renderEditor();
    const content = queryCmContent(container);
    if (!content) {
      throw new Error("no CodeMirror content");
    }
    fireEvent.focusIn(content);
    fireEvent.focusOut(content, { relatedTarget: content.parentElement });
    expect(getActiveEditor()).not.toBeNull();
    fireEvent.focusOut(content, { relatedTarget: null });
  });

  it("is also the target in Write mode", async () => {
    const { container } = renderEditor({ mode: "wysiwyg" });
    await waitFor(() => expect(queryProseMirror(container)).not.toBeNull());
    const body = queryProseMirror(container) as HTMLElement;
    fireEvent.focusIn(body);
    expect(getActiveEditor()).not.toBeNull();
    fireEvent.focusOut(body, { relatedTarget: null });
    expect(getActiveEditor()).toBeNull();
  });

  it("never registers for a legacy HTML body or a read-only one", () => {
    for (const props of [{ sourceLanguage: "html" as const }, { readOnly: true }]) {
      const { container, unmount } = renderEditor(props);
      const content = queryCmContent(container);
      if (!content) {
        throw new Error("no CodeMirror content");
      }
      fireEvent.focusIn(content);
      expect(getActiveEditor()).toBeNull();
      unmount();
    }
  });

  it("clears itself when it unmounts with focus", () => {
    const { container, unmount } = renderEditor();
    const content = queryCmContent(container);
    if (!content) {
      throw new Error("no CodeMirror content");
    }
    fireEvent.focusIn(content);
    unmount();
    expect(getActiveEditor()).toBeNull();
  });
});
