// ABOUTME: Unit tests for path/slug/date rules — kindForPath, pathParts, pathFor,
// ABOUTME: slugify, and permalinkFor, including the corpus's real edge cases.

import { describe, expect, it } from "vitest";
import {
  isManagedPath,
  kindForPath,
  pathFor,
  pathParts,
  permalinkFor,
  slugForPath,
  slugify,
} from "./paths";
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

  it("recognizes a legacy .html post (the ~440 real LiveJournal imports)", () => {
    expect(kindForPath("content/blog/2004/2004-01-24-orkut.html")).toBe("post");
  });

  it("accepts .html uniformly under every managed root, not just content/blog", () => {
    expect(kindForPath("content/drafts/2026-07-15-a-draft.html")).toBe("draft");
    expect(kindForPath("content/_linkblog/2026-07-15-a-link.html")).toBe("link");
    expect(kindForPath("content/releases/2026/2026-07-15-a-release.html")).toBe("release");
  });

  it("rejects a bare '.html' filename (mirrors the '.md' guard)", () => {
    expect(kindForPath("content/blog/2026/.html")).toBeNull();
  });
});

describe("isManagedPath", () => {
  it("mirrors kindForPath", () => {
    expect(isManagedPath("content/blog/2026/2026-07-15-a-post.md")).toBe(true);
    expect(isManagedPath("content/about/index.md")).toBe(false);
  });

  it("recognizes a legacy .html post", () => {
    expect(isManagedPath("content/blog/2004/2004-01-24-orkut.html")).toBe(true);
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

  it("parses a legacy .html filename, stripping the .html extension into the slug", () => {
    expect(pathParts("content/blog/2004/2004-01-24-orkut.html")).toEqual({
      year: "2004",
      date: "2004-01-24",
      slug: "orkut",
    });
  });

  it("parses a numeric-only legacy slug (real corpus shape, e.g. 2002-08-02-4.html)", () => {
    expect(pathParts("content/blog/2002/2002-08-02-4.html")).toEqual({
      year: "2002",
      date: "2002-08-02",
      slug: "4",
    });
  });

  it("falls back to a YYYY parent directory for a dateless .html filename", () => {
    expect(pathParts("content/blog/2025/some-slug.html")).toEqual({
      year: "2025",
      date: null,
      slug: "some-slug",
    });
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

  it("always builds a .md path, even when standing in for a legacy .html entry's slug", () => {
    // pathFor is the canonical *markdown* path builder — it has no concept of
    // "preserve the source extension" (that's planPublishImpl's job; see
    // publish.test.ts). Callers that need to keep a legacy entry's .html
    // extension across a rename/publish must post-process this result.
    expect(pathFor("post", "2026-07-15", "orkut")).toBe("content/blog/2026/2026-07-15-orkut.md");
  });
});

describe("slugForPath", () => {
  it("uses the filename's slug for a conventional dated filename", () => {
    expect(slugForPath("content/blog/2026/2026-07-15-a-post.md")).toBe("a-post");
  });

  it("uses the filename's slug for a dateless file under a YYYY directory", () => {
    expect(slugForPath("content/blog/2026/plain-slug.md")).toBe("plain-slug");
  });

  it("falls back to the bare filename (minus extension) when pathParts can't parse the shape", () => {
    // A managed-but-uncanonical shape: no date prefix, parent isn't a year.
    // The on-disk name IS the slug — it must never be discarded.
    expect(slugForPath("content/releases/some-real-notes.md")).toBe("some-real-notes");
  });

  it("strips .html in the fallback too", () => {
    expect(slugForPath("content/blog/legacy-import.html")).toBe("legacy-import");
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

  it("strips the .html extension from a legacy entry's path when building the slug", () => {
    // Front matter date deliberately omitted (null) here so the permalink is
    // built from the filename-encoded date + slug alone — isolating exactly
    // the extension-stripping behavior this test targets. (The real corpus's
    // .html front matter carries a full timestamp rather than a bare
    // YYYY-MM-DD in its `date:` field, which is a separate, orthogonal
    // concern from extension-stripping — see validate.ts's leadingIsoDate.)
    const entry = makeEntry({
      path: "content/blog/2004/2004-01-24-orkut.html",
      date: null,
      kind: "post",
    });
    expect(permalinkFor(entry)).toBe("/2004/01/24/orkut/");
  });
});
