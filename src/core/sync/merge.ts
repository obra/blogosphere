// ABOUTME: Line-based three-way text merge (diff3) built on node-diff3, plus a
// ABOUTME: stable line split/join pair that preserves trailing-newline presence.
import { diff3Merge } from "node-diff3";
import type { Merge3 } from "./types";

/**
 * Splits text into lines for diff3. Deliberately NOT node-diff3's default
 * whitespace-splitting behavior (that would butcher markdown/YAML) — this is
 * a plain `\n` split, which for any string `s` satisfies
 * `joinLines(splitLines(s)) === s`, trailing newline and all: a trailing
 * newline produces a trailing empty element, and `Array.join` reintroduces
 * exactly that newline back on the way out.
 */
export function splitLines(text: string): string[] {
  return text.split("\n");
}

/** Inverse of {@link splitLines}. See its doc comment for the round-trip guarantee. */
export function joinLines(lines: readonly string[]): string {
  return lines.join("\n");
}

/**
 * Three-way merge of `mine`/`theirs` against their common `base`, line by
 * line. Non-overlapping hunks merge automatically; any region both sides
 * touched differently is reported as `{ ok: false, reason: "overlap" }`
 * rather than guessed at.
 */
export const merge3: Merge3 = (base, mine, theirs) => {
  const regions = diff3Merge(splitLines(mine), splitLines(base), splitLines(theirs));

  const merged: string[] = [];
  for (const region of regions) {
    if (region.conflict) {
      return { ok: false, reason: "overlap" };
    }
    merged.push(...(region.ok ?? []));
  }
  return { ok: true, merged: joinLines(merged) };
};
