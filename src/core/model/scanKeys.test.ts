// ABOUTME: Unit tests for the top-level key scanner — the line-range boundaries
// ABOUTME: it computes are exactly what applyEdits trusts to splice safely.

import { describe, expect, it } from "vitest";
import { scanTopLevelKeys } from "./scanKeys";
import { splitLinesKeepEnds } from "./textLines";

function scan(frontMatterText: string) {
  return scanTopLevelKeys(splitLinesKeepEnds(frontMatterText));
}

describe("scanTopLevelKeys — plain scalars", () => {
  it("bounds simple single-line values", () => {
    const result = scan("title: Hello\ndate: 2026-01-01\n");
    expect(result.unscannableFrom).toBeNull();
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 0 });
    expect(result.blocks.get("date")).toEqual({ start: 1, end: 1 });
  });

  it("treats an empty value as a single-line null scalar", () => {
    const result = scan("author:\nnext: 1\n");
    expect(result.blocks.get("author")).toEqual({ start: 0, end: 0 });
    expect(result.blocks.get("next")).toEqual({ start: 1, end: 1 });
  });

  it("refuses a plain scalar that looks like it folds onto an indented next line", () => {
    const result = scan("title: This is a long\n  title that continues\ndate: 2026-01-01\n");
    expect(result.blocks.has("title")).toBe(false);
    expect(result.unscannableFrom).toBe(0);
  });
});

describe("scanTopLevelKeys — quoted scalars", () => {
  it("bounds a double-quoted scalar", () => {
    const result = scan('title: "Hello, world"\ndate: 2026-01-01\n');
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 0 });
  });

  it("handles escaped double quotes inside a double-quoted scalar", () => {
    const result = scan('title: "say \\"hi\\" now"\ndate: 2026-01-01\n');
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 0 });
    expect(result.blocks.get("date")).toEqual({ start: 1, end: 1 });
  });

  it("bounds a single-quoted scalar", () => {
    const result = scan("title: 'Hello'\ndate: 2026-01-01\n");
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 0 });
  });

  it("handles a doubled '' escape inside a single-quoted scalar", () => {
    const result = scan("title: 'it''s fine'\ndate: 2026-01-01\n");
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 0 });
    expect(result.blocks.get("date")).toEqual({ start: 1, end: 1 });
  });

  it("refuses a double-quoted scalar that never closes on the line", () => {
    const result = scan('title: "unterminated\ndate: 2026-01-01\n');
    expect(result.blocks.has("title")).toBe(false);
    expect(result.unscannableFrom).toBe(0);
  });
});

describe("scanTopLevelKeys — inline flow arrays", () => {
  it("bounds a simple inline array", () => {
    const result = scan("tags: [a, b, c]\ndate: 2026-01-01\n");
    expect(result.blocks.get("tags")).toEqual({ start: 0, end: 0 });
    expect(result.blocks.get("date")).toEqual({ start: 1, end: 1 });
  });

  it("bounds an empty inline array", () => {
    const result = scan("tags: []\n");
    expect(result.blocks.get("tags")).toEqual({ start: 0, end: 0 });
  });

  it("bounds a quoted-element inline array", () => {
    const result = scan('tags: ["a", "b"]\n');
    expect(result.blocks.get("tags")).toEqual({ start: 0, end: 0 });
  });

  it("ignores brackets that appear inside a quoted array element", () => {
    const result = scan('tags: ["a]b", "c[d"]\ndate: 2026-01-01\n');
    expect(result.blocks.get("tags")).toEqual({ start: 0, end: 0 });
    expect(result.blocks.get("date")).toEqual({ start: 1, end: 1 });
  });

  it("refuses an inline array that never closes on the line", () => {
    const result = scan("tags: [a, b\ndate: 2026-01-01\n");
    expect(result.blocks.has("tags")).toBe(false);
    expect(result.unscannableFrom).toBe(0);
  });
});

describe("scanTopLevelKeys — block scalars", () => {
  it("bounds a single-line block literal scalar", () => {
    const result = scan("title: |\n  Hello there\ndate: 2026-01-01\n");
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 1 });
    expect(result.blocks.get("date")).toEqual({ start: 2, end: 2 });
  });

  it("bounds a multi-line block literal scalar", () => {
    const result = scan("title: |\n  Line one\n  Line two\ndate: 2026-01-01\n");
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 2 });
    expect(result.blocks.get("date")).toEqual({ start: 3, end: 3 });
  });

  it("bounds a folded block scalar (>)", () => {
    const result = scan("title: >\n  Hello there\ndate: 2026-01-01\n");
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 1 });
  });

  it("accepts chomping/indentation indicators", () => {
    for (const indicator of ["|", "|-", "|+", ">", ">-", ">+", "|2"]) {
      const result = scan(`title: ${indicator}\n  content\ndate: 2026-01-01\n`);
      expect(result.blocks.get("title")).toEqual({ start: 0, end: 1 });
    }
  });

  it("refuses an empty block scalar (no indented content follows)", () => {
    const result = scan("title: |\ndate: 2026-01-01\n");
    expect(result.blocks.has("title")).toBe(false);
    expect(result.unscannableFrom).toBe(0);
  });
});

describe("scanTopLevelKeys — block sequences", () => {
  it("bounds a block sequence under an empty key", () => {
    const result = scan("tags:\n  - a\n  - b\ndate: 2026-01-01\n");
    expect(result.blocks.get("tags")).toEqual({ start: 0, end: 2 });
    expect(result.blocks.get("date")).toEqual({ start: 3, end: 3 });
  });

  it("bounds a single-item block sequence", () => {
    const result = scan("tags:\n  - solo\n");
    expect(result.blocks.get("tags")).toEqual({ start: 0, end: 1 });
  });

  it("refuses a nested mapping under an empty key (not a sequence)", () => {
    const result = scan("meta:\n  nested: value\ndate: 2026-01-01\n");
    expect(result.blocks.has("meta")).toBe(false);
    expect(result.unscannableFrom).toBe(0);
  });
});

describe("scanTopLevelKeys — unsupported shapes bail out", () => {
  it("refuses a flow mapping value", () => {
    const result = scan("meta: {a: 1}\ndate: 2026-01-01\n");
    expect(result.blocks.has("meta")).toBe(false);
    expect(result.unscannableFrom).toBe(0);
  });

  it("refuses an anchor", () => {
    const result = scan("title: &anchor Hello\ndate: 2026-01-01\n");
    expect(result.blocks.has("title")).toBe(false);
    expect(result.unscannableFrom).toBe(0);
  });

  it("refuses an alias", () => {
    const result = scan("title: *anchor\ndate: 2026-01-01\n");
    expect(result.blocks.has("title")).toBe(false);
    expect(result.unscannableFrom).toBe(0);
  });

  it("refuses tab-indented content", () => {
    const result = scan("title: x\n\tdate: 2026-01-01\n");
    expect(result.unscannableFrom).toBe(1);
  });

  it("refuses a duplicate top-level key, discarding the first occurrence's block too", () => {
    // js-yaml throws on a duplicate top-level mapping key for the whole
    // document, not just that one key — so the scanner must not leave the
    // first occurrence confidently bounded (see applyEdits.test.ts's
    // "refuses to edit any field once a duplicate key is present").
    const result = scan("title: a\ntitle: b\n");
    expect(result.blocks.size).toBe(0);
    expect(result.unscannableFrom).toBe(1);
  });

  it("discards keys found before an earlier duplicate too", () => {
    const result = scan("title: a\ndate: 2026-01-01\ntitle: b\n");
    expect(result.blocks.size).toBe(0);
    expect(result.unscannableFrom).toBe(2);
  });

  it("keeps everything found before the unscannable point", () => {
    const result = scan("title: Hello\nmeta: {a: 1}\ndate: 2026-01-01\n");
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 0 });
    expect(result.blocks.has("meta")).toBe(false);
    expect(result.blocks.has("date")).toBe(false);
    expect(result.unscannableFrom).toBe(1);
  });
});

describe("scanTopLevelKeys — unknown keys and ordering", () => {
  it("bounds unknown keys just like known ones", () => {
    const result = scan("parent_id: '0'\npassword: ''\ncategories: []\n");
    expect(result.blocks.get("parent_id")).toEqual({ start: 0, end: 0 });
    expect(result.blocks.get("password")).toEqual({ start: 1, end: 1 });
    expect(result.blocks.get("categories")).toEqual({ start: 2, end: 2 });
    expect(result.unscannableFrom).toBeNull();
  });

  it("handles an empty document (no keys at all)", () => {
    const result = scan("");
    expect(result.blocks.size).toBe(0);
    expect(result.unscannableFrom).toBeNull();
  });
});

describe("scanTopLevelKeys — blank lines between keys", () => {
  it("skips a blank line between two top-level keys, bounding both sides", () => {
    const result = scan("title: Hello\n\ndate: 2026-01-01\n");
    expect(result.unscannableFrom).toBeNull();
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 0 });
    expect(result.blocks.get("date")).toEqual({ start: 2, end: 2 });
  });

  it("skips more than one consecutive blank line", () => {
    const result = scan("title: Hello\n\n\ndate: 2026-01-01\n");
    expect(result.unscannableFrom).toBeNull();
    expect(result.blocks.get("date")).toEqual({ start: 3, end: 3 });
  });

  it("skips a trailing blank line after the last key", () => {
    const result = scan("title: Hello\n\n");
    expect(result.unscannableFrom).toBeNull();
    expect(result.blocks.get("title")).toEqual({ start: 0, end: 0 });
  });

  it("still refuses tab-indented content even when the line trims blank-ish", () => {
    // A line containing only a tab is caught by the tab guard, not treated
    // as blank — the tab check still runs first.
    const result = scan("title: x\n\t\ndate: 2026-01-01\n");
    expect(result.unscannableFrom).toBe(1);
  });
});
