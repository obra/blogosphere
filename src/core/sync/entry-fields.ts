// ABOUTME: Shared helpers to derive denormalized EntryRecord fields from raw
// ABOUTME: remote text, and to fetch one path's current remote content on demand.
import type { GitHubApi } from "../github/types";
import type { EntryKind, ModelApi } from "../model/types";

export interface DenormalizedFields {
  kind: EntryKind;
  title: string | null;
  date: string | null;
  draft: boolean;
  opaqueId: string | null;
}

/** Derives EntryRecord's denormalized display fields from raw markdown text. */
export function denormalize(model: ModelApi, path: string, raw: string): DenormalizedFields {
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
