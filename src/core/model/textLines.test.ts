// ABOUTME: Unit tests for the line-splitting primitives — the byte-exactness
// ABOUTME: invariant of the whole module rests on these being lossless.

import { describe, expect, it } from "vitest";
import { splitLinesKeepEnds, stripEol } from "./textLines";

describe("splitLinesKeepEnds", () => {
  it("returns an empty array for an empty string", () => {
    expect(splitLinesKeepEnds("")).toEqual([]);
  });

  it("keeps the trailing newline attached to each chunk", () => {
    expect(splitLinesKeepEnds("a\nb\nc\n")).toEqual(["a\n", "b\n", "c\n"]);
  });

  it("keeps a final partial line without a newline", () => {
    expect(splitLinesKeepEnds("a\nb")).toEqual(["a\n", "b"]);
  });

  it("handles a lone newline as one empty-content chunk", () => {
    expect(splitLinesKeepEnds("\n")).toEqual(["\n"]);
  });

  it("handles consecutive newlines as separate blank chunks", () => {
    expect(splitLinesKeepEnds("a\n\n\nb")).toEqual(["a\n", "\n", "\n", "b"]);
  });

  it("rejoining always reproduces the original text exactly", () => {
    const samples = ["", "a", "a\n", "a\nb\nc", "a\nb\nc\n", "\n\n\n", "no newlines at all"];
    for (const text of samples) {
      expect(splitLinesKeepEnds(text).join("")).toBe(text);
    }
  });
});

describe("stripEol", () => {
  it("strips exactly one trailing newline", () => {
    expect(stripEol("a\n")).toBe("a");
  });

  it("leaves a chunk with no trailing newline untouched", () => {
    expect(stripEol("a")).toBe("a");
  });

  it("only strips one newline, not a run of them", () => {
    expect(stripEol("a\n\n")).toBe("a\n");
  });
});
