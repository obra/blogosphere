// ABOUTME: The source editor's syntax colors and caret/selection, all from app
// ABOUTME: tokens: CodeMirror's stock light-theme hex colors fail in dark mode.
import { HighlightStyle, syntaxHighlighting, type TagStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** A calm palette: most syntax stays in the text color; secondary marks
 *  (markdown punctuation, comments, URLs) step back; links, tag and keyword
 *  names take --syntax-accent (a fixed readable blue, never the person's
 *  accent color, which may be yellow); errors are red. Every value is a CSS variable, so light,
 *  dark, and Increase Contrast all resolve through the platform tokens. */
const SOURCE_HIGHLIGHT_RULES: readonly TagStyle[] = [
  {
    tag: [
      tags.meta,
      tags.comment,
      tags.processingInstruction,
      tags.contentSeparator,
      tags.url,
      tags.labelName,
      tags.escape,
    ],
    color: "var(--text-muted)",
  },
  { tag: tags.link, color: "var(--syntax-accent)", textDecoration: "underline" },
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: [tags.keyword, tags.tagName, tags.angleBracket, tags.macroName],
    color: "var(--syntax-accent)",
  },
  {
    tag: [tags.attributeName, tags.propertyName, tags.typeName, tags.className, tags.namespace],
    color: "var(--text-muted)",
  },
  {
    tag: [
      tags.string,
      tags.number,
      tags.atom,
      tags.bool,
      tags.literal,
      tags.regexp,
      tags.inserted,
      tags.deleted,
    ],
    color: "var(--text)",
  },
  { tag: tags.invalid, color: "var(--danger)" },
];

/** Replaces minimalSetup's stock style (a fallback, so any highlighter
 *  switches it off), plus the caret, selection and special-character marks
 *  CodeMirror's base theme draws in light-theme colors. */
const sourceHighlighting = [
  syntaxHighlighting(HighlightStyle.define([...SOURCE_HIGHLIGHT_RULES])),
  EditorView.theme({
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)" },
    ".cm-specialChar": { color: "var(--text-muted)" },
  }),
];

export { SOURCE_HIGHLIGHT_RULES, sourceHighlighting };
