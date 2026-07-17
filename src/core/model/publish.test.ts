// ABOUTME: Unit tests for planPublish — date fixup, path move-or-fixup-in-place,
// ABOUTME: and flag removal, covering both real-world draft locations.

import { describe, expect, it } from "vitest";
import { planPublishImpl } from "./publish";
import type { ParsedEntry } from "./types";

function makeEntry(overrides: Partial<ParsedEntry>): ParsedEntry {
  return {
    path: "content/drafts/2026-02-01-a-draft.md",
    kind: "draft",
    raw: "",
    frontMatterText: "",
    body: "",
    title: "A draft",
    date: "2026-02-01",
    tags: [],
    draft: true,
    opaqueId: null,
    url: null,
    type: "post",
    unknownKeys: [],
    ...overrides,
  };
}

describe("planPublish — draft in content/drafts/", () => {
  it("moves the file to content/blog/YYYY/ and sets the new date", () => {
    const entry = makeEntry({});
    const plan = planPublishImpl(entry, { date: "2026-07-15" });
    expect(plan.newPath).toBe("content/blog/2026/2026-07-15-a-draft.md");
    expect(plan.edits).toContainEqual({ field: "date", value: "2026-07-15" });
    expect(plan.edits).toContainEqual({ field: "draft", value: null });
  });

  it("removes opaqueId by default", () => {
    const entry = makeEntry({ opaqueId: "uuid-1" });
    const plan = planPublishImpl(entry, { date: "2026-07-15" });
    expect(plan.edits).toContainEqual({ field: "opaqueId", value: null });
  });

  it("keeps opaqueId alive when asked", () => {
    const entry = makeEntry({ opaqueId: "uuid-1" });
    const plan = planPublishImpl(entry, { date: "2026-07-15", keepOpaqueId: true });
    expect(plan.edits.some((e) => e.field === "opaqueId")).toBe(false);
  });

  it("moves across year boundaries correctly", () => {
    const entry = makeEntry({ path: "content/drafts/2025-12-30-year-end.md" });
    const plan = planPublishImpl(entry, { date: "2026-01-02" });
    expect(plan.newPath).toBe("content/blog/2026/2026-01-02-year-end.md");
  });
});

describe("planPublish — draft:true post already under content/blog/", () => {
  it("stays a post, but its path still gets a date fixup", () => {
    const entry = makeEntry({
      path: "content/blog/2025/2025-04-12-this-is-a-secret-post.md",
      kind: "post",
      opaqueId: "903992fd-9460-49c5-b7ba-ff22df4dd95c",
    });
    const plan = planPublishImpl(entry, { date: "2026-07-15" });
    expect(plan.newPath).toBe("content/blog/2026/2026-07-15-this-is-a-secret-post.md");
    expect(plan.edits).toContainEqual({ field: "date", value: "2026-07-15" });
    expect(plan.edits).toContainEqual({ field: "draft", value: null });
    expect(plan.edits).toContainEqual({ field: "opaqueId", value: null });
  });

  it("moves the year directory too, if the publish date's year differs", () => {
    const entry = makeEntry({ path: "content/blog/2025/2025-04-12-x.md", kind: "post" });
    const plan = planPublishImpl(entry, { date: "2026-01-01" });
    expect(plan.newPath).toBe("content/blog/2026/2026-01-01-x.md");
  });
});

describe("planPublish — non-draft kinds keep their structural kind", () => {
  it("a release stays a release", () => {
    const entry = makeEntry({
      path: "content/releases/2026/2026-02-12-a-release.md",
      kind: "release",
      draft: false,
    });
    const plan = planPublishImpl(entry, { date: "2026-07-15" });
    expect(plan.newPath).toBe("content/releases/2026/2026-07-15-a-release.md");
  });
});

describe("planPublish — preserves a legacy .html entry's extension", () => {
  it("keeps .html when a draft:true .html post already under content/blog/ gets its date fixed up", () => {
    // No real .html file is ever a draft in practice (the corpus's ~440
    // legacy imports are all long-published), but planPublish's "draft:true
    // post outside content/drafts" path is generic over kind/extension —
    // and pathFor (which this ultimately calls) only ever returns .md, so
    // this is exactly the case that needs the extension swapped back.
    const entry = makeEntry({
      path: "content/blog/2004/2004-01-24-orkut.html",
      kind: "post",
      draft: true,
    });
    const plan = planPublishImpl(entry, { date: "2026-07-15" });
    expect(plan.newPath).toBe("content/blog/2026/2026-07-15-orkut.html");
  });

  it("keeps .html for a draft in content/drafts/ that happens to be .html", () => {
    const entry = makeEntry({
      path: "content/drafts/2026-02-01-a-draft.html",
      kind: "draft",
    });
    const plan = planPublishImpl(entry, { date: "2026-07-15" });
    expect(plan.newPath).toBe("content/blog/2026/2026-07-15-a-draft.html");
  });

  it("does not append .html onto an ordinary .md entry", () => {
    const entry = makeEntry({});
    const plan = planPublishImpl(entry, { date: "2026-07-15" });
    expect(plan.newPath.endsWith(".md")).toBe(true);
  });
});

describe("planPublish — always removes the draft flag", () => {
  it("includes the draft removal edit even when draft is already false", () => {
    const entry = makeEntry({
      draft: false,
      kind: "post",
      path: "content/blog/2026/2026-01-01-x.md",
    });
    const plan = planPublishImpl(entry, { date: "2026-07-15" });
    expect(plan.edits).toContainEqual({ field: "draft", value: null });
  });
});

describe("planPublish — honors an explicit slug override", () => {
  it("uses opts.slug for the new path instead of the filename's slug", () => {
    const entry = makeEntry({ path: "content/drafts/2026-02-01-untitled.md" });
    const plan = planPublishImpl(entry, { date: "2026-07-15", slug: "a-better-title" });
    expect(plan.newPath).toBe("content/blog/2026/2026-07-15-a-better-title.md");
  });

  it("slugifies opts.slug before using it in the new path", () => {
    const entry = makeEntry({ path: "content/drafts/2026-02-01-untitled.md" });
    const plan = planPublishImpl(entry, { date: "2026-07-15", slug: "A Better Title!" });
    expect(plan.newPath).toBe("content/blog/2026/2026-07-15-A-Better-Title.md");
  });

  it("falls back to the current filename's slug when opts.slug is omitted", () => {
    const entry = makeEntry({ path: "content/drafts/2026-02-01-a-draft.md" });
    const plan = planPublishImpl(entry, { date: "2026-07-15" });
    expect(plan.newPath).toBe("content/blog/2026/2026-07-15-a-draft.md");
  });

  it("falls back to 'untitled' when opts.slug is given but empty", () => {
    const entry = makeEntry({ path: "content/drafts/2026-02-01-a-draft.md" });
    const plan = planPublishImpl(entry, { date: "2026-07-15", slug: "" });
    expect(plan.newPath).toBe("content/blog/2026/2026-07-15-untitled.md");
  });

  it("does not disturb the edits list (date/draft/opaqueId) when a slug override is given", () => {
    const entry = makeEntry({
      path: "content/drafts/2026-02-01-untitled.md",
      opaqueId: "uuid-1",
    });
    const plan = planPublishImpl(entry, { date: "2026-07-15", slug: "renamed" });
    expect(plan.edits).toContainEqual({ field: "date", value: "2026-07-15" });
    expect(plan.edits).toContainEqual({ field: "draft", value: null });
    expect(plan.edits).toContainEqual({ field: "opaqueId", value: null });
  });
});
