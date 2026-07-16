// ABOUTME: Unit tests for validateForCommit — filename shape, date/filename
// ABOUTME: agreement, per-kind required fields, and round-trip integrity.

import { describe, expect, it } from "vitest";
import { newEntryImpl } from "./newEntry";
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

  it("accepts a legacy .html filename", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-07-15\n---\n\n<p>Body</p>\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.html", raw);
    expect(issues.some((i) => i.message.includes("pattern"))).toBe(false);
  });
});

describe("validateForCommit — a clean legacy .html post", () => {
  it("has no issues, including a full LiveJournal-export timestamp in the date field", () => {
    // Modeled directly on the real content/blog/2004/2004-01-24-orkut.html
    // shape: the front-matter date carries time-of-day precision the
    // filename doesn't encode. That must not read as a mismatch.
    const raw =
      "---\ntitle: Orkut\ndate: 2004-01-24 00:04:00.000000000 -08:00\ntype: post\n---\n\n<p>Body</p>\n";
    expect(validateForCommit("content/blog/2004/2004-01-24-orkut.html", raw)).toEqual([]);
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

  it("is silent when a full timestamp date's leading YYYY-MM-DD agrees with the filename", () => {
    const raw =
      "---\ntitle: Hello\ndate: 2026-07-15 09:30:00.000000000 -07:00\n---\n\n<p>Body</p>\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.html", raw);
    expect(issues.some((i) => i.message.includes("does not match"))).toBe(false);
  });

  it("still flags a genuine mismatch even when the front matter date has time-of-day precision", () => {
    const raw =
      "---\ntitle: Hello\ndate: 2026-07-16 09:30:00.000000000 -07:00\n---\n\n<p>Body</p>\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.html", raw);
    expect(issues.some((i) => i.message.includes("does not match"))).toBe(true);
  });
});

describe("validateForCommit — required fields", () => {
  it("flags a missing title as an error for a published-lane post", () => {
    const raw = "---\ndate: 2026-07-15\n---\n\nBody\n";
    const issues = validateForCommit("content/blog/2026/2026-07-15-hello.md", raw);
    expect(
      issues.some(
        (i) => i.severity === "error" && i.message.includes("missing required field: title"),
      ),
    ).toBe(true);
  });

  it("a titleless draft is a warning, not an error — drafts are work in progress", () => {
    const raw = '---\ntype: post\ntitle: ""\ndate: 2026-07-15\ndraft: true\n---\n\nBody\n';
    const issues = validateForCommit("content/drafts/2026-07-15-untitled.md", raw);
    expect(issues.some((i) => i.severity === "error")).toBe(false);
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("title"))).toBe(true);
  });

  it("a freshly scaffolded ⌘N draft (empty title) validates clean enough to push", () => {
    const scaffold = newEntryImpl({ kind: "draft", title: "", date: "2026-07-15" });
    const errors = validateForCommit(scaffold.path, scaffold.raw).filter(
      (i) => i.severity === "error",
    );
    expect(errors).toEqual([]);
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
