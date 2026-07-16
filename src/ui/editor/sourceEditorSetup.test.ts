// @vitest-environment jsdom
// ABOUTME: Unit tests for sourceEditorSetup.ts's createView — confirms the right
// ABOUTME: CodeMirror language extension (markdown/html) is installed per sourceLanguage.
import { language } from "@codemirror/language";
import { Compartment } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";
import "./jsdom-layout-shim";
import { createView, type ViewRefs } from "./sourceEditorSetup";

function makeRefs(overrides: Partial<ViewRefs> = {}): ViewRefs {
  return {
    lastKnownRef: { current: "" },
    onChangeRef: { current: () => undefined },
    onImageRef: { current: () => Promise.resolve(null) },
    readOnlyRef: { current: false },
    readOnlyCompartment: new Compartment(),
    sourceLanguage: "markdown",
    ...overrides,
  };
}

describe("createView: language selection", () => {
  let container: HTMLElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  it("installs the markdown language by default", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const view = createView(container, makeRefs({ sourceLanguage: "markdown" }));
    expect(view.state.facet(language)?.name).toBe("markdown");
    view.destroy();
  });

  it("installs the html language for sourceLanguage 'html'", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const view = createView(container, makeRefs({ sourceLanguage: "html" }));
    expect(view.state.facet(language)?.name).toBe("html");
    view.destroy();
  });
});
