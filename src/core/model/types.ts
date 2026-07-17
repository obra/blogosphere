// ABOUTME: Contract for the content model — entry kinds, front matter parsing,
// ABOUTME: surgical field edits, path/date rules, publish transforms, validation.

/** The four content kinds the client manages. */
export type EntryKind = "post" | "draft" | "link" | "release";

/** Repo-relative paths that contain each kind. */
export const CONTENT_ROOTS = {
  post: "content/blog",
  draft: "content/drafts",
  link: "content/_linkblog",
  release: "content/releases",
} as const;

export const ASSETS_ROOT = "content/assets";

/**
 * A parsed entry. `raw` is always the document of record; everything else is a
 * read-only view derived from it. Mutations happen via FieldEdit / replaceBody,
 * which produce a new `raw`.
 */
export interface ParsedEntry {
  /** Repo-relative path, e.g. "content/blog/2026/2026-07-15-a-post.md". */
  path: string;
  kind: EntryKind;
  /** The full original file text. Document of record. */
  raw: string;
  /** Raw front matter block text, exactly as it appears between the --- fences. */
  frontMatterText: string;
  /** Body text after the closing fence (leading newline not included). */
  body: string;
  // Parsed front matter fields (read-only views):
  title: string | null;
  /** ISO date string YYYY-MM-DD as written in front matter, if present. */
  date: string | null;
  tags: string[];
  draft: boolean;
  opaqueId: string | null;
  /** Link posts: the linked URL. */
  url: string | null;
  type: string | null;
  /** Any front matter keys the client does not model, preserved verbatim. */
  unknownKeys: string[];
}

/** Date/slug parsed from a conventional filename. */
export interface PathParts {
  year: string;
  /** YYYY-MM-DD from the filename, or null for non-dated names. */
  date: string | null;
  slug: string;
}

/** A surgical edit to one known front matter field. `null` removes the field. */
export type FieldEdit =
  | { field: "title"; value: string }
  | { field: "date"; value: string } // YYYY-MM-DD
  | { field: "tags"; value: string[] | null }
  | { field: "draft"; value: boolean | null }
  | { field: "opaqueId"; value: string | null }
  | { field: "url"; value: string }
  | { field: "type"; value: string };

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
}

export type ParseResult =
  | { ok: true; entry: ParsedEntry }
  | { ok: false; error: string };

export type EditResult =
  | { ok: true; raw: string }
  | { ok: false; error: string };

export interface NewEntryInput {
  kind: EntryKind;
  title: string;
  /** YYYY-MM-DD; defaults to today (caller supplies — model stays clock-free). */
  date: string;
  url?: string; // for links
}

export interface PublishOptions {
  /** YYYY-MM-DD publish date (caller supplies today). */
  date: string;
  /** Keep the opaqueId (and its /private/ URL) alive. Default false. */
  keepOpaqueId?: boolean;
  /** URL slug for the published path. Defaults to the current filename's slug
   *  — but a ⌘N draft's filename is "untitled", so the Publish sheet offers
   *  a title-derived slug and lets the user edit it before committing to a URL. */
  slug?: string;
}

export interface PublishPlan {
  /** New repo path (may equal old path for in-place publish). */
  newPath: string;
  /** Edits to apply to the raw text. */
  edits: FieldEdit[];
}

/** Pure functions over content. No IO, no clock, no globals. */
export interface ModelApi {
  /** Parse a file. Fails only on unreadable front matter fences; malformed YAML
   *  inside the fences yields ok:true with null fields + a validation issue later. */
  parseEntry(path: string, raw: string): ParseResult;

  /** Which kind lives at this path, or null if the path is outside our roots. */
  kindForPath(path: string): EntryKind | null;

  /** True when path is a markdown entry the client manages. */
  isManagedPath(path: string): boolean;

  /** Parse YYYY-MM-DD-slug(.md) filename parts. */
  pathParts(path: string): PathParts | null;

  /** Build the conventional repo path for a kind/date/slug. */
  pathFor(kind: EntryKind, date: string, slug: string): string;

  /** Hyphenate, strip unsafe chars, preserve author-typed case (the real
   *  corpus has slugs like "I-started-a-company"). Deterministic, total. */
  slugify(title: string): string;

  /** Site-relative permalink for an entry ("/YYYY/MM/DD/slug/" or "/private/{id}/"). */
  permalinkFor(entry: ParsedEntry): string | null;

  /**
   * Apply field edits as minimal text edits to the raw front matter block.
   * Never re-serializes untouched lines. Fails (rather than guesses) when the
   * existing YAML is too malformed to edit surgically.
   */
  applyEdits(raw: string, edits: FieldEdit[]): EditResult;

  /** Replace the body, leaving the front matter block byte-identical. */
  replaceBody(raw: string, body: string): EditResult;

  /** Scaffold a new entry file. Returns conventional path + initial raw text. */
  newEntry(input: NewEntryInput): { path: string; raw: string };

  /** Compute the publish transform for a draft (date fixup, move, flag removal). */
  planPublish(entry: ParsedEntry, opts: PublishOptions): PublishPlan;

  /** Pre-commit validation: filename pattern, parseable front matter, date/filename
   *  agreement, required fields per kind. Empty array = safe to commit. */
  validateForCommit(path: string, raw: string): ValidationIssue[];
}
