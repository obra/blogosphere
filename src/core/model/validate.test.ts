// ABOUTME: Unit tests for validateForCommit — filename shape, date/filename
// ABOUTME: agreement, per-kind required fields, and round-trip integrity.

import { describe, expect, it } from "vitest";
import { validateForCommit } from "./validate";

describe("validateForCommit — a clean post", () => {
  it("has no issues", () => {
    const raw = "---\ntype: post\ntitle: Hello\ndate: 2026-07-15\n---\n\nBody\n";
    expect(validateForCommit("content/blog/2026/2026-07-15-hello.md", raw)).toEqual([]);
  });
});

describe("validateForCommit — filename pattern", () => {
  it("flags a filename without the YYYY-MM-DD- prefix", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-07-15\n---\n\nBody\n";
    const issues = validateForCommit("content/blog/2026/hello.md", raw);
    expect(issues.some((i) => i.severity === "error" && i.message.includes("pattern"))).toBe(true);
  });
});

describe("validateForCommit — managed root", () => {
  it("flags a path outside every managed content root", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-07-15\n---\n\nBody\n";
    const issues = validateForCommit("content/about/2026-07-15-hello.md", raw);
    expect(issues.some((i) => i.message.includes("recognized content directory"))).toBe(true);
  });
});

describe("validateForCommit — front matter parse failure", () => {
  it("reports the parse error and stops there", () => {
    const issues = validateForCommit(
      "content/blog/2026/2026-07-15-hello.md",
      "no front matter at all",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toContain("could not be parsed");
  });
});

describe("validateForCommit — date/filename agreement", () => {
  it("flags a front matter date that disagrees with the filename date", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-07-16\n---\n\nBody\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.md", raw);
    expect(issues.some((i) => i.message.includes("does not match"))).toBe(true);
  });

  it("is silent when they agree", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-07-15\n---\n\nBody\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.md", raw);
    expect(issues.some((i) => i.message.includes("does not match"))).toBe(false);
  });
});

describe("validateForCommit — required fields", () => {
  it("flags a missing title", () => {
    const raw = "---\ndate: 2026-07-15\n---\n\nBody\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.md", raw);
    expect(issues.some((i) => i.message.includes("missing required field: title"))).toBe(true);
  });

  it("flags a missing date", () => {
    const raw = "---\ntitle: Hello\n---\n\nBody\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.md", raw);
    expect(issues.some((i) => i.message.includes("missing required field: date"))).toBe(true);
  });

  it("flags a link entry with no url", () => {
    const raw = "---\ntype: link\ntitle: A link\ndate: 2026-07-15\n---\n\nBody\n";
    const issues = validateForCommit("content/_linkblog/2026-07-15-a-link.md", raw);
    expect(issues.some((i) => i.message.includes("require a url"))).toBe(true);
  });

  it("does not require url for a post", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-07-15\n---\n\nBody\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.md", raw);
    expect(issues.some((i) => i.message.includes("url"))).toBe(false);
  });

  it("does not require a type field (many real posts omit it)", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-07-15\n---\n\nBody\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.md", raw);
    expect(issues).toEqual([]);
  });
});

describe("validateForCommit — draft flag warning", () => {
  it("warns (not errors) when a content/drafts/ entry lacks draft: true", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-07-15\n---\n\nBody\n";
    const issues = validateForCommit("content/drafts/2026-07-15-hello.md", raw);
    expect(issues).toContainEqual({
      severity: "warning",
      message: expect.stringContaining("draft: true"),
    });
  });

  it("is silent when draft: true is set", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-07-15\ndraft: true\n---\n\nBody\n";
    const issues = validateForCommit("content/drafts/2026-07-15-hello.md", raw);
    expect(issues.some((i) => i.message.includes("draft: true"))).toBe(false);
  });
});
