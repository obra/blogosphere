// ABOUTME: Unit tests for the YAML value renderer — plain-safety detection,
// ABOUTME: double-quote escaping, and the per-field FieldEdit line renderer.

import { JSON_SCHEMA, load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { isPlainSafeScalar, renderFieldLine, renderScalar, toDoubleQuoted } from "./yamlScalar";

describe("isPlainSafeScalar", () => {
  it("accepts an ordinary word", () => {
    expect(isPlainSafeScalar("Superpowers")).toBe(true);
  });

  it("accepts a title with commas and punctuation but no colon-space", () => {
    expect(isPlainSafeScalar("Dear diary, today the user asked me if I'm alive")).toBe(true);
  });

  it("rejects the empty string", () => {
    expect(isPlainSafeScalar("")).toBe(false);
  });

  it("rejects leading/trailing whitespace", () => {
    expect(isPlainSafeScalar(" leading")).toBe(false);
    expect(isPlainSafeScalar("trailing ")).toBe(false);
  });

  it("rejects embedded newlines", () => {
    expect(isPlainSafeScalar("two\nlines")).toBe(false);
  });

  it("rejects a title containing ': ' (would read back as a mapping)", () => {
    expect(isPlainSafeScalar("Superpowers: How I'm using coding agents")).toBe(false);
  });

  it("rejects strings that would type-change on reload", () => {
    expect(isPlainSafeScalar("42")).toBe(false); // number
    expect(isPlainSafeScalar("true")).toBe(false); // boolean
    expect(isPlainSafeScalar("false")).toBe(false);
    expect(isPlainSafeScalar("null")).toBe(false);
    expect(isPlainSafeScalar("1.0")).toBe(false); // float
  });

  it("rejects values starting with YAML indicator characters", () => {
    for (const value of [
      "- item",
      "? key",
      "[array",
      "{map",
      "&anchor",
      "*alias",
      "!tag",
      "#comment",
    ]) {
      expect(isPlainSafeScalar(value)).toBe(false);
    }
  });

  it("rejects strings starting with a quote character", () => {
    expect(isPlainSafeScalar('"quoted"')).toBe(false);
    expect(isPlainSafeScalar("'quoted'")).toBe(false);
  });

  it("accepts a hyphenated word that is not a sequence indicator", () => {
    expect(isPlainSafeScalar("I-started-a-company")).toBe(true);
  });
});

describe("toDoubleQuoted", () => {
  it("wraps a plain string in double quotes", () => {
    expect(toDoubleQuoted("hello")).toBe('"hello"');
  });

  it("escapes embedded double quotes", () => {
    expect(toDoubleQuoted('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("escapes backslashes", () => {
    expect(toDoubleQuoted("a\\b")).toBe('"a\\\\b"');
  });

  it("escapes newlines, carriage returns, and tabs", () => {
    expect(toDoubleQuoted("a\nb\rc\td")).toBe('"a\\nb\\rc\\td"');
  });

  it("hex-escapes other control characters", () => {
    expect(toDoubleQuoted("a\x01b")).toBe('"a\\x01b"');
  });

  it("passes through non-ASCII printable characters unescaped", () => {
    expect(toDoubleQuoted("Golfing smallest-agent.js: 803 → 646 bytes")).toBe(
      '"Golfing smallest-agent.js: 803 → 646 bytes"',
    );
  });

  it("every rendered value parses back via js-yaml to the exact original string", () => {
    const samples = [
      "",
      "hello",
      'say "hi"',
      "a\\b",
      "a\nb\rc\td",
      "a\x01b\x1fc",
      "emoji 🎉 and é",
      "42",
      "true",
      ": leading colon-space: value",
    ];
    for (const value of samples) {
      const quoted = toDoubleQuoted(value);
      expect(load(quoted, { schema: JSON_SCHEMA })).toBe(value);
    }
  });
});

describe("renderScalar", () => {
  it("stays plain when safe", () => {
    expect(renderScalar("Superpowers 6")).toBe("Superpowers 6");
  });

  it("double-quotes when unsafe", () => {
    expect(renderScalar("Title: With Colon")).toBe('"Title: With Colon"');
  });
});

describe("renderFieldLine", () => {
  it("renders title as a plain scalar line when safe", () => {
    expect(renderFieldLine({ field: "title", value: "Hello World" })).toBe("title: Hello World\n");
  });

  it("renders title double-quoted when it contains ': '", () => {
    expect(renderFieldLine({ field: "title", value: "Title: Subtitle" })).toBe(
      'title: "Title: Subtitle"\n',
    );
  });

  it("renders date as a plain scalar", () => {
    expect(renderFieldLine({ field: "date", value: "2026-07-15" })).toBe("date: 2026-07-15\n");
  });

  it("renders url as a plain scalar when safe", () => {
    expect(renderFieldLine({ field: "url", value: "https://example.com" })).toBe(
      "url: https://example.com\n",
    );
  });

  it("renders type as a plain scalar", () => {
    expect(renderFieldLine({ field: "type", value: "link" })).toBe("type: link\n");
  });

  it("renders opaqueId always double-quoted (matches the real corpus convention), and null as a removal signal", () => {
    expect(renderFieldLine({ field: "opaqueId", value: "abc-123" })).toBe('opaqueId: "abc-123"\n');
    expect(renderFieldLine({ field: "opaqueId", value: null })).toBeNull();
  });

  it("renders draft as a bare boolean, and null as a removal signal", () => {
    expect(renderFieldLine({ field: "draft", value: true })).toBe("draft: true\n");
    expect(renderFieldLine({ field: "draft", value: false })).toBe("draft: false\n");
    expect(renderFieldLine({ field: "draft", value: null })).toBeNull();
  });

  it("renders tags as a double-quoted inline array, even for plain-safe tag text", () => {
    expect(renderFieldLine({ field: "tags", value: ["a", "b"] })).toBe('tags: ["a", "b"]\n');
  });

  it("renders an empty tags array as tags: []", () => {
    expect(renderFieldLine({ field: "tags", value: [] })).toBe("tags: []\n");
  });

  it("renders null tags as a removal signal", () => {
    expect(renderFieldLine({ field: "tags", value: null })).toBeNull();
  });

  it("escapes quotes inside individual tag values", () => {
    expect(renderFieldLine({ field: "tags", value: ['say "hi"'] })).toBe(
      'tags: ["say \\"hi\\""]\n',
    );
  });
});
