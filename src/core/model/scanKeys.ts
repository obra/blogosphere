// ABOUTME: Scans front-matter lines top-down to find each top-level key's exact
// ABOUTME: line range, without relying on js-yaml — this is what makes edits surgical.

import { boundValueShape } from "./scanValueShape";
import { stripEol } from "./textLines";

const TOP_LEVEL_KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/;

interface KeyBlock {
  /** Inclusive line index range into the `lines` array passed to the scan. */
  start: number;
  end: number;
}

type LineOutcome =
  | { kind: "end" }
  | { kind: "unscannable" }
  | { kind: "duplicate" }
  | { kind: "blank" }
  | { kind: "bounded"; key: string; block: KeyBlock };

/** Classify line `i` on its own: end of input, a tab/shape the surgical
 *  editor can't trust, a genuine duplicate of an already-bounded key, a bare
 *  blank line (belongs to no key's block), or a confidently-bounded key. */
function classifyLine(
  lines: string[],
  i: number,
  blocks: ReadonlyMap<string, KeyBlock>,
): LineOutcome {
  const chunk = lines[i];
  if (chunk === undefined) {
    return { kind: "end" };
  }
  const content = stripEol(chunk);
  if (content.includes("\t")) {
    return { kind: "unscannable" };
  }
  // A bare blank line between (or after) top-level keys belongs to no key's
  // block — ordinary formatting, not a value to bound. Treating it as its
  // own outcome (rather than falling through to the "no match" case below)
  // keeps every well-formed key found on both sides of it, including the
  // common shape of a human/vim-authored blank line for readability.
  if (content.trim() === "") {
    return { kind: "blank" };
  }
  const match = TOP_LEVEL_KEY_RE.exec(content);
  if (!match) {
    return { kind: "unscannable" };
  }
  const [, key, rest] = match;
  if (key === undefined || rest === undefined) {
    return { kind: "unscannable" };
  }
  if (blocks.has(key)) {
    return { kind: "duplicate" };
  }
  const bound = boundValueShape(lines, i, rest);
  if (bound === null) {
    return { kind: "unscannable" };
  }
  return { kind: "bounded", key, block: { start: i, end: bound.endLine } };
}

export interface ScanResult {
  /** Confidently-bounded top-level keys found before any unscannable region. */
  blocks: Map<string, KeyBlock>;
  /** First line index the scanner couldn't classify, or null if fully scanned. */
  unscannableFrom: number | null;
}

/**
 * Walk `lines` (as produced by splitLinesKeepEnds on frontMatterText) and
 * classify each top-level "key: value" line, including any indented
 * continuation lines its value spans (block scalars, block sequences).
 * Stops at the first line it can't confidently classify — everything from
 * there on is `unscannableFrom`, and simply isn't in `blocks`, so callers
 * that need one of those keys must refuse rather than guess.
 */
export function scanTopLevelKeys(lines: string[]): ScanResult {
  const blocks = new Map<string, KeyBlock>();
  let i = 0;
  while (i < lines.length) {
    const outcome = classifyLine(lines, i, blocks);
    if (outcome.kind === "end") {
      break;
    }
    if (outcome.kind === "unscannable") {
      return { blocks, unscannableFrom: i };
    }
    if (outcome.kind === "duplicate") {
      // A genuine duplicate top-level key makes the *whole* mapping
      // ambiguous per YAML (js-yaml throws on it) — not just this one key.
      // Discard every block already found so every edit, whether or not it
      // targets the duplicated key, refuses via the unscannable-region path
      // in applyEdits.ts instead of reporting a false success that leaves
      // the duplicate (and the ambiguity) untouched.
      return { blocks: new Map(), unscannableFrom: i };
    }
    if (outcome.kind === "blank") {
      i += 1;
    } else {
      blocks.set(outcome.key, outcome.block);
      i = outcome.block.end + 1;
    }
  }
  return { blocks, unscannableFrom: null };
}

export type { KeyBlock };
