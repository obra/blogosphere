// ABOUTME: Shared helpers to derive denormalized EntryRecord fields from raw
// ABOUTME: remote text, and to fetch one path's current remote content on demand.
import type { GitHubApi } from "../github/types";
import type { EntryKind, ModelApi } from "../model/types";
import type { EntryRecord } from "../store/types";

export interface DenormalizedFields {
  kind: EntryKind;
  title: string | null;
  date: string | null;
  draft: boolean;
  opaqueId: string | null;
}

/** Lifts an existing EntryRecord's denormalized fields into the shape
 *  denormalize()'s `fallback` param expects — the "last-known-good" value
 *  to preserve on a transient parse failure. */
export function fallbackFrom(
  entry: Pick<EntryRecord, "kind" | "title" | "date" | "draft" | "opaqueId">,
): DenormalizedFields {
  return {
    kind: entry.kind,
    title: entry.title,
    date: entry.date,
    draft: entry.draft,
    opaqueId: entry.opaqueId,
  };
}

/**
 * Derives EntryRecord's denormalized display fields from raw markdown text.
 *
 * On a parse failure (unreadable front matter fences — a malformed-but-
 * fenced document degrades individual fields to null/false rather than
 * failing at all, see model/entry.ts), returns `fallback` if one is given,
 * otherwise the hard-null default. Pass the previous EntryRecord's fields
 * whenever one exists (a remote edit that transiently breaks front matter,
 * or a local edit that does) so a momentary parse failure doesn't blank a
 * perfectly good last-known-good title/date out from under the user; omit
 * it only where there's genuinely no prior entry (first-ever bootstrap of a
 * path, or a brand-new local entry).
 *
 * This is the single implementation of this fallback policy — every caller
 * with a prior record in scope should route through it (rather than
 * re-deriving fields with its own ad hoc fallback), so the two call sites
 * that used to disagree (a remote-driven pull()/engine.ts vs a local-edit-
 * driven app-store write) can't silently diverge again.
 */
export function denormalize(
  model: ModelApi,
  path: string,
  raw: string,
  fallback: DenormalizedFields | null = null,
): DenormalizedFields {
  const parsed = model.parseEntry(path, raw);
  if (parsed.ok) {
    return {
      kind: parsed.entry.kind,
      title: parsed.entry.title,
      date: parsed.entry.date,
      draft: parsed.entry.draft,
      opaqueId: parsed.entry.opaqueId,
    };
  }
  if (fallback) {
    return fallback;
  }
  // Front matter fences were unreadable. Callers only reach here for managed
  // paths (isManagedPath already gated them in), so kindForPath should not
  // return null in practice; "post" is a last-resort fallback so
  // EntryRecord.kind's non-null contract still holds.
  const kind = model.kindForPath(path) ?? "post";
  return { kind, title: null, date: null, draft: false, opaqueId: null };
}

export interface RemoteFile {
  sha: string;
  text: string;
}

/** Fetches a single path's current remote content, or null if it doesn't exist. */
export async function fetchCurrentRemote(
  github: GitHubApi,
  path: string,
): Promise<RemoteFile | null> {
  const headSha = await github.getRef();
  const commit = await github.getCommit(headSha);
  const entries = await github.getTreeRecursive(commit.treeSha);
  const found = entries.find((entry) => entry.type === "blob" && entry.path === path);
  if (!found) {
    return null;
  }
  const text = await github.getBlobText(found.sha);
  return { sha: found.sha, text };
}
