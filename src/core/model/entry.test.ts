// ABOUTME: Unit tests for parseEntry — fence detection, field extraction,
// ABOUTME: unknownKeys, and the malformed-YAML-vs-no-front-matter distinction.

import { describe, expect, it } from "vitest";
import { parseEntry } from "./entry";

const PATH = "content/blog/2026/2026-07-15-a-post.md";

describe("parseEntry — success paths", () => {
  it("parses a plain post", () => {
    const raw = "---\ntype: post\ntitle: Hello\ndate: 2026-07-15\ntags: [a, b]\n---\n\nBody\n";
    const result = parseEntry(PATH, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry).toEqual({
        path: PATH,
        kind: "post",
        raw,
        frontMatterText: "type: post\ntitle: Hello\ndate: 2026-07-15\ntags: [a, b]\n",
        body: "\nBody\n",
        title: "Hello",
        date: "2026-07-15",
        tags: ["a", "b"],
        draft: false,
        opaqueId: null,
        url: null,
        type: "post",
        unknownKeys: [],
      });
    }
  });

  it("strips the trailing newline js-yaml adds to a block-scalar title", () => {
    const raw = "---\ntitle: |\n  A colon: here\ndate: 2026-07-15\n---\n\nBody\n";
    const result = parseEntry(PATH, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.title).toBe("A colon: here");
    }
  });

  it("unescapes a double-quoted title with embedded escaped quotes", () => {
    const raw = '---\ntitle: "Today in \\"quotes\\""\ndate: 2026-07-15\n---\n\nBody\n';
    const result = parseEntry(PATH, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.title).toBe('Today in "quotes"');
    }
  });

  it("collects unknown keys in document order", () => {
    const raw =
      "---\ntitle: T\nparent_id: '0'\ndate: 2026-07-15\npassword: ''\nstatus: publish\n---\n\nBody\n";
    const result = parseEntry(PATH, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.unknownKeys).toEqual(["parent_id", "password", "status"]);
    }
  });

  it("reads a block-sequence tags list (release shape)", () => {
    const raw = "---\ntitle: T\ndate: 2026-07-15\ntags:\n  - a\n  - b\n---\n\nBody\n";
    const result = parseEntry(PATH, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.tags).toEqual(["a", "b"]);
    }
  });
});

describe("parseEntry — more success paths", () => {
  it("reads draft and opaqueId", () => {
    const raw = '---\ntitle: T\ndate: 2026-07-15\ndraft: true\nopaqueId: "uuid-1"\n---\n\nBody\n';
    const result = parseEntry("content/drafts/2026-07-15-x.md", raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.draft).toBe(true);
      expect(result.entry.opaqueId).toBe("uuid-1");
      expect(result.entry.kind).toBe("draft");
    }
  });

  it("defaults fields sanely when keys are entirely absent", () => {
    const raw = "---\ntitle: T\n---\n\nBody\n";
    const result = parseEntry(PATH, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.date).toBeNull();
      expect(result.entry.tags).toEqual([]);
      expect(result.entry.draft).toBe(false);
      expect(result.entry.opaqueId).toBeNull();
      expect(result.entry.url).toBeNull();
      expect(result.entry.type).toBeNull();
    }
  });
});

describe("parseEntry — malformed YAML inside intact fences", () => {
  it("still returns ok:true, with every field null/empty/false and no unknownKeys", () => {
    const raw = "---\ntitle: [unterminated\ndate: 2026-07-15\n---\n\nBody\n";
    const result = parseEntry(PATH, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.title).toBeNull();
      expect(result.entry.date).toBeNull();
      expect(result.entry.tags).toEqual([]);
      expect(result.entry.draft).toBe(false);
      expect(result.entry.opaqueId).toBeNull();
      expect(result.entry.url).toBeNull();
      expect(result.entry.type).toBeNull();
      expect(result.entry.unknownKeys).toEqual([]);
      // raw/frontMatterText/body are still captured correctly — only field
      // extraction degrades, not fence detection.
      expect(result.entry.frontMatterText).toBe("title: [unterminated\ndate: 2026-07-15\n");
      expect(result.entry.body).toBe("\nBody\n");
    }
  });

  it("also degrades gracefully when the front matter parses to a non-object (e.g. a bare scalar)", () => {
    const raw = "---\njust a plain scalar, not a mapping\n---\n\nBody\n";
    const result = parseEntry(PATH, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.title).toBeNull();
      expect(result.entry.unknownKeys).toEqual([]);
    }
  });
});

describe("parseEntry — hard failures", () => {
  it("fails when there's no front matter at all", () => {
    const result = parseEntry(PATH, "# just markdown, no front matter\n");
    expect(result.ok).toBe(false);
  });

  it("fails when the front matter is never closed", () => {
    const result = parseEntry(PATH, "---\ntitle: x\n");
    expect(result.ok).toBe(false);
  });

  it("fails when the path is outside every managed content root", () => {
    const raw = "---\ntitle: x\ndate: 2026-07-15\n---\n\nBody\n";
    const result = parseEntry("content/about/index.md", raw);
    expect(result.ok).toBe(false);
  });
});
