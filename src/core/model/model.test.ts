// ABOUTME: Integration tests for createModel() — exercises every ModelApi method
// ABOUTME: through the composed object, plus a full create -> edit -> publish flow.

import { describe, expect, it } from "vitest";
import { createModel } from "./model";
import type { EditResult, ParsedEntry } from "./types";

describe("createModel", () => {
  it("is stateless: two instances behave identically", () => {
    const a = createModel();
    const b = createModel();
    const raw = "---\ntitle: Hello\ndate: 2026-07-15\n---\n\nBody\n";
    expect(a.parseEntry("content/blog/2026/2026-07-15-hello.md", raw)).toEqual(
      b.parseEntry("content/blog/2026/2026-07-15-hello.md", raw),
    );
  });

  it("exposes every ModelApi method as a callable function", () => {
    const model = createModel();
    for (const method of [
      "parseEntry",
      "kindForPath",
      "isManagedPath",
      "pathParts",
      "pathFor",
      "slugify",
      "permalinkFor",
      "applyEdits",
      "replaceBody",
      "newEntry",
      "planPublish",
      "validateForCommit",
    ] as const) {
      expect(typeof model[method]).toBe("function");
    }
  });
});

/**
 * Unwraps an ok:true EditResult, throwing (not silently swallowing) if the
 * edit the lifecycle test expects to succeed didn't — an uncaught throw
 * inside an it() callback fails that test with this message attached.
 * Deliberately doesn't call expect() itself: it's a plain control-flow
 * helper, not an assertion, so it's fine to share across it() blocks.
 */
function unwrapOk(result: EditResult): string {
  if (!result.ok) {
    throw new Error(`expected an ok EditResult, got error: ${result.error}`);
  }
  return result.raw;
}

function unwrapEntry(
  model: ReturnType<typeof createModel>,
  path: string,
  raw: string,
): ParsedEntry {
  const result = model.parseEntry(path, raw);
  if (!result.ok) {
    throw new Error(`expected ${path} to parse, got error: ${result.error}`);
  }
  return result.entry;
}

describe("createModel — full lifecycle: create, edit, share, publish, keeping the link", () => {
  const model = createModel();
  const created = model.newEntry({ kind: "draft", title: "My New Idea", date: "2026-07-01" });
  let { raw } = created;

  it("creates a new draft at the conventional drafts path", () => {
    expect(created.path).toBe("content/drafts/2026-07-01-My-New-Idea.md");
  });

  it("accepts a body via replaceBody", () => {
    raw = unwrapOk(model.replaceBody(raw, "\nHere's the idea, fleshed out.\n"));
    expect(unwrapEntry(model, created.path, raw).body).toBe("\nHere's the idea, fleshed out.\n");
  });

  it("gets a shareable secret link once opaqueId is set", () => {
    raw = unwrapOk(model.applyEdits(raw, [{ field: "opaqueId", value: "shared-uuid-1" }]));
    const entry = unwrapEntry(model, created.path, raw);
    expect(model.permalinkFor(entry)).toBe("/private/shared-uuid-1/");
  });

  it("publishes to content/blog/YYYY/, keeping the secret link alive on request", () => {
    const entry = unwrapEntry(model, created.path, raw);
    const plan = model.planPublish(entry, { date: "2026-07-15", keepOpaqueId: true });
    expect(plan.newPath).toBe("content/blog/2026/2026-07-15-My-New-Idea.md");

    raw = unwrapOk(model.applyEdits(raw, plan.edits));
    const published = unwrapEntry(model, plan.newPath, raw);
    expect(published.draft).toBe(false);
    expect(published.opaqueId).toBe("shared-uuid-1");
    expect(published.date).toBe("2026-07-15");
    expect(published.title).toBe("My New Idea");
    expect(model.permalinkFor(published)).toBe("/private/shared-uuid-1/");
    expect(model.validateForCommit(plan.newPath, raw)).toEqual([]);
  });
});

describe("createModel — publishing without keepOpaqueId kills the secret link", () => {
  it("falls back to the public date-based permalink", () => {
    const model = createModel();
    const created = model.newEntry({ kind: "draft", title: "Another Idea", date: "2026-07-01" });
    const shared = unwrapOk(
      model.applyEdits(created.raw, [{ field: "opaqueId", value: "uuid-2" }]),
    );

    const entry = unwrapEntry(model, created.path, shared);
    const plan = model.planPublish(entry, { date: "2026-07-15" });
    const publishedRaw = unwrapOk(model.applyEdits(shared, plan.edits));

    const published = unwrapEntry(model, plan.newPath, publishedRaw);
    expect(published.opaqueId).toBeNull();
    expect(model.permalinkFor(published)).toBe("/2026/07/15/Another-Idea/");
  });
});
