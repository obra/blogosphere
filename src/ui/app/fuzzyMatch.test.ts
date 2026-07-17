// ABOUTME: Unit tests for fuzzyScore/rankByFuzzyMatch — subsequence (not
// ABOUTME: substring) matching, word-boundary/run preference, recency tie-break.
import { describe, expect, it } from "vitest";
import type { FuzzyCandidate } from "./fuzzyMatch";
import { fuzzyScore, rankByFuzzyMatch } from "./fuzzyMatch";

describe("fuzzyScore", () => {
  it("matches a subsequence whose letters are not contiguous in the target", () => {
    // "kn" is not a literal substring of "Kubernetes Notes" (there's a lot
    // of text between the K and the N) but it is a valid subsequence.
    expect(fuzzyScore("kn", "Kubernetes Notes")).not.toBeNull();
    expect("Kubernetes Notes".includes("kn")).toBe(false);
  });

  it("returns null when the query's letters aren't in order in the target", () => {
    expect(fuzzyScore("ba", "abc")).toBeNull();
  });

  it("returns null when a query letter doesn't occur at all", () => {
    expect(fuzzyScore("abz", "abc")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("QO", "quick open")).toBe(fuzzyScore("qo", "Quick Open"));
  });

  it("treats an empty query as a trivial match with a zero score", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("scores a consecutive run higher than the same letters scattered mid-word", () => {
    // Both 'o's land mid-word (not a word boundary), isolating the run bonus.
    const consecutive = fuzzyScore("op", "xopen");
    const scattered = fuzzyScore("op", "xoqqqp");
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive as number).toBeGreaterThan(scattered as number);
  });

  it("scores a word-boundary start higher than the same letters starting mid-word", () => {
    // Both targets continue with a consecutive run for the second letter,
    // isolating the word-boundary bonus on the first.
    const boundary = fuzzyScore("op", "Open Notes");
    const midWord = fuzzyScore("op", "stopwatch");
    expect(boundary).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(boundary as number).toBeGreaterThan(midWord as number);
  });

  it("scores the best alignment, not the first occurrence of the leading letter", () => {
    // "op" first occurs mid-word inside "Workshop", but the strictly better
    // match is the word-boundary run starting "Open" — a greedy first-match
    // anchor would score this string as if "Open" weren't there at all.
    expect(fuzzyScore("op", "Workshop Open House")).toBe(fuzzyScore("op", "Open Notes"));
  });

  it("a word-boundary run later in the string outscores an earlier mid-word run elsewhere", () => {
    const literalWord = fuzzyScore("op", "Workshop Open House");
    const coincidental = fuzzyScore("op", "A Cop Report");
    expect(literalWord).not.toBeNull();
    expect(coincidental).not.toBeNull();
    expect(literalWord as number).toBeGreaterThan(coincidental as number);
  });
});

interface Item {
  id: string;
}

function candidate(id: string, text: string, updatedAt: number): FuzzyCandidate<Item> {
  return { item: { id }, text, updatedAt };
}

describe("rankByFuzzyMatch", () => {
  it("with a blank query, returns everything ordered by recency (most recent first)", () => {
    const candidates = [
      candidate("old", "Zebra", 100),
      candidate("new", "Apple", 300),
      candidate("mid", "Mango", 200),
    ];
    expect(rankByFuzzyMatch("", candidates).map((i) => i.id)).toEqual(["new", "mid", "old"]);
  });

  it("a blank query ignores text entirely (no filtering, just recency)", () => {
    const candidates = [candidate("a", "", 2), candidate("b", "anything", 1)];
    expect(rankByFuzzyMatch("   ", candidates).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("drops candidates whose text doesn't fuzzy-match the query", () => {
    const candidates = [candidate("match", "Widget Roundup", 1), candidate("no-match", "Zzz", 1)];
    expect(rankByFuzzyMatch("widget", candidates).map((i) => i.id)).toEqual(["match"]);
  });

  // "widget"'s letters, padded apart with a filler that's never a query
  // letter and never a word-boundary separator — so every hit is a lone,
  // non-consecutive, non-boundary match: the weakest possible score shape.
  const scatteredWidget = "zzwzzizzdzzgzzezztzz";

  it("orders matches by score, best first", () => {
    const candidates = [candidate("weak", scatteredWidget, 1), candidate("strong", "Widget", 1)];
    expect(rankByFuzzyMatch("widget", candidates).map((i) => i.id)).toEqual(["strong", "weak"]);
  });

  it("breaks equal scores by recency, most recently updated first", () => {
    const candidates = [candidate("older", "Widget", 100), candidate("newer", "Widget", 200)];
    expect(rankByFuzzyMatch("widget", candidates).map((i) => i.id)).toEqual(["newer", "older"]);
  });

  it("a better score wins even over a more recently updated weaker match", () => {
    const candidates = [
      candidate("recent-weak", scatteredWidget, 999),
      candidate("older-strong", "Widget", 1),
    ];
    expect(rankByFuzzyMatch("widget", candidates).map((i) => i.id)).toEqual([
      "older-strong",
      "recent-weak",
    ]);
  });

  it("a title containing the queried word at a boundary outranks a coincidental mid-word hit", () => {
    // Regression: greedy first-occurrence anchoring scored "Workshop Open
    // House" off the 'o' in "Workshop", ranking it below "A Cop Report" and
    // pushing literal-word matches out of the palette's visible results.
    const candidates = [
      candidate("coincidental", "A Cop Report", 1),
      candidate("literal-word", "Workshop Open House", 1),
    ];
    expect(rankByFuzzyMatch("op", candidates).map((i) => i.id)).toEqual([
      "literal-word",
      "coincidental",
    ]);
  });
});
