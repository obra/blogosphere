// ABOUTME: Renders new field values as YAML text — plain when safe, double-quoted
// ABOUTME: with escaping otherwise — using js-yaml itself as the plain-safety oracle.

import { JSON_SCHEMA, load } from "js-yaml";
import type { FieldEdit } from "./types";

const CONTROL_CHAR_LIMIT = 0x20;
const HEX_ESCAPE_PAD_LENGTH = 2;
const HEX_RADIX = 16;
const LEADING_OR_TRAILING_WHITESPACE_RE = /^\s|\s$/;

function exhaustiveFieldCheck(edit: never): never {
  throw new Error(`unhandled field edit: ${JSON.stringify(edit)}`);
}

/**
 * A string is safe to write as an unquoted YAML plain scalar only if parsing
 * it back (alone, as its own document, under the same JSON_SCHEMA we read
 * with) yields the exact same string. That single round-trip check rejects
 * every dangerous case at once: leading indicator characters (`-`, `?`, `:`,
 * `[`, `{`, `#`, `&`, `*`, `!`, `|`, `>`, quotes, `%`, `@`), embedded ": " or
 * trailing " #" that would be read as a mapping/comment, leading/trailing
 * whitespace, empty strings, and values that look like a different type
 * (numbers, booleans, null) and would silently change type on reload.
 */
export function isPlainSafeScalar(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  if (value.includes("\n")) {
    return false;
  }
  if (LEADING_OR_TRAILING_WHITESPACE_RE.test(value)) {
    return false;
  }
  try {
    return load(value, { schema: JSON_SCHEMA }) === value;
  } catch {
    return false;
  }
}

/** Escape a string for a YAML double-quoted scalar (always single-line). */
export function toDoubleQuoted(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\") {
      out += "\\\\";
    } else if (ch === '"') {
      out += '\\"';
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else if (code < CONTROL_CHAR_LIMIT) {
      out += `\\x${code.toString(HEX_RADIX).padStart(HEX_ESCAPE_PAD_LENGTH, "0")}`;
    } else {
      out += ch;
    }
  }
  return `"${out}"`;
}

/** Plain if it's safe, otherwise double-quoted with escaping. */
export function renderScalar(value: string): string {
  return isPlainSafeScalar(value) ? value : toDoubleQuoted(value);
}

/**
 * Render a FieldEdit as the new "key: value" line text (including its own
 * trailing newline). Returns null when the edit is a removal (a `null` value
 * on one of the nullable fields) — the caller deletes the key's lines instead.
 */
export function renderFieldLine(edit: FieldEdit): string | null {
  switch (edit.field) {
    case "title":
      return `title: ${renderScalar(edit.value)}\n`;
    case "date":
      return `date: ${renderScalar(edit.value)}\n`;
    case "url":
      return `url: ${renderScalar(edit.value)}\n`;
    case "type":
      return `type: ${renderScalar(edit.value)}\n`;
    case "opaqueId":
      if (edit.value === null) {
        return null;
      }
      return `opaqueId: ${renderScalar(edit.value)}\n`;
    case "draft":
      if (edit.value === null) {
        return null;
      }
      return `draft: ${edit.value ? "true" : "false"}\n`;
    case "tags": {
      if (edit.value === null) {
        return null;
      }
      const inner = edit.value.map((tag) => toDoubleQuoted(tag)).join(", ");
      return `tags: [${inner}]\n`;
    }
    default:
      return exhaustiveFieldCheck(edit);
  }
}
