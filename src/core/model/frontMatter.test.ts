// ABOUTME: Unit tests for fence detection and replaceBody — the byte-stability
// ABOUTME: invariant (raw === open+fm+close+body, always) is proven here directly.

import { describe, expect, it } from "vitest";
import { joinFrontMatterSplit, replaceBodyImpl, splitFrontMatter } from "./frontMatter";

describe("splitFrontMatter", () => {
  it("returns null when the file has no front matter at all", () => {
    expect(splitFrontMatter("# just markdown\n")).toBeNull();
    expect(splitFrontMatter("")).toBeNull();
  });

  it("returns null when the opening fence has trailing junk", () => {
    expect(splitFrontMatter("---toc\ntitle: x\n---\nbody")).toBeNull();
    expect(splitFrontMatter("--- \ntitle: x\n---\nbody")).toBeNull();
  });

  it("returns null when the opening fence is never closed", () => {
    expect(splitFrontMatter("---\ntitle: x\n")).toBeNull();
  });

  it("splits a normal file into fences, front matter, and body", () => {
    const raw = "---\ntitle: x\ndate: 2026-01-01\n---\n\nBody text\n";
    const split = splitFrontMatter(raw);
    expect(split).not.toBeNull();
    expect(split?.openFence).toBe("---\n");
    expect(split?.frontMatterText).toBe("title: x\ndate: 2026-01-01\n");
    expect(split?.closeFence).toBe("---\n");
    expect(split?.body).toBe("\nBody text\n");
  });

  it("supports empty front matter (zero fields)", () => {
    const raw = "---\n---\n\nBody\n";
    const split = splitFrontMatter(raw);
    expect(split?.frontMatterText).toBe("");
    expect(split?.body).toBe("\nBody\n");
  });

  it("supports a file with no body and no trailing newline at all", () => {
    const raw = "---\ntitle: x\n---";
    const split = splitFrontMatter(raw);
    expect(split?.closeFence).toBe("---");
    expect(split?.body).toBe("");
  });

  it("does not mistake an indented '---' inside a block scalar for the closing fence", () => {
    const raw = "---\ntitle: |\n  ---\n  still the title\ndate: 2026-01-01\n---\n\nBody\n";
    const split = splitFrontMatter(raw);
    expect(split?.frontMatterText).toBe("title: |\n  ---\n  still the title\ndate: 2026-01-01\n");
    expect(split?.body).toBe("\nBody\n");
  });

  it("every piece concatenates back into the original raw text, for every shape above", () => {
    const samples = [
      "---\ntitle: x\ndate: 2026-01-01\n---\n\nBody text\n",
      "---\n---\n\nBody\n",
      "---\ntitle: x\n---",
      "---\ntitle: |\n  ---\n  still the title\ndate: 2026-01-01\n---\n\nBody\n",
    ];
    for (const raw of samples) {
      const split = splitFrontMatter(raw);
      expect(split).not.toBeNull();
      if (split) {
        expect(joinFrontMatterSplit(split)).toBe(raw);
      }
    }
  });
});

describe("replaceBodyImpl", () => {
  it("swaps only the body, leaving the front matter block byte-identical", () => {
    const raw = "---\ntitle: x\ndate: 2026-01-01\n---\n\nOld body\n";
    const result = replaceBodyImpl(raw, "\nNew body\n");
    expect(result).toEqual({ ok: true, raw: "---\ntitle: x\ndate: 2026-01-01\n---\n\nNew body\n" });
  });

  it("round-trips: replaceBody(raw, parse(raw).body) === raw", () => {
    const raw = "---\ntitle: x\ndate: 2026-01-01\n---\n\nBody text\n";
    const split = splitFrontMatter(raw);
    expect(split).not.toBeNull();
    if (split) {
      expect(replaceBodyImpl(raw, split.body)).toEqual({ ok: true, raw });
    }
  });

  it("fails cleanly when there's no front matter to preserve", () => {
    const result = replaceBodyImpl("no front matter here", "new body");
    expect(result.ok).toBe(false);
  });
});
