// ABOUTME: parseEntry — locates the front matter fences (fails if absent), then
// ABOUTME: reads fields via js-yaml, degrading to null fields on malformed YAML.

import { JSON_SCHEMA, load } from "js-yaml";
import { splitFrontMatter } from "./frontMatter";
import { arrayField, boolField, isPlainObject, stringField, unknownKeysOf } from "./knownFields";
import { kindForPath } from "./paths";
import type { ParsedEntry, ParseResult } from "./types";

export function parseEntry(path: string, raw: string): ParseResult {
  const kind = kindForPath(path);
  if (kind === null) {
    return { ok: false, error: `path is not under a managed content root: ${path}` };
  }

  const split = splitFrontMatter(raw);
  if (!split) {
    return { ok: false, error: `no intact "---" front matter fences found in ${path}` };
  }

  let doc: unknown;
  let parseError = false;
  try {
    doc = load(split.frontMatterText, { schema: JSON_SCHEMA });
  } catch {
    parseError = true;
  }

  // Malformed YAML inside intact fences still yields ok:true, just with
  // every field defaulted — validateForCommit is where that gets flagged.
  const fields = !parseError && isPlainObject(doc) ? doc : {};
  const unknownKeys = !parseError && isPlainObject(doc) ? unknownKeysOf(doc) : [];

  const entry: ParsedEntry = {
    path,
    kind,
    raw,
    frontMatterText: split.frontMatterText,
    body: split.body,
    title: stringField(fields, "title"),
    date: stringField(fields, "date"),
    tags: arrayField(fields, "tags"),
    draft: boolField(fields, "draft"),
    opaqueId: stringField(fields, "opaqueId"),
    url: stringField(fields, "url"),
    type: stringField(fields, "type"),
    unknownKeys,
  };
  return { ok: true, entry };
}
