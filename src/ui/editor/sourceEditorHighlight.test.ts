// ABOUTME: The source editor's syntax colors: the real editor uses them (not the
// ABOUTME: stock hex style), they cover what the stock style colored, all via tokens.
import { defaultHighlightStyle, highlightingFor } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { SOURCE_HIGHLIGHT_RULES, sourceHighlighting } from "./sourceEditorHighlight";
import { buildExtensions } from "./sourceEditorSetup";

const HEX = /#[0-9a-f]{3,8}\b/i;

describe("source editor highlighting", () => {
  it("colors only through CSS variables (tokens adapt to dark mode and Increase Contrast)", () => {
    for (const rule of SOURCE_HIGHLIGHT_RULES) {
      for (const value of Object.values(rule)) {
        if (typeof value === "string") {
          expect(value).not.toMatch(HEX);
        }
      }
    }
  });

  it("never uses the person's accent color for text (a yellow accent is 1.6:1 on white)", () => {
    const colors = SOURCE_HIGHLIGHT_RULES.map((rule) => rule.color).filter(Boolean);
    expect(colors).not.toContain("var(--accent)");
    expect(colors).toContain("var(--syntax-accent)");
  });

  it("is what the real editor uses: CodeMirror's stock hex style no longer applies", () => {
    for (const sourceLanguage of ["markdown", "html"] as const) {
      const state = EditorState.create({
        extensions: buildExtensions({
          initialReadOnly: false,
          readOnlyCompartment: new Compartment(),
          onDocChanged: () => undefined,
          getOnImage: () => () => Promise.resolve(null),
          sourceLanguage,
        }),
      });
      const ours = EditorState.create({ extensions: sourceHighlighting });
      for (const tag of [tags.link, tags.tagName, tags.comment, tags.url]) {
        expect(highlightingFor(state, [tag])).toBe(highlightingFor(ours, [tag]));
        expect(highlightingFor(state, [tag])).not.toBe(defaultHighlightStyle.style([tag]));
      }
    }
  });

  it("styles the tags Markdown and HTML entries produce (script-only tags stay plain text)", () => {
    const state = EditorState.create({ extensions: sourceHighlighting });
    for (const tag of [
      tags.keyword,
      tags.tagName,
      tags.attributeName,
      tags.string,
      tags.comment,
      tags.meta,
      tags.url,
      tags.link,
      tags.heading,
      tags.emphasis,
      tags.strong,
      tags.strikethrough,
      tags.invalid,
      tags.number,
      tags.atom,
      tags.labelName,
      tags.contentSeparator,
      tags.escape,
      tags.processingInstruction,
    ]) {
      expect(highlightingFor(state, [tag]), String(tag)).not.toBeNull();
    }
  });
});
