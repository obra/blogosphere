// ABOUTME: Scaffolds a brand-new entry file. Post/draft output matches the
// ABOUTME: repo's create-post script byte-for-byte in shape (fences + trailing blank line).

import { pathFor, slugify } from "./paths";
import type { EntryKind, NewEntryInput } from "./types";
import { renderScalar } from "./yamlScalar";

/**
 * Front matter lines per kind, matching observed corpus convention:
 * - post/draft: `type: post`, title, date (create-post's own shape) —
 *   draft additionally appends `draft: true`.
 * - link: `type: link`, url, title, date (explicit field order).
 * - release: title, date only — real release files never carry a `type:`
 *   key at all (directory + 11tydata assigns it), so a `newEntry` template
 *   that added one would be inventing a convention the corpus doesn't have.
 */
function frontMatterLinesFor(kind: EntryKind, title: string, date: string, url: string): string[] {
  switch (kind) {
    case "post":
      return ["type: post", `title: ${title}`, `date: ${date}`];
    case "draft":
      return ["type: post", `title: ${title}`, `date: ${date}`, "draft: true"];
    case "link":
      return ["type: link", `url: ${url}`, `title: ${title}`, `date: ${date}`];
    case "release":
      return [`title: ${title}`, `date: ${date}`];
    default:
      return exhaustiveKindCheck(kind);
  }
}

function exhaustiveKindCheck(kind: never): never {
  throw new Error(`unhandled entry kind: ${JSON.stringify(kind)}`);
}

export function newEntryImpl(input: NewEntryInput): { path: string; raw: string } {
  const slug = slugify(input.title);
  const path = pathFor(input.kind, input.date, slug);
  const title = renderScalar(input.title);
  const url = renderScalar(input.url ?? "");
  const fmLines = frontMatterLinesFor(input.kind, title, input.date, url);
  const raw = `---\n${fmLines.map((line) => `${line}\n`).join("")}---\n\n`;
  return { path, raw };
}
