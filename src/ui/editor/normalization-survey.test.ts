// @vitest-environment jsdom
// ABOUTME: Locks in the "known normalizations" documented on Editor.tsx — a WYSIWYG
// ABOUTME: load->serialize round trip through real Milkdown, so a future Milkdown/remark
// ABOUTME: bump that changes this behavior fails a test instead of silently going stale.
import { describe, expect, it } from "vitest";
import { headlessRoundTrip } from "./headless-milkdown";

describe("normalizations: input changes on round-trip", () => {
  it.each([
    ["setext H1 -> ATX", "Title\n=====\n", "# Title\n"],
    ["setext H2 -> ATX", "Title\n-----\n", "## Title\n"],
    ["bullet markers -> *", "- one\n- two\n", "* one\n\n* two\n"],
    ["ordered-list delimiter ) -> .", "1) one\n2) two\n", "1. one\n2. two\n"],
    ["thematic break -> ***", "a\n\n---\n\nb\n", "a\n\n***\n\nb\n"],
    ["fenced code ~~~ -> ```", "~~~\ncode\n~~~\n", "```\ncode\n```\n"],
    ["indented code block -> fenced", "    code\n", "```\ncode\n```\n"],
    ["hard break trailing spaces -> backslash", "a  \nb\n", "a\\\nb\n"],
    [
      "reference-style link -> inline",
      "[text][ref]\n\n[ref]: http://example.com\n",
      "[text](http://example.com)\n",
    ],
    ["3+ blank lines collapse to 1", "a\n\n\n\nb\n", "a\n\nb\n"],
    ["missing trailing newline is added", "just text", "just text\n"],
    [
      "GFM table separator row is minimized",
      "| a | b |\n| --- | --- |\n| 1 | 2 |\n",
      "| a | b |\n| - | - |\n| 1 | 2 |\n",
    ],
    [
      "a partially-tight list becomes fully loose",
      "- one\n- two\n\n- three\n",
      "* one\n\n* two\n\n* three\n",
    ],
  ])("%s", async (_name, input, expected) => {
    const out = await headlessRoundTrip(input);
    expect(out).toBe(expected);
  });
});

describe("normalizations: input is already stable (documents what does NOT change)", () => {
  it.each([
    ["ATX headings", "## Title\n"],
    ["asterisk emphasis", "This is *italic* text.\n"],
    ["underscore emphasis", "This is _italic_ text.\n"],
    ["double-star strong", "This is **bold** text.\n"],
    ["dunder strong", "This is __bold__ text.\n"],
    ["backtick-fenced code already", "```\ncode\n```\n"],
    ["ordered list already dot-delimited", "1. one\n2. two\n"],
    ["thematic break already ***", "a\n\n***\n\nb\n"],
    ["backslash hard break already", "a\\\nb\n"],
    ["blockquote", "> quoted\n> text\n"],
    ["strikethrough (GFM)", "~~gone~~\n"],
  ])("%s", async (_name, markdown) => {
    const out = await headlessRoundTrip(markdown);
    expect(out).toBe(markdown);
  });
});
