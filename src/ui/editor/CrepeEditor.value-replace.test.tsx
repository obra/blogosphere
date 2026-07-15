// ABOUTME: Regression tests for external value replacement in CrepeEditor — a prop
// ABOUTME: value change must REPLACE the document, never append a second copy.

// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { CrepeEditor } from "./CrepeEditor";
import "./jsdom-layout-shim";

const A = "First body text.";
const B = "Second body text, after publish.";

function noopImage(): Promise<string | null> {
  return Promise.resolve(null);
}
function noopResolve(): Promise<string | null> {
  return Promise.resolve(null);
}

async function settle(): Promise<void> {
  // Crepe creation and replaceAll are async; give them generous microtask room.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
}

function docText(container: HTMLElement): string {
  const pm = container.querySelector(".ProseMirror");
  return pm?.textContent ?? "";
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("CrepeEditor external value replacement", () => {
  it("replaces (not appends) when value changes after mount settles", async () => {
    const { container, rerender } = render(
      <CrepeEditor
        value={A}
        onChange={() => undefined}
        readOnly={false}
        onImage={noopImage}
        resolveImage={noopResolve}
      />,
    );
    await settle();
    expect(occurrences(docText(container), A)).toBe(1);

    rerender(
      <CrepeEditor
        value={B}
        onChange={() => undefined}
        readOnly={false}
        onImage={noopImage}
        resolveImage={noopResolve}
      />,
    );
    await settle();
    const text = docText(container);
    expect(occurrences(text, B)).toBe(1);
    expect(occurrences(text, A)).toBe(0);
  });

  it("renders exactly one copy under StrictMode after a keyed remount (publish path change)", async () => {
    const { container, rerender } = render(
      <StrictMode>
        <CrepeEditor
          key="content/drafts/2026-07-10-a.md"
          value={A}
          onChange={() => undefined}
          readOnly={false}
          onImage={noopImage}
          resolveImage={noopResolve}
        />
      </StrictMode>,
    );
    await settle();
    // Publish: same entry, new path -> keyed remount with (possibly) new value.
    rerender(
      <StrictMode>
        <CrepeEditor
          key="content/blog/2026/2026-07-15-a.md"
          value={B}
          onChange={() => undefined}
          readOnly={false}
          onImage={noopImage}
          resolveImage={noopResolve}
        />
      </StrictMode>,
    );
    await settle();
    const text = docText(container);
    expect(occurrences(text, B)).toBe(1);
    expect(occurrences(text, A)).toBe(0);
    expect(container.querySelectorAll(".milkdown").length).toBe(1);
  });

  it("replaces (not appends) when value changes while creation is in flight", async () => {
    const { container, rerender } = render(
      <CrepeEditor
        value={A}
        onChange={() => undefined}
        readOnly={false}
        onImage={noopImage}
        resolveImage={noopResolve}
      />,
    );
    // Immediately change value BEFORE Crepe's async create() resolves.
    rerender(
      <CrepeEditor
        value={B}
        onChange={() => undefined}
        readOnly={false}
        onImage={noopImage}
        resolveImage={noopResolve}
      />,
    );
    await settle();
    const text = docText(container);
    expect(occurrences(text, B)).toBe(1);
    expect(occurrences(text, A)).toBe(0);
  });
});
