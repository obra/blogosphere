// ABOUTME: Fence detection — locates the "---" front matter block by exact line
// ABOUTME: match, never by YAML parsing, so it works even when the YAML is broken.

import { splitLinesKeepEnds, stripEol } from "./textLines";
import type { EditResult } from "./types";

const OPEN_FENCE = "---\n";

/**
 * A raw file split into its three literal pieces. `openFence` is always
 * "---\n" (that's the precondition for this to be non-null at all).
 * `closeFence` is the exact bytes of the closing "---" line, including its
 * own terminator if it has one — it won't if the file ends exactly at the
 * fence with no trailing newline. Concatenating the four pieces in order
 * always reproduces the original raw text exactly.
 */
export interface FrontMatterSplit {
  openFence: string;
  frontMatterText: string;
  closeFence: string;
  body: string;
}

/**
 * Front matter = file starting with the literal "---\n" up to the next line
 * that is exactly "---". Returns null when there's no such intact fence pair
 * (no front matter at all, or an opening fence with nothing to close it).
 */
export function splitFrontMatter(raw: string): FrontMatterSplit | null {
  if (!raw.startsWith(OPEN_FENCE)) {
    return null;
  }
  const rest = raw.slice(OPEN_FENCE.length);
  const restLines = splitLinesKeepEnds(rest);
  for (const [i, chunk] of restLines.entries()) {
    if (stripEol(chunk) === "---") {
      return {
        openFence: OPEN_FENCE,
        frontMatterText: restLines.slice(0, i).join(""),
        closeFence: chunk,
        body: restLines.slice(i + 1).join(""),
      };
    }
  }
  return null;
}

/** Reassemble the four pieces of a FrontMatterSplit back into raw text. */
export function joinFrontMatterSplit(split: FrontMatterSplit): string {
  return split.openFence + split.frontMatterText + split.closeFence + split.body;
}

/**
 * Replace the body, leaving the front matter block (fences included)
 * byte-identical. `replaceBody(raw, parse(raw).body) === raw` always holds
 * because both the read and the write go through the same split.
 */
export function replaceBodyImpl(raw: string, body: string): EditResult {
  const split = splitFrontMatter(raw);
  if (!split) {
    return { ok: false, error: "no intact front matter fences to preserve" };
  }
  return { ok: true, raw: joinFrontMatterSplit({ ...split, body }) };
}
