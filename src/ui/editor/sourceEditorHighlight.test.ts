// ABOUTME: The source editor's syntax colors: every tag CodeMirror's stock
// ABOUTME: style colored is covered, and only by app tokens (so dark mode works).
import { highlightingFor } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { SOURCE_HIGHLIGHT_RULES, sourceHighlighting } from "./sourceEditorHighlight";

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

  it("covers the tags CodeMirror's stock style colored, which it no longer applies", () => {
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
