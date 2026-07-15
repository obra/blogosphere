// ABOUTME: The surgical front-matter editor — turns FieldEdit[] into minimal line
// ABOUTME: splices, refusing (never guessing) whenever a key can't be bounded confidently.

import { joinFrontMatterSplit, splitFrontMatter } from "./frontMatter";
import { type KeyBlock, scanTopLevelKeys } from "./scanKeys";
import { splitLinesKeepEnds } from "./textLines";
import type { EditResult, FieldEdit } from "./types";
import { renderFieldLine } from "./yamlScalar";

type Op =
  | { kind: "replace"; start: number; end: number; line: string }
  | { kind: "delete"; start: number; end: number }
  | { kind: "append"; line: string }
  | { kind: "noop" };

/** Last edit for a given field wins, order otherwise preserved. */
function dedupeByField(edits: FieldEdit[]): FieldEdit[] {
  const byField = new Map<string, FieldEdit>();
  for (const edit of edits) {
    byField.set(edit.field, edit);
  }
  return [...byField.values()];
}

function resolveOp(
  edit: FieldEdit,
  block: KeyBlock | undefined,
  unscannableFrom: number | null,
): Op | { error: string } {
  const rendered = renderFieldLine(edit);
  const isRemoval = rendered === null;

  if (block) {
    if (isRemoval) {
      return { kind: "delete", start: block.start, end: block.end };
    }
    return { kind: "replace", start: block.start, end: block.end, line: rendered };
  }

  if (isRemoval) {
    if (unscannableFrom === null) {
      return { kind: "noop" };
    }
    return {
      error: `cannot confirm field "${edit.field}" is absent: front matter has an unrecognized region starting at line ${unscannableFrom + 1}`,
    };
  }

  if (unscannableFrom !== null) {
    return {
      error: `cannot safely add field "${edit.field}": front matter has an unrecognized region starting at line ${unscannableFrom + 1}`,
    };
  }
  return { kind: "append", line: rendered };
}

function applyOps(lines: string[], ops: Op[]): string[] {
  const mutable = [...lines];
  const positional = ops.filter(
    (op): op is Extract<Op, { kind: "replace" | "delete" }> =>
      op.kind === "replace" || op.kind === "delete",
  );
  // Descending by start so earlier splices never shift the indices of ones still to come.
  positional.sort((a, b) => b.start - a.start);
  for (const op of positional) {
    const count = op.end - op.start + 1;
    if (op.kind === "delete") {
      mutable.splice(op.start, count);
    } else {
      mutable.splice(op.start, count, op.line);
    }
  }
  for (const op of ops) {
    if (op.kind === "append") {
      mutable.push(op.line);
    }
  }
  return mutable;
}

export function applyEditsImpl(raw: string, edits: FieldEdit[]): EditResult {
  if (edits.length === 0) {
    return { ok: true, raw };
  }

  const split = splitFrontMatter(raw);
  if (!split) {
    return { ok: false, error: "no intact front matter fences to edit" };
  }

  const lines = splitLinesKeepEnds(split.frontMatterText);
  const scan = scanTopLevelKeys(lines);
  const finalEdits = dedupeByField(edits);

  const ops: Op[] = [];
  for (const edit of finalEdits) {
    const resolved = resolveOp(edit, scan.blocks.get(edit.field), scan.unscannableFrom);
    if ("error" in resolved) {
      return { ok: false, error: resolved.error };
    }
    ops.push(resolved);
  }

  const newLines = applyOps(lines, ops);
  const newFrontMatterText = newLines.join("");
  const newRaw = joinFrontMatterSplit({ ...split, frontMatterText: newFrontMatterText });
  return { ok: true, raw: newRaw };
}
