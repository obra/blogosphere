// ABOUTME: Path/slug/date rules — which kind lives where, filename <-> date/slug
// ABOUTME: parsing, canonical path construction, and permalink derivation.

import { CONTENT_ROOTS, type EntryKind, type ParsedEntry, type PathParts } from "./types";

const KINDS: readonly EntryKind[] = ["post", "draft", "link", "release"];

/** Kinds whose canonical path nests entries under a YYYY directory. */
const YEAR_NESTED_KINDS: ReadonlySet<EntryKind> = new Set(["post", "release"]);

// .html alongside .md: the ~440 legacy 1996-2014 LiveJournal imports living
// under content/blog/YYYY/ are real files the client must browse/read/edit/
// sync (body editing is source-mode only — see ui/editor — but path/kind/
// front-matter handling is uniform across every managed root, even though
// only content/blog has any .html in practice).
const DATED_FILENAME_RE = /^(\d{4})-(\d{2})-(\d{2})-(.+)\.(?:md|html)$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FOUR_DIGIT_YEAR_RE = /^\d{4}$/;
const MD_EXTENSION = ".md";
const HTML_EXTENSION = ".html";
const MANAGED_EXTENSIONS: readonly string[] = [MD_EXTENSION, HTML_EXTENSION];
const ISO_DATE_YEAR_LENGTH = 4;

function basenameOf(path: string): string | null {
  const segments = path.split("/");
  const last = segments.at(-1);
  return last && last.length > 0 ? last : null;
}

function hasManagedExtension(filename: string): boolean {
  return MANAGED_EXTENSIONS.some((ext) => filename.endsWith(ext));
}

/** Strip whichever managed extension `filename` ends with. Precondition:
 *  `hasManagedExtension(filename)` — callers already checked. */
function stripManagedExtension(filename: string): string {
  const ext = MANAGED_EXTENSIONS.find((candidate) => filename.endsWith(candidate));
  return ext ? filename.slice(0, -ext.length) : filename;
}

/** True when `path`'s first `rootSegments.length` segments equal `rootSegments`. */
function hasPrefix(segments: string[], rootSegments: string[]): boolean {
  const prefix = segments.slice(0, rootSegments.length);
  return rootSegments.every((seg, idx) => prefix[idx] === seg);
}

function pathPartsFromDatedFilename(filename: string): PathParts | null {
  const match = DATED_FILENAME_RE.exec(filename);
  if (!match) {
    return null;
  }
  const [, year, month, day, slug] = match;
  if (!(year && month && day && slug)) {
    return null;
  }
  return { year, date: `${year}-${month}-${day}`, slug };
}

function pathPartsFromYearDirectory(path: string, filename: string): PathParts | null {
  if (!hasManagedExtension(filename)) {
    return null;
  }
  const slug = stripManagedExtension(filename);
  if (slug.length === 0) {
    return null;
  }
  const segments = path.split("/");
  const parent = segments.length >= 2 ? segments.at(-2) : undefined;
  if (parent && FOUR_DIGIT_YEAR_RE.test(parent)) {
    return { year: parent, date: null, slug };
  }
  return null;
}

/**
 * Which kind owns this path, or null if it's outside our managed roots.
 * Accepts both the canonical nested shape (root/YYYY/file.md) and a flat
 * shape (root/file.md) for every kind — the real blog has at least one
 * legacy release committed flat, directly under content/releases/, so
 * reading has to tolerate what create-post-era history actually produced.
 * Anything nested deeper than that (co-located reference files beside an
 * old post) is deliberately excluded. Also accepts .html — uniformly across
 * every kind, even though only content/blog has any real .html files (the
 * ~440 legacy LiveJournal imports) — so a stray .html elsewhere isn't
 * silently treated differently than a stray .md would be.
 */
export function kindForPath(path: string): EntryKind | null {
  const filename = basenameOf(path);
  if (!(filename && hasManagedExtension(filename)) || MANAGED_EXTENSIONS.includes(filename)) {
    return null;
  }
  const segments = path.split("/");

  const found = KINDS.find((kind) => {
    const rootSegments = CONTENT_ROOTS[kind].split("/");
    const depth = segments.length - rootSegments.length;
    return (depth === 1 || depth === 2) && hasPrefix(segments, rootSegments);
  });
  return found ?? null;
}

export function isManagedPath(path: string): boolean {
  return kindForPath(path) !== null;
}

/** Parse YYYY-MM-DD-slug(.md) filename parts, falling back to a YYYY parent
 * directory (date: null) when the filename itself has no date prefix. */
export function pathParts(path: string): PathParts | null {
  const filename = basenameOf(path);
  if (!filename) {
    return null;
  }
  return pathPartsFromDatedFilename(filename) ?? pathPartsFromYearDirectory(path, filename);
}

/** The slug `path` itself encodes: pathParts' slug for the dated and
 * year-nested shapes, else the bare filename minus its managed extension —
 * an entry's real on-disk name is never discarded just because its shape
 * isn't canonical. Shared by planPublish and the Publish sheet's slug seed,
 * which must agree on what "the current slug" means. */
export function slugForPath(path: string): string {
  const parts = pathParts(path);
  if (parts !== null) {
    return parts.slug;
  }
  const filename = basenameOf(path) ?? path;
  return hasManagedExtension(filename) ? stripManagedExtension(filename) : filename;
}

/** Build the canonical repo path for a kind/date/slug (always the nested
 * shape for post/release — new writes follow the modern convention even
 * though reads tolerate the legacy flat one). */
export function pathFor(kind: EntryKind, date: string, slug: string): string {
  const year = date.slice(0, ISO_DATE_YEAR_LENGTH);
  const filename = `${date}-${slug}.md`;
  const root = CONTENT_ROOTS[kind];
  return YEAR_NESTED_KINDS.has(kind) ? `${root}/${year}/${filename}` : `${root}/${filename}`;
}

/** Replace whitespace runs with "-", strip anything outside [A-Za-z0-9._-],
 * collapse repeated "-", never return empty. Deliberately does not lowercase
 * — the real corpus preserves author-typed case (e.g. "I-started-a-company"),
 * and this needs to match that reality, not impose a stricter convention. */
export function slugify(title: string): string {
  const hyphenated = title.replace(/\s+/g, "-");
  const stripped = hyphenated.replace(/[^A-Za-z0-9._-]/g, "");
  const collapsed = stripped.replace(/-{2,}/g, "-");
  return collapsed.length > 0 ? collapsed : "untitled";
}

/** Site-relative permalink: opaqueId wins ("/private/{id}/"); otherwise date
 * (front matter, falling back to the filename-encoded date) + the filename
 * slug give "/YYYY/MM/DD/slug/"; null when no date is available at all. */
export function permalinkFor(entry: ParsedEntry): string | null {
  if (entry.opaqueId) {
    return `/private/${entry.opaqueId}/`;
  }

  const parts = pathParts(entry.path);
  const slug = parts === null ? null : parts.slug;
  const effectiveDate = entry.date ?? (parts === null ? null : parts.date);
  if (slug === null || effectiveDate === null) {
    return null;
  }

  const match = ISO_DATE_RE.exec(effectiveDate);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  if (!(year && month && day)) {
    return null;
  }
  return `/${year}/${month}/${day}/${slug}/`;
}
