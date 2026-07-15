// ABOUTME: In-memory ModelApi-lite fake — good enough front-matter surgery to
// ABOUTME: drive app-store tests realistically. Not the spec-faithful editor.
import {
  CONTENT_ROOTS,
  type EditResult,
  type EntryKind,
  type FieldEdit,
  type ModelApi,
  type NewEntryInput,
  type ParsedEntry,
  type ParseResult,
  type PathParts,
  type PublishOptions,
  type PublishPlan,
  type ValidationIssue,
} from "../../../core/model/types";

const YEAR_LENGTH = 4;
const KNOWN_FIELDS = new Set(["title", "date", "tags", "draft", "opaqueId", "url", "type"]);
const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const FILENAME_PATTERN = /^(?:.*\/)?(?:(\d{4})-(\d{2})-(\d{2})-)?([a-z0-9-]+)\.md$/;
const FIELD_LINE_PATTERN = /^([a-zA-Z]+):\s*(.*)$/;

interface SplitRaw {
  frontMatterText: string;
  body: string;
}

function splitRaw(raw: string): SplitRaw | null {
  const match = FRONT_MATTER_PATTERN.exec(raw);
  if (!match) {
    return null;
  }
  const [, frontMatterText, body] = match;
  if (frontMatterText === undefined || body === undefined) {
    return null;
  }
  return { frontMatterText, body };
}

function parseFrontMatterFields(text: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const match = FIELD_LINE_PATTERN.exec(line);
    const key = match?.[1];
    const rawValue = match?.[2];
    if (key !== undefined && rawValue !== undefined) {
      fields[key] = parseScalarOrList(rawValue);
    }
  }
  return fields;
}

function parseScalarOrList(rawValue: string): unknown {
  const trimmed = rawValue.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((item) => unquote(item.trim()));
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  return unquote(trimmed);
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value) as string;
  }
  return value;
}

function kindForPath(path: string): EntryKind | null {
  const roots = Object.entries(CONTENT_ROOTS) as [EntryKind, string][];
  const hit = roots.find(([, root]) => path.startsWith(`${root}/`));
  return hit ? hit[0] : null;
}

function isManagedPath(path: string): boolean {
  return kindForPath(path) !== null;
}

function pathParts(path: string): PathParts | null {
  const match = FILENAME_PATTERN.exec(path);
  if (!match) {
    return null;
  }
  const [, year, month, day, slug] = match;
  if (slug === undefined) {
    return null;
  }
  if (year !== undefined && month !== undefined && day !== undefined) {
    return { year, date: `${year}-${month}-${day}`, slug };
  }
  return { year: "", date: null, slug };
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "untitled" : slug;
}

function pathFor(kind: EntryKind, date: string, slug: string): string {
  const root = CONTENT_ROOTS[kind];
  const filename = `${date}-${slug}.md`;
  if (kind === "post" || kind === "release") {
    return `${root}/${date.slice(0, YEAR_LENGTH)}/${filename}`;
  }
  return `${root}/${filename}`;
}

function permalinkFor(entry: ParsedEntry): string | null {
  if (entry.opaqueId) {
    return `/private/${entry.opaqueId}/`;
  }
  const parts = pathParts(entry.path);
  const date = entry.date ?? parts?.date ?? null;
  if (!(date && parts?.slug)) {
    return null;
  }
  const [year, month, day] = date.split("-");
  if (!(year && month && day)) {
    return null;
  }
  return `/${year}/${month}/${day}/${parts.slug}/`;
}

function parseEntry(path: string, raw: string): ParseResult {
  const split = splitRaw(raw);
  if (!split) {
    return { ok: false, error: "Missing front matter fences" };
  }
  const fields = parseFrontMatterFields(split.frontMatterText);
  const tags = Array.isArray(fields.tags)
    ? fields.tags.filter((t): t is string => typeof t === "string")
    : [];
  const unknownKeys = Object.keys(fields).filter((key) => !KNOWN_FIELDS.has(key));
  const entry: ParsedEntry = {
    path,
    kind: kindForPath(path) ?? "post",
    raw,
    frontMatterText: split.frontMatterText,
    body: split.body,
    title: typeof fields.title === "string" ? fields.title : null,
    date: typeof fields.date === "string" ? fields.date : null,
    tags,
    draft: fields.draft === true,
    opaqueId: typeof fields.opaqueId === "string" ? fields.opaqueId : null,
    url: typeof fields.url === "string" ? fields.url : null,
    type: typeof fields.type === "string" ? fields.type : null,
    unknownKeys,
  };
  return { ok: true, entry };
}

function lineForEdit(edit: FieldEdit): string | null {
  switch (edit.field) {
    case "title":
      return `title: ${JSON.stringify(edit.value)}`;
    case "date":
      return `date: ${edit.value}`;
    case "tags":
      return edit.value === null
        ? null
        : `tags: [${edit.value.map((t) => JSON.stringify(t)).join(", ")}]`;
    case "draft":
      return edit.value === null ? null : `draft: ${edit.value}`;
    case "opaqueId":
      return edit.value === null ? null : `opaqueId: ${edit.value}`;
    case "url":
      return `url: ${JSON.stringify(edit.value)}`;
    case "type":
      return `type: ${edit.value}`;
    default:
      return null;
  }
}

function applyFieldEdit(frontMatterText: string, edit: FieldEdit): string {
  const newLine = lineForEdit(edit);
  const lines = frontMatterText.split("\n");
  const pattern = new RegExp(`^${edit.field}:`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) {
    return newLine === null ? frontMatterText : [...lines, newLine].join("\n");
  }
  if (newLine === null) {
    return lines.filter((_, i) => i !== index).join("\n");
  }
  return lines.map((line, i) => (i === index ? newLine : line)).join("\n");
}

function applyEdits(raw: string, edits: FieldEdit[]): EditResult {
  const split = splitRaw(raw);
  if (!split) {
    return { ok: false, error: "Missing front matter fences" };
  }
  const frontMatterText = edits.reduce(
    (fm, edit) => applyFieldEdit(fm, edit),
    split.frontMatterText,
  );
  return { ok: true, raw: `---\n${frontMatterText}\n---\n${split.body}` };
}

function replaceBody(raw: string, body: string): EditResult {
  const split = splitRaw(raw);
  if (!split) {
    return { ok: false, error: "Missing front matter fences" };
  }
  return { ok: true, raw: `---\n${split.frontMatterText}\n---\n${body}` };
}

function scaffoldFrontMatter(input: NewEntryInput): string[] {
  const lines = [`title: ${JSON.stringify(input.title)}`, `date: ${input.date}`];
  if (input.kind === "draft") {
    lines.push("draft: true");
  }
  if (input.kind === "link") {
    lines.push(`url: ${JSON.stringify(input.url ?? "")}`, `type: "link"`);
  }
  return lines;
}

function newEntry(input: NewEntryInput): { path: string; raw: string } {
  const slug = slugify(input.title);
  const path = pathFor(input.kind, input.date, slug);
  const raw = `---\n${scaffoldFrontMatter(input).join("\n")}\n---\n`;
  return { path, raw };
}

function planPublish(entry: ParsedEntry, opts: PublishOptions): PublishPlan {
  const slug = pathParts(entry.path)?.slug ?? slugify(entry.title ?? "untitled");
  const newPath = pathFor("post", opts.date, slug);
  const edits: FieldEdit[] = [
    { field: "date", value: opts.date },
    { field: "draft", value: null },
  ];
  if (!opts.keepOpaqueId) {
    edits.push({ field: "opaqueId", value: null });
  }
  return { newPath, edits };
}

function validateForCommit(path: string, raw: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!splitRaw(raw)) {
    issues.push({ severity: "error", message: "Missing front matter fences" });
  }
  if (!pathParts(path)) {
    issues.push({ severity: "error", message: "Unrecognized filename pattern" });
  }
  return issues;
}

/** A fresh, stateless ModelApi fake — every call is pure, so one instance is fine to share. */
function createFakeModel(): ModelApi {
  return {
    parseEntry,
    kindForPath,
    isManagedPath,
    pathParts,
    pathFor,
    slugify,
    permalinkFor,
    applyEdits,
    replaceBody,
    newEntry,
    planPublish,
    validateForCommit,
  };
}

export { createFakeModel };
