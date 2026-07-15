// ABOUTME: Unit tests for applyEdits — the safety-critical surgical editor.
// ABOUTME: Covers every field/shape combination plus the refusal paths.

import { describe, expect, it } from "vitest";
import { applyEditsImpl } from "./applyEdits";

describe("applyEdits — byte-stability invariant", () => {
  it("applyEdits(raw, []) === raw for a normal file", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-01-01\ntags: [a, b]\n---\n\nBody text\n";
    expect(applyEditsImpl(raw, [])).toEqual({ ok: true, raw });
  });

  it("applyEdits(raw, []) === raw even when the YAML is malformed", () => {
    const raw = "---\ntitle: [unterminated\n---\n\nBody\n";
    expect(applyEditsImpl(raw, [])).toEqual({ ok: true, raw });
  });

  it("applyEdits(raw, []) === raw when there's no front matter at all", () => {
    const raw = "no front matter here";
    expect(applyEditsImpl(raw, [])).toEqual({ ok: true, raw });
  });
});

describe("applyEdits — date, url, type", () => {
  it("replaces date", () => {
    const raw = "---\ntitle: T\ndate: 2025-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "date", value: "2026-07-15" }]);
    expect(result).toEqual({ ok: true, raw: "---\ntitle: T\ndate: 2026-07-15\n---\n\nBody\n" });
  });

  it("replaces an existing url", () => {
    const raw = "---\ntype: link\nurl: https://old.example.com\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "url", value: "https://new.example.com/path" }]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntype: link\nurl: https://new.example.com/path\ndate: 2026-01-01\n---\n\nBody\n",
    });
  });

  it("replaces an existing type", () => {
    const raw = "---\ntype: post\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "type", value: "link" }]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntype: link\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n",
    });
  });
});

describe("applyEdits — replacing a plain scalar", () => {
  it("replaces a title, leaving other lines untouched", () => {
    const raw = "---\ntitle: Old Title\ndate: 2026-01-01\ntags: [a]\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: "New Title" }]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntitle: New Title\ndate: 2026-01-01\ntags: [a]\n---\n\nBody\n",
    });
  });

  it("double-quotes a replacement value that isn't plain-safe", () => {
    const raw = "---\ntitle: Old Title\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: "New: Title" }]);
    expect(result).toEqual({
      ok: true,
      raw: '---\ntitle: "New: Title"\ndate: 2026-01-01\n---\n\nBody\n',
    });
  });
});

describe("applyEdits — replacing a block-scalar title", () => {
  it("collapses a block-scalar title down to a single new line", () => {
    const raw = "---\ntitle: |\n  Old block title\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: "New Title" }]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntitle: New Title\ndate: 2026-01-01\n---\n\nBody\n",
    });
  });
});

describe("applyEdits — replacing a quoted scalar with escaping", () => {
  it("replaces a double-quoted title that itself contains escaped quotes", () => {
    const raw = '---\ntitle: "Today in \\"quotes\\""\ndate: 2026-01-01\n---\n\nBody\n';
    // ": " forces quoting; the embedded quotes need escaping too.
    const result = applyEditsImpl(raw, [{ field: "title", value: 'New: say "hi"' }]);
    expect(result).toEqual({
      ok: true,
      raw: '---\ntitle: "New: say \\"hi\\""\ndate: 2026-01-01\n---\n\nBody\n',
    });
  });

  it("leaves an embedded quote plain when it doesn't force quoting on its own", () => {
    // Embedded quotes are only special at the *start* of a YAML plain
    // scalar; mid-string they're just characters, so this stays unquoted.
    const raw = "---\ntitle: Old\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: 'Say "hi"' }]);
    expect(result).toEqual({
      ok: true,
      raw: '---\ntitle: Say "hi"\ndate: 2026-01-01\n---\n\nBody\n',
    });
  });
});

describe("applyEdits — tags", () => {
  it("replaces an inline tags array", () => {
    const raw = "---\ntitle: T\ntags: [old, tags]\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "tags", value: ["new", "tags"] }]);
    expect(result).toEqual({
      ok: true,
      raw: '---\ntitle: T\ntags: ["new", "tags"]\ndate: 2026-01-01\n---\n\nBody\n',
    });
  });

  it("replaces a block-sequence tags list (release shape) with a single inline-array line", () => {
    const raw = "---\ntitle: T\ntags:\n  - a\n  - b\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "tags", value: ["c"] }]);
    expect(result).toEqual({
      ok: true,
      raw: '---\ntitle: T\ntags: ["c"]\ndate: 2026-01-01\n---\n\nBody\n',
    });
  });

  it("adds a new tags key when none exists", () => {
    const raw = "---\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "tags", value: ["new"] }]);
    expect(result).toEqual({
      ok: true,
      raw: '---\ntitle: T\ndate: 2026-01-01\ntags: ["new"]\n---\n\nBody\n',
    });
  });

  it("removes an existing tags key", () => {
    const raw = "---\ntitle: T\ntags: [a]\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "tags", value: null }]);
    expect(result).toEqual({ ok: true, raw: "---\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n" });
  });

  it("removing an absent tags key is a no-op", () => {
    const raw = "---\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n";
    expect(applyEditsImpl(raw, [{ field: "tags", value: null }])).toEqual({ ok: true, raw });
  });
});

describe("applyEdits — draft flag", () => {
  it("adds draft: true", () => {
    const raw = "---\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "draft", value: true }]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntitle: T\ndate: 2026-01-01\ndraft: true\n---\n\nBody\n",
    });
  });

  it("removes draft: true", () => {
    const raw = "---\ntitle: T\ndate: 2026-01-01\ndraft: true\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "draft", value: null }]);
    expect(result).toEqual({ ok: true, raw: "---\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n" });
  });

  it("removing an absent draft key is a no-op", () => {
    const raw = "---\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n";
    expect(applyEditsImpl(raw, [{ field: "draft", value: null }])).toEqual({ ok: true, raw });
  });
});

describe("applyEdits — opaqueId", () => {
  it("adds an opaqueId", () => {
    const raw = "---\ntitle: T\ndate: 2026-01-01\ndraft: true\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "opaqueId", value: "uuid-1234" }]);
    expect(result).toEqual({
      ok: true,
      raw: '---\ntitle: T\ndate: 2026-01-01\ndraft: true\nopaqueId: "uuid-1234"\n---\n\nBody\n',
    });
  });

  it("removes an existing opaqueId", () => {
    const raw = '---\ntitle: T\ndate: 2026-01-01\nopaqueId: "uuid-1234"\n---\n\nBody\n';
    const result = applyEditsImpl(raw, [{ field: "opaqueId", value: null }]);
    expect(result).toEqual({ ok: true, raw: "---\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n" });
  });
});

describe("applyEdits — unknown keys and key order are preserved", () => {
  it("preserves unrelated unknown keys untouched when editing a known field", () => {
    const raw =
      "---\ntitle: Old\nparent_id: '0'\npassword: ''\ndate: 2026-01-01\ncategories: []\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: "New" }]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntitle: New\nparent_id: '0'\npassword: ''\ndate: 2026-01-01\ncategories: []\n---\n\nBody\n",
    });
  });

  it("applies several edits in one call without cross-corrupting line offsets", () => {
    const raw =
      "---\ntitle: Old\ndate: 2025-01-01\ndraft: true\nopaqueId: abc\ntags: [x]\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [
      { field: "date", value: "2026-07-15" },
      { field: "draft", value: null },
      { field: "opaqueId", value: null },
    ]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntitle: Old\ndate: 2026-07-15\ntags: [x]\n---\n\nBody\n",
    });
  });

  it("later edits to the same field win over earlier ones in the same call", () => {
    const raw = "---\ntitle: Old\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [
      { field: "title", value: "First" },
      { field: "title", value: "Second" },
    ]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntitle: Second\ndate: 2026-01-01\n---\n\nBody\n",
    });
  });
});

describe("applyEdits — new key insertion appends at the end of the block", () => {
  it("appends a brand-new field after existing ones", () => {
    const raw = "---\ntitle: T\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "url", value: "https://example.com" }]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntitle: T\ndate: 2026-01-01\nurl: https://example.com\n---\n\nBody\n",
    });
  });

  it("appends into an empty front matter block", () => {
    const raw = "---\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: "T" }]);
    expect(result).toEqual({ ok: true, raw: "---\ntitle: T\n---\n\nBody\n" });
  });
});

describe("applyEdits — refusal on malformed/unbounded YAML (never guess)", () => {
  it("refuses to edit a field whose value is a flow mapping", () => {
    const raw = "---\ntitle: {a: 1}\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: "New" }]);
    expect(result.ok).toBe(false);
  });

  it("refuses to edit a field whose value is an anchor", () => {
    const raw = "---\ntitle: &t Hello\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: "New" }]);
    expect(result.ok).toBe(false);
  });

  it("refuses to add a field after an unscannable region, rather than risk a duplicate key", () => {
    const raw = "---\nmeta: {a: 1}\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: "New" }]);
    expect(result.ok).toBe(false);
  });

  it("refuses to remove a field after an unscannable region, rather than risk missing it", () => {
    const raw = "---\nmeta: {a: 1}\ndraft: true\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "draft", value: null }]);
    expect(result.ok).toBe(false);
  });

  it("refuses when there's no front matter at all to edit", () => {
    const result = applyEditsImpl("no front matter", [{ field: "title", value: "New" }]);
    expect(result.ok).toBe(false);
  });

  it("still edits a field found before an unscannable region", () => {
    const raw = "---\ntitle: Hello\nmeta: {a: 1}\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "title", value: "New" }]);
    expect(result).toEqual({ ok: true, raw: "---\ntitle: New\nmeta: {a: 1}\n---\n\nBody\n" });
  });
});
