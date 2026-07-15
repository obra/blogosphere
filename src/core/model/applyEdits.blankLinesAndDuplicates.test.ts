// ABOUTME: Unit tests for two scanTopLevelKeys edge cases applyEdits relies
// ABOUTME: on: blank lines between keys must not block later edits, and a
// ABOUTME: duplicate top-level key must refuse every edit, not silently no-op.

import { describe, expect, it } from "vitest";
import { applyEditsImpl } from "./applyEdits";

describe("applyEdits — blank lines between top-level keys don't block later edits", () => {
  it("edits a field positioned after a blank line separating two keys", () => {
    // The shape a human or `vim`/Claude-Code edit is likely to produce:
    // a blank line for readability between top-level keys.
    const raw = "---\ntype: post\ntitle: My Draft\n\ndate: 2026-07-10\ndraft: true\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "date", value: "2026-07-15" }]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntype: post\ntitle: My Draft\n\ndate: 2026-07-15\ndraft: true\n---\n\nBody\n",
    });
  });

  it("appends a brand-new field after a blank line without disturbing it", () => {
    const raw = "---\ntitle: T\n\ndate: 2026-01-01\n---\n\nBody\n";
    const result = applyEditsImpl(raw, [{ field: "url", value: "https://example.com" }]);
    expect(result).toEqual({
      ok: true,
      raw: "---\ntitle: T\n\ndate: 2026-01-01\nurl: https://example.com\n---\n\nBody\n",
    });
  });
});

describe("applyEdits — refuses rather than silently no-oping on a duplicate top-level key", () => {
  it("refuses every edit, not just ones touching the duplicated key, once a duplicate key is present", () => {
    const raw = "---\ntitle: Old First\ntitle: Old Second\ndate: 2026-01-01\n---\n\nBody\n";
    const onDuplicated = applyEditsImpl(raw, [{ field: "title", value: "New" }]);
    expect(onDuplicated.ok).toBe(false);
    const onUnrelated = applyEditsImpl(raw, [{ field: "date", value: "2026-07-15" }]);
    expect(onUnrelated.ok).toBe(false);
  });
});
