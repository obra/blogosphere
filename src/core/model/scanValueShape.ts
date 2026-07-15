// ABOUTME: Bounds a single top-level key's value extent (plain/quoted scalar,
// ABOUTME: block scalar, block sequence, inline flow array) — the shape
// ABOUTME: classifier scanKeys.ts's line-by-line walk delegates to per key.

import { stripEol } from "./textLines";

const BLOCK_SCALAR_INDICATOR_RE = /^[|>][+-]?[0-9]?$|^[|>][0-9]?[+-]?$/;
const QUOTE_START_INDEX = 1;

/** Lines strictly more indented than a top-level key, or blank, extend its block. */
function consumeIndentedContinuation(lines: string[], keyLineIndex: number): number {
  let j = keyLineIndex + 1;
  while (j < lines.length) {
    const chunk = lines[j];
    if (chunk === undefined) {
      break;
    }
    const content = stripEol(chunk);
    const isBlank = content.trim() === "";
    if (!isBlank && (content.includes("\t") || !content.startsWith(" "))) {
      break;
    }
    j += 1;
  }
  let end = j - 1;
  while (end > keyLineIndex && stripEol(lines[end] ?? "").trim() === "") {
    end -= 1;
  }
  return end;
}

function hasIndentedContinuation(lines: string[], keyLineIndex: number): boolean {
  const next = lines[keyLineIndex + 1];
  if (next === undefined) {
    return false;
  }
  const nextContent = stripEol(next);
  return nextContent.trim() !== "" && nextContent.startsWith(" ");
}

/** Every non-blank continuation line must be a sequence item ("- ..." or bare
 * "-") — anything else (a nested mapping, say) we don't understand. */
function allContinuationLinesAreSequenceItems(lines: string[], keyLineIndex: number): boolean {
  let j = keyLineIndex + 1;
  while (j < lines.length) {
    const chunk = lines[j];
    if (chunk === undefined) {
      break;
    }
    const content = stripEol(chunk);
    const isBlank = content.trim() === "";
    if (!isBlank) {
      if (content.includes("\t") || !content.startsWith(" ")) {
        break;
      }
      const trimmedLine = content.trim();
      if (trimmedLine !== "-" && !trimmedLine.startsWith("- ")) {
        return false;
      }
    }
    j += 1;
  }
  return true;
}

/** `key:` with nothing after: either a block sequence or a bare null/empty scalar. */
function boundEmptyOrBlockCollection(
  lines: string[],
  keyLineIndex: number,
): { endLine: number } | null {
  if (!hasIndentedContinuation(lines, keyLineIndex)) {
    // No indented continuation at all: an empty/null scalar, single line.
    return { endLine: keyLineIndex };
  }
  if (!allContinuationLinesAreSequenceItems(lines, keyLineIndex)) {
    return null;
  }
  return { endLine: consumeIndentedContinuation(lines, keyLineIndex) };
}

function boundBlockScalar(
  lines: string[],
  keyLineIndex: number,
  trimmed: string,
): { endLine: number } | null {
  if (!BLOCK_SCALAR_INDICATOR_RE.test(trimmed)) {
    return null;
  }
  const next = lines[keyLineIndex + 1];
  if (next === undefined) {
    return null;
  }
  const nextContent = stripEol(next);
  if (nextContent.trim() === "" || !nextContent.startsWith(" ")) {
    return null; // empty block scalar: unsupported
  }
  return { endLine: consumeIndentedContinuation(lines, keyLineIndex) };
}

/** Step past one character while inside a quoted element of a flow array.
 * Returns the new index and the quote to keep tracking (null once closed). */
function stepInsideArrayQuote(
  trimmed: string,
  idx: number,
  quote: '"' | "'",
): { idx: number; quote: '"' | "'" | null } {
  const ch = trimmed[idx];
  if (quote === '"' && ch === "\\") {
    return { idx: idx + 2, quote };
  }
  if (ch === quote) {
    return { idx: idx + 1, quote: null };
  }
  return { idx: idx + 1, quote };
}

/** Step past one character while outside any quote in a flow array, tracking
 * bracket depth. Returns the new index, depth, any quote just opened, and
 * whether this step just closed the outermost "[". */
function stepOutsideArrayQuote(
  trimmed: string,
  idx: number,
  depth: number,
): { idx: number; depth: number; quote: '"' | "'" | null; closedOuter: boolean } {
  const ch = trimmed[idx];
  if (ch === "'" || ch === '"') {
    return { idx: idx + 1, depth, quote: ch, closedOuter: false };
  }
  if (ch === "[") {
    return { idx: idx + 1, depth: depth + 1, quote: null, closedOuter: false };
  }
  if (ch === "]") {
    const newDepth = depth - 1;
    return { idx: idx + 1, depth: newDepth, quote: null, closedOuter: newDepth === 0 };
  }
  return { idx: idx + 1, depth, quote: null, closedOuter: false };
}

/**
 * Is a "[...]" flow sequence closed on this one line? Tracks bracket depth
 * and quote state (rather than just counting brackets) so a tag value like
 * "]" or "'" inside a quoted element can't be mistaken for real syntax.
 * Doesn't distinguish "still inside the same quoted scalar" from "just
 * closed and reopened by a doubled '' escape" — both read as "ignore
 * brackets here", which is the only thing depth-tracking needs from it.
 */
function boundInlineFlowArray(keyLineIndex: number, trimmed: string): { endLine: number } | null {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let idx = 0;
  while (idx < trimmed.length) {
    if (quote === null) {
      const step = stepOutsideArrayQuote(trimmed, idx, depth);
      if (step.closedOuter) {
        const trailing = trimmed.slice(step.idx).trim();
        return trailing === "" ? { endLine: keyLineIndex } : null;
      }
      ({ idx, depth, quote } = step);
    } else {
      const step = stepInsideArrayQuote(trimmed, idx, quote);
      ({ idx, quote } = step);
    }
  }
  return null; // never closed on this line
}

/** Is a quoted scalar closed on this one line? */
function boundQuoted(
  keyLineIndex: number,
  trimmed: string,
  quote: '"' | "'",
): { endLine: number } | null {
  let idx = QUOTE_START_INDEX;
  while (idx < trimmed.length) {
    const ch = trimmed[idx];
    if (quote === '"' && ch === "\\") {
      idx += 2;
    } else if (ch === quote && quote === "'" && trimmed[idx + 1] === "'") {
      idx += 2; // doubled '' inside a single-quoted scalar is an escaped quote
    } else if (ch === quote) {
      const trailing = trimmed.slice(idx + 1).trim();
      return trailing === "" ? { endLine: keyLineIndex } : null;
    } else {
      idx += 1;
    }
  }
  return null; // never closed on this line
}

function boundPlainScalar(lines: string[], keyLineIndex: number): { endLine: number } | null {
  const next = lines[keyLineIndex + 1];
  if (next !== undefined) {
    const nextContent = stripEol(next);
    if (nextContent.trim() !== "" && nextContent.startsWith(" ")) {
      // Looks like YAML plain-scalar line folding, which we don't support —
      // bounding this as one line would silently orphan the continuation.
      return null;
    }
  }
  return { endLine: keyLineIndex };
}

export function boundValueShape(
  lines: string[],
  keyLineIndex: number,
  restAfterColon: string,
): { endLine: number } | null {
  const trimmed = restAfterColon.trim();
  if (trimmed === "") {
    return boundEmptyOrBlockCollection(lines, keyLineIndex);
  }
  const [first] = trimmed;
  if (first === "|" || first === ">") {
    return boundBlockScalar(lines, keyLineIndex, trimmed);
  }
  if (first === "[") {
    return boundInlineFlowArray(keyLineIndex, trimmed);
  }
  if (first === "{" || first === "&" || first === "*") {
    return null; // flow mapping / anchor / alias
  }
  if (first === '"') {
    return boundQuoted(keyLineIndex, trimmed, '"');
  }
  if (first === "'") {
    return boundQuoted(keyLineIndex, trimmed, "'");
  }
  return boundPlainScalar(lines, keyLineIndex);
}
