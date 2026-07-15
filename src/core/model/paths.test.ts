// ABOUTME: Unit tests for path/slug/date rules — kindForPath, pathParts, pathFor,
// ABOUTME: slugify, and permalinkFor, including the corpus's real edge cases.

import { describe, expect, it } from "vitest";
import { isManagedPath, kindForPath, pathFor, pathParts, permalinkFor, slugify } from "./paths";
import type { ParsedEntry } from "./types";

describe("kindForPath", () => {
  it("recognizes a nested post", () => {
    expect(kindForPath("content/blog/2026/2026-07-15-a-post.md")).toBe("post");
  });

  it("recognizes a flat draft", () => {
    expect(kindForPath("content/drafts/2026-07-15-a-draft.md")).toBe("draft");
  });

  it("recognizes a flat link", () => {
    expect(kindForPath("content/_linkblog/2026-07-15-a-link.md")).toBe("link");
  });

  it("recognizes a nested release", () => {
    expect(kindForPath("content/releases/2026/2026-07-15-a-release.md")).toBe("release");
  });

  it("recognizes a legacy flat release (real corpus has one)", () => {
    expect(kindForPath("content/releases/2026-03-30-linux-power-tuning-meteor-lake.md")).toBe(
      "release",
    );
  });

  it("rejects paths outside any managed root", () => {
    expect(kindForPath("content/about/index.md")).toBeNull();
    expect(kindForPath("README.md")).toBeNull();
  });

  it("rejects non-markdown files", () => {
    expect(kindForPath("content/blog/2026/image.png")).toBeNull();
  });

  it("rejects files nested deeper than one directory below the root", () => {
    expect(kindForPath("content/blog/2025/using-graphviz-for-claudemd/CLAUDE.md")).toBeNull();
  });

  it("rejects a directory-data file sitting at the root", () => {
    expect(kindForPath("content/blog/blog.11tydata.js")).toBeNull();
  });
});

describe("isManagedPath", () => {
  it("mirrors kindForPath", () => {
    expect(isManagedPath("content/blog/2026/2026-07-15-a-post.md")).toBe(true);
    expect(isManagedPath("content/about/index.md")).toBe(false);
  });
});

describe("pathParts", () => {
  it("parses a conventional dated filename", () => {
    expect(pathParts("content/blog/2026/2026-07-15-a-post.md")).toEqual({
      year: "2026",
      date: "2026-07-15",
      slug: "a-post",
    });
  });

  it("preserves case and a trailing hyphen in the slug (corpus reality)", () => {
    expect(pathParts("content/blog/2026/2026-01-13-I-started-a-company.md")).toEqual({
      year: "2026",
      date: "2026-01-13",
      slug: "I-started-a-company",
    });
    expect(
      pathParts("content/_linkblog/2025-06-02-a-fascinating-deep-dive-into-claude-code-.md"),
    ).toEqual({
      year: "2025",
      date: "2025-06-02",
      slug: "a-fascinating-deep-dive-into-claude-code-",
    });
  });

  it("falls back to a YYYY parent directory when the filename has no date prefix", () => {
    expect(pathParts("content/blog/2025/some-slug.md")).toEqual({
      year: "2025",
      date: null,
      slug: "some-slug",
    });
  });

  it("returns null when neither the filename nor the parent directory gives a year", () => {
    expect(pathParts("content/drafts/some-slug.md")).toBeNull();
  });

  it("returns null for a non-.md path", () => {
    expect(pathParts("content/blog/2026/image.png")).toBeNull();
  });
});

describe("pathFor", () => {
  it("builds a nested path for post", () => {
    expect(pathFor("post", "2026-07-15", "a-post")).toBe("content/blog/2026/2026-07-15-a-post.md");
  });

  it("builds a nested path for release", () => {
    expect(pathFor("release", "2026-07-15", "a-release")).toBe(
      "content/releases/2026/2026-07-15-a-release.md",
    );
  });

  it("builds a flat path for draft", () => {
    expect(pathFor("draft", "2026-07-15", "a-draft")).toBe("content/drafts/2026-07-15-a-draft.md");
  });

  it("builds a flat path for link", () => {
    expect(pathFor("link", "2026-07-15", "a-link")).toBe("content/_linkblog/2026-07-15-a-link.md");
  });
});

describe("slugify", () => {
  it("replaces whitespace runs with a single hyphen", () => {
    expect(slugify("Hello   World")).toBe("Hello-World");
  });

  it("strips characters outside [A-Za-z0-9._-]", () => {
    expect(slugify("Hello, World!")).toBe("Hello-World");
  });

  it("collapses repeated hyphens produced by stripping punctuation", () => {
    expect(slugify("foo - bar")).toBe("foo-bar");
  });

  it("does not lowercase (matches corpus reality)", () => {
    expect(slugify("I started a company")).toBe("I-started-a-company");
  });

  it("preserves dots and underscores", () => {
    expect(slugify("v1.2.3_release")).toBe("v1.2.3_release");
  });

  it("never returns an empty string", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("!!!")).toBe("untitled");
    expect(slugify("   ")).not.toBe("");
  });
});

function makeEntry(overrides: Partial<ParsedEntry>): ParsedEntry {
  return {
    path: "content/blog/2026/2026-07-15-a-post.md",
    kind: "post",
    raw: "",
    frontMatterText: "",
    body: "",
    title: "A post",
    date: "2026-07-15",
    tags: [],
    draft: false,
    opaqueId: null,
    url: null,
    type: "post",
    unknownKeys: [],
    ...overrides,
  };
}

describe("permalinkFor", () => {
  it("uses the private URL when opaqueId is set, regardless of date", () => {
    expect(permalinkFor(makeEntry({ opaqueId: "abc-123" }))).toBe("/private/abc-123/");
    expect(permalinkFor(makeEntry({ opaqueId: "abc-123", date: null }))).toBe("/private/abc-123/");
  });

  it("builds a date-based permalink from front matter date + filename slug", () => {
    expect(permalinkFor(makeEntry({}))).toBe("/2026/07/15/a-post/");
  });

  it("falls back to the filename-encoded date when front matter has none", () => {
    expect(permalinkFor(makeEntry({ date: null }))).toBe("/2026/07/15/a-post/");
  });

  it("returns null when no date is available anywhere", () => {
    const entry = makeEntry({
      path: "content/drafts/some-slug.md",
      date: null,
      kind: "draft",
    });
    expect(permalinkFor(entry)).toBeNull();
  });
});
