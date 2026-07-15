// ABOUTME: Unit tests for denormalize()'s fallback policy — the single
// ABOUTME: implementation shared by pull.ts, engine.ts, and (via a thin
// ABOUTME: wrapper) the app store's local-edit path.

import { describe, expect, it } from "vitest";
import { createModel } from "../model";
import { denormalize, fallbackFrom } from "./entry-fields";
import { baseEntry } from "./testing/fixtures";

const BROKEN_RAW = "no front matter fences here at all";
const GOOD_RAW = "---\ntitle: A Post\ndate: 2026-01-01\n---\n\nBody\n";

describe("denormalize — no fallback given", () => {
  it("returns the parsed fields on success", () => {
    const model = createModel();
    const fields = denormalize(model, "content/blog/2026/2026-01-01-a.md", GOOD_RAW);
    expect(fields).toEqual({
      kind: "post",
      title: "A Post",
      date: "2026-01-01",
      draft: false,
      opaqueId: null,
    });
  });

  it("blanks title/date/draft/opaqueId to their hard-null defaults on a parse failure", () => {
    const model = createModel();
    const fields = denormalize(model, "content/blog/2026/2026-01-01-a.md", BROKEN_RAW);
    expect(fields).toEqual({ kind: "post", title: null, date: null, draft: false, opaqueId: null });
  });

  it('falls back to kindForPath, then "post", when the path itself is unmanaged', () => {
    const model = createModel();
    const fields = denormalize(model, "not/a/managed/path.md", BROKEN_RAW);
    expect(fields.kind).toBe("post");
  });
});

describe("denormalize — with a fallback", () => {
  it("still returns the freshly parsed fields on success (fallback is ignored)", () => {
    const model = createModel();
    const fallback = fallbackFrom({
      kind: "post" as const,
      title: "Stale Title",
      date: "2020-01-01",
      draft: true,
      opaqueId: "stale-id",
    });
    const fields = denormalize(model, "content/blog/2026/2026-01-01-a.md", GOOD_RAW, fallback);
    expect(fields).toEqual({
      kind: "post",
      title: "A Post",
      date: "2026-01-01",
      draft: false,
      opaqueId: null,
    });
  });

  it("preserves the last-known-good fields instead of blanking them on a parse failure", () => {
    const model = createModel();
    const fallback = fallbackFrom({
      kind: "post" as const,
      title: "Last Known Good Title",
      date: "2026-01-01",
      draft: false,
      opaqueId: "kept-id",
    });
    const fields = denormalize(model, "content/blog/2026/2026-01-01-a.md", BROKEN_RAW, fallback);
    expect(fields).toEqual(fallback);
  });
});

describe("fallbackFrom", () => {
  it("lifts exactly the five denormalized fields off a full EntryRecord", () => {
    const record = baseEntry({
      path: "content/drafts/2026-01-01-a.md",
      kind: "draft",
      workingContent: "irrelevant for this test",
      title: "T",
      date: "2026-01-01",
      draft: true,
      opaqueId: null,
    });
    expect(fallbackFrom(record)).toEqual({
      kind: "draft",
      title: "T",
      date: "2026-01-01",
      draft: true,
      opaqueId: null,
    });
  });
});
