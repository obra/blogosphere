// ABOUTME: Unit + property tests for merge3's diff3 semantics and the
// ABOUTME: splitLines/joinLines trailing-newline round trip.
import process from "node:process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { joinLines, merge3, splitLines } from "./merge";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;

const arbLineToken = fc.constantFrom(
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
);

/** `fc.array(arbLineToken, ...)` infers a literal-union element type; widen to
 *  plain `string[]` so callers can splice in arbitrary marker text. */
function arbLines(constraints: fc.ArrayConstraints): fc.Arbitrary<string[]> {
  return fc.array(arbLineToken, constraints).map((lines): string[] => [...lines]);
}

describe("splitLines / joinLines", () => {
  it("round-trips text without a trailing newline", () => {
    const text = "a\nb\nc";
    expect(joinLines(splitLines(text))).toBe(text);
  });

  it("round-trips text with a trailing newline", () => {
    const text = "a\nb\nc\n";
    expect(joinLines(splitLines(text))).toBe(text);
  });

  it("round-trips the empty string", () => {
    expect(joinLines(splitLines(""))).toBe("");
  });

  it("round-trips a lone newline", () => {
    expect(joinLines(splitLines("\n"))).toBe("\n");
  });

  it("property: joinLines(splitLines(x)) === x for arbitrary text", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(joinLines(splitLines(text))).toBe(text);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("merge3: unit examples", () => {
  it("returns the shared content unchanged when nothing differs", () => {
    const text = "a\nb\nc";
    const result = merge3(text, text, text);
    expect(result).toEqual({ ok: true, merged: text });
  });

  it("fast-forwards to mine when theirs matches base", () => {
    const base = "a\nb\nc\n";
    const mine = "a\nMINE\nc\n";
    const result = merge3(base, mine, base);
    expect(result).toEqual({ ok: true, merged: mine });
  });

  it("fast-forwards to theirs when mine matches base", () => {
    const base = "a\nb\nc\n";
    const theirs = "a\nTHEIRS\nc\n";
    const result = merge3(base, base, theirs);
    expect(result).toEqual({ ok: true, merged: theirs });
  });

  it("auto-merges non-overlapping edits from both sides", () => {
    const base = "title: Foo\ndate: 2026-01-01\n---\nbody line one\nbody line two\n";
    const mine = "title: Bar\ndate: 2026-01-01\n---\nbody line one\nbody line two\n";
    const theirs = "title: Foo\ndate: 2026-01-01\n---\nbody line one\nCHANGED\n";
    const result = merge3(base, mine, theirs);
    expect(result).toEqual({
      ok: true,
      merged: "title: Bar\ndate: 2026-01-01\n---\nbody line one\nCHANGED\n",
    });
  });

  it("reports overlap when both sides edit the same line differently", () => {
    const base = "a\nb\nc";
    const mine = "a\nMINE\nc";
    const theirs = "a\nTHEIRS\nc";
    expect(merge3(base, mine, theirs)).toEqual({ ok: false, reason: "overlap" });
  });

  it("does not conflict when both sides make the identical change", () => {
    const base = "a\nb\nc";
    const same = "a\nSAME\nc";
    expect(merge3(base, same, same)).toEqual({ ok: true, merged: same });
  });
});

describe("merge3: property - identity laws", () => {
  it("property: merge3(base, mine, base) fast-forwards to mine", () => {
    fc.assert(
      fc.property(
        arbLines({ minLength: 1, maxLength: 12 }),
        arbLines({ minLength: 0, maxLength: 12 }),
        (baseLines, mineLines) => {
          const base = joinLines(baseLines);
          const mine = joinLines(mineLines);
          expect(merge3(base, mine, base)).toEqual({ ok: true, merged: mine });
        },
      ),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("property: merge3(base, base, theirs) fast-forwards to theirs", () => {
    fc.assert(
      fc.property(
        arbLines({ minLength: 1, maxLength: 12 }),
        arbLines({ minLength: 0, maxLength: 12 }),
        (baseLines, theirsLines) => {
          const base = joinLines(baseLines);
          const theirs = joinLines(theirsLines);
          expect(merge3(base, base, theirs)).toEqual({ ok: true, merged: theirs });
        },
      ),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("merge3: property - conflict detection", () => {
  it("property: two different single-line edits at the same spot always overlap", () => {
    const arbCase = arbLines({ minLength: 1, maxLength: 12 }).chain((base) =>
      fc.record({ base: fc.constant(base), index: fc.integer({ min: 0, max: base.length - 1 }) }),
    );

    fc.assert(
      fc.property(arbCase, ({ base, index }) => {
        const mine = [...base];
        const theirs = [...base];
        mine[index] = "MINE_MARKER";
        theirs[index] = "THEIRS_MARKER";
        const result = merge3(joinLines(base), joinLines(mine), joinLines(theirs));
        expect(result).toEqual({ ok: false, reason: "overlap" });
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("merge3: property - non-overlapping automerge", () => {
  const regionDivisions = 3;
  const minBaseLines = 9;
  const maxBaseLines = 24;

  // Position-tagged (not drawn from the small shared vocabulary): with a
  // 12-word vocabulary, fc.array often produces long runs of a repeated
  // token, and LCS-based diffing can then legitimately misattribute which
  // occurrence moved where — a real ambiguity in the *input*, not a merge3
  // bug. Unique lines give the diff unambiguous anchors, isolating this
  // property to what it's actually testing: disjoint-region auto-merge.
  const arbCase = fc.integer({ min: minBaseLines, max: maxBaseLines }).chain((n) => {
    const base = Array.from({ length: n }, (_, i) => `line-${i}`);
    const regionSize = Math.floor(n / regionDivisions);
    const mineMax = regionSize - 1;
    const theirsMin = n - regionSize;
    return fc.record({
      base: fc.constant(base),
      mineIndex: fc.integer({ min: 0, max: mineMax }),
      theirsIndex: fc.integer({ min: theirsMin, max: n - 1 }),
    });
  });

  it("property: edits in disjoint, buffered regions always auto-merge", () => {
    fc.assert(
      fc.property(arbCase, ({ base, mineIndex, theirsIndex }) => {
        const mine = [...base];
        const theirs = [...base];
        mine[mineIndex] = "MINE_MARKER";
        theirs[theirsIndex] = "THEIRS_MARKER";

        const result = merge3(joinLines(base), joinLines(mine), joinLines(theirs));
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }

        const expected = [...base];
        expected[mineIndex] = "MINE_MARKER";
        expected[theirsIndex] = "THEIRS_MARKER";
        expect(splitLines(result.merged)).toEqual(expected);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
