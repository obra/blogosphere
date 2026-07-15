// ABOUTME: Tests for section routing, counts, and year/month grouping.
import process from "node:process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { countsBySection, groupByYearMonth, sectionForEntry, sectionForKind } from "./grouping";
import { makeEntry } from "./testing/builders";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;

interface ArbitraryEntryShape {
  path: string;
  year: number;
  month: number;
  day: number;
  hasDate: boolean;
  updatedAt: number;
}

function toEntry(shape: ArbitraryEntryShape) {
  const month = `${shape.month}`.padStart(2, "0");
  const day = `${shape.day}`.padStart(2, "0");
  return makeEntry({
    path: shape.path,
    kind: "draft",
    date: shape.hasDate ? `${shape.year}-${month}-${day}` : null,
    updatedAt: shape.updatedAt,
  });
}

function arbitraryEntry(): fc.Arbitrary<ReturnType<typeof toEntry>> {
  return fc
    .record({
      path: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `${s}.md`),
      year: fc.integer({ min: 1990, max: 2099 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
      hasDate: fc.boolean(),
      updatedAt: fc.integer({ min: 0, max: 2_000_000_000_000 }),
    })
    .map((shape) => toEntry(shape));
}

describe("sectionForEntry", () => {
  it("routes a kind:draft entry to drafts", () => {
    const entry = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
    expect(sectionForEntry(entry)).toBe("drafts");
  });

  it("routes a draft:true kind:post entry to drafts, not posts", () => {
    const entry = makeEntry({
      path: "content/blog/2026/2026-01-01-a.md",
      kind: "post",
      draft: true,
    });
    expect(sectionForEntry(entry)).toBe("drafts");
  });

  it("routes a plain kind:post entry to posts", () => {
    const entry = makeEntry({ path: "content/blog/2026/2026-01-01-a.md", kind: "post" });
    expect(sectionForEntry(entry)).toBe("posts");
  });

  it("routes kind:link to links and kind:release to releases", () => {
    expect(sectionForKind("link")).toBe("links");
    expect(sectionForKind("release")).toBe("releases");
  });
});

describe("countsBySection", () => {
  it("counts only non-deleted entries, split by section", () => {
    const entries = [
      makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" }),
      makeEntry({ path: "content/drafts/2026-01-02-b.md", kind: "draft" }),
      makeEntry({ path: "content/blog/2026/2026-01-01-c.md", kind: "post" }),
      makeEntry({ path: "content/blog/2026/2026-01-02-d.md", kind: "post", deleted: true }),
    ];
    expect(countsBySection(entries)).toEqual({ drafts: 2, posts: 1, links: 0, releases: 0 });
  });
});

describe("groupByYearMonth", () => {
  it("groups newest year first, then newest month first, then newest entry first", () => {
    const entries = [
      makeEntry({ path: "a.md", kind: "post", date: "2025-03-01", title: "old year" }),
      makeEntry({ path: "b.md", kind: "post", date: "2026-01-10", title: "jan late" }),
      makeEntry({ path: "c.md", kind: "post", date: "2026-01-05", title: "jan early" }),
      makeEntry({ path: "d.md", kind: "post", date: "2026-07-01", title: "july" }),
    ];

    const groups = groupByYearMonth(entries);

    expect(groups.map((g) => g.key)).toEqual(["2026", "2025"]);

    // Destructured + explicitly guarded (rather than groups[0]?.months...)
    // so tsc's noUncheckedIndexedAccess is satisfied by real narrowing, not
    // just `?.` — which Biome's checker (it doesn't model that tsconfig
    // option) would otherwise flag as unnecessary on an array index.
    const [firstYear] = groups;
    if (!firstYear) {
      throw new Error("expected at least one year group");
    }
    expect(firstYear.months.map((m) => m.key)).toEqual(["07", "01"]);

    const [, secondMonth] = firstYear.months;
    if (!secondMonth) {
      throw new Error("expected at least two month groups in the newest year");
    }
    expect(secondMonth.entries.map((e) => e.title)).toEqual(["jan late", "jan early"]);
  });

  it("puts undated entries in an Undated bucket sorted after real dates", () => {
    const entries = [
      makeEntry({ path: "a.md", kind: "draft", date: "2026-01-01" }),
      makeEntry({ path: "b.md", kind: "draft", date: null, updatedAt: 100 }),
    ];

    const groups = groupByYearMonth(entries);

    expect(groups.map((g) => g.key)).toEqual(["2026", "Undated"]);
  });

  it("property: every input entry appears in exactly one group, none are dropped or duplicated", () => {
    fc.assert(
      fc.property(fc.array(arbitraryEntry(), { maxLength: 40 }), (entries) => {
        const groups = groupByYearMonth(entries);
        const regrouped = groups.flatMap((year) => year.months.flatMap((month) => month.entries));
        expect(regrouped).toHaveLength(entries.length);
        expect(new Set(regrouped)).toEqual(new Set(entries));
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
