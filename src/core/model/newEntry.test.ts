// ABOUTME: Unit tests for newEntry — the scaffolded post/draft shape must match
// ABOUTME: create-post's own output (type/title/date fences + trailing blank line).

import { describe, expect, it } from "vitest";
import { parseEntry } from "./entry";
import { newEntryImpl } from "./newEntry";

describe("newEntry — post", () => {
  it("matches create-post's shape exactly", () => {
    const { path, raw } = newEntryImpl({ kind: "post", title: "Hello World", date: "2026-07-15" });
    expect(path).toBe("content/blog/2026/2026-07-15-Hello-World.md");
    expect(raw).toBe("---\ntype: post\ntitle: Hello World\ndate: 2026-07-15\n---\n\n");
  });

  it("quotes a title that isn't YAML-plain-safe", () => {
    const { raw } = newEntryImpl({ kind: "post", title: "Title: Subtitle", date: "2026-07-15" });
    expect(raw).toBe('---\ntype: post\ntitle: "Title: Subtitle"\ndate: 2026-07-15\n---\n\n');
  });

  it("parses back cleanly via parseEntry", () => {
    const { path, raw } = newEntryImpl({ kind: "post", title: "Hello World", date: "2026-07-15" });
    const result = parseEntry(path, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.title).toBe("Hello World");
      expect(result.entry.date).toBe("2026-07-15");
      expect(result.entry.type).toBe("post");
      expect(result.entry.draft).toBe(false);
    }
  });
});

describe("newEntry — draft", () => {
  it("is the post template plus draft: true", () => {
    const { path, raw } = newEntryImpl({ kind: "draft", title: "WIP Post", date: "2026-07-15" });
    expect(path).toBe("content/drafts/2026-07-15-WIP-Post.md");
    expect(raw).toBe("---\ntype: post\ntitle: WIP Post\ndate: 2026-07-15\ndraft: true\n---\n\n");
  });

  it("parses back as kind draft with draft:true", () => {
    const { path, raw } = newEntryImpl({ kind: "draft", title: "WIP Post", date: "2026-07-15" });
    const result = parseEntry(path, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.kind).toBe("draft");
      expect(result.entry.draft).toBe(true);
    }
  });
});

describe("newEntry — link", () => {
  it("orders fields as type, url, title, date", () => {
    const { path, raw } = newEntryImpl({
      kind: "link",
      title: "A Great Read",
      date: "2026-07-15",
      url: "https://example.com/article",
    });
    expect(path).toBe("content/_linkblog/2026-07-15-A-Great-Read.md");
    expect(raw).toBe(
      "---\ntype: link\nurl: https://example.com/article\ntitle: A Great Read\ndate: 2026-07-15\n---\n\n",
    );
  });

  it("parses back with url populated", () => {
    const { path, raw } = newEntryImpl({
      kind: "link",
      title: "A Great Read",
      date: "2026-07-15",
      url: "https://example.com/article",
    });
    const result = parseEntry(path, raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.url).toBe("https://example.com/article");
      expect(result.entry.type).toBe("link");
    }
  });
});

describe("newEntry — release", () => {
  it("has no type: field, matching real release files", () => {
    const { path, raw } = newEntryImpl({
      kind: "release",
      title: "my-tool 1.0",
      date: "2026-07-15",
    });
    expect(path).toBe("content/releases/2026/2026-07-15-my-tool-1.0.md");
    expect(raw).toBe("---\ntitle: my-tool 1.0\ndate: 2026-07-15\n---\n\n");
  });
});

describe("newEntry — slug construction", () => {
  it("uses slugify, not literal create-post space-replacement", () => {
    const { path } = newEntryImpl({
      kind: "post",
      title: "A, Title! With Punctuation",
      date: "2026-07-15",
    });
    expect(path).toBe("content/blog/2026/2026-07-15-A-Title-With-Punctuation.md");
  });
});
