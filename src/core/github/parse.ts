// ABOUTME: Validates and shapes raw GitHub JSON responses into this module's
// ABOUTME: types — every surprise in the response shape becomes a "protocol" error.

import type { CommitInfo, TreeEntry } from "./types";
import { GitHubError } from "./types";

const TREE_MODES: ReadonlySet<string> = new Set(["100644", "100755", "040000", "160000", "120000"]);
const TREE_TYPES: ReadonlySet<string> = new Set(["blob", "tree", "commit"]);

interface RawTreeEntry {
  path?: unknown;
  mode?: unknown;
  type?: unknown;
  sha?: unknown;
  size?: unknown;
}

function toTreeEntry(raw: unknown, index: number, context: string): TreeEntry {
  const entry = raw as RawTreeEntry | null;
  const path = entry?.path;
  const sha = entry?.sha;
  const mode = entry?.mode;
  const type = entry?.type;

  if (typeof path !== "string" || typeof sha !== "string") {
    throw new GitHubError("protocol", `${context}: tree[${index}] is missing path or sha`);
  }
  if (typeof mode !== "string" || !TREE_MODES.has(mode)) {
    throw new GitHubError("protocol", `${context}: tree[${index}] has an unexpected mode`);
  }
  if (typeof type !== "string" || !TREE_TYPES.has(type)) {
    throw new GitHubError("protocol", `${context}: tree[${index}] has an unexpected type`);
  }

  const result: TreeEntry = {
    path,
    mode: mode as TreeEntry["mode"],
    type: type as TreeEntry["type"],
    sha,
  };
  const size = entry?.size;
  if (typeof size === "number") {
    result.size = size;
  }
  return result;
}

/** Validates a "get a tree, recursive" response. Throws "protocol" on truncation. */
export function parseTreeResponse(data: unknown, context: string): TreeEntry[] {
  const raw = data as { tree?: unknown; truncated?: unknown } | null;
  if (raw?.truncated === true) {
    throw new GitHubError("protocol", `${context}: GitHub truncated the recursive tree listing`);
  }
  const tree = raw?.tree;
  if (!Array.isArray(tree)) {
    throw new GitHubError("protocol", `${context}: response is missing a tree array`);
  }
  return tree.map((entry, index) => toTreeEntry(entry, index, context));
}

/** Validates a "get a commit" response into CommitInfo. */
export function parseCommitResponse(data: unknown, context: string): CommitInfo {
  const raw = data as {
    sha?: unknown;
    message?: unknown;
    tree?: { sha?: unknown };
    parents?: unknown;
  } | null;
  const sha = raw?.sha;
  const message = raw?.message;
  const treeSha = raw?.tree?.sha;
  const parents = raw?.parents;

  if (typeof sha !== "string") {
    throw new GitHubError("protocol", `${context}: response is missing sha`);
  }
  if (typeof message !== "string") {
    throw new GitHubError("protocol", `${context}: response is missing message`);
  }
  if (typeof treeSha !== "string") {
    throw new GitHubError("protocol", `${context}: response is missing tree.sha`);
  }
  if (!Array.isArray(parents)) {
    throw new GitHubError("protocol", `${context}: response is missing a parents array`);
  }

  const parentShas = parents.map((parent, index) => {
    const parentSha = (parent as { sha?: unknown } | null)?.sha;
    if (typeof parentSha !== "string") {
      throw new GitHubError("protocol", `${context}: parents[${index}] is missing sha`);
    }
    return parentSha;
  });

  return { sha, treeSha, parents: parentShas, message };
}

/** Validates a ref response (GET or PATCH) and extracts object.sha. */
export function extractRefSha(data: unknown, context: string): string {
  const raw = data as { object?: { sha?: unknown } } | null;
  const sha = raw?.object?.sha;
  if (typeof sha !== "string" || sha.length === 0) {
    throw new GitHubError("protocol", `${context}: response is missing object.sha`);
  }
  return sha;
}

/** Validates a blob/tree/commit-creation response and extracts sha. */
export function extractCreatedSha(data: unknown, context: string): string {
  const raw = data as { sha?: unknown } | null;
  const sha = raw?.sha;
  if (typeof sha !== "string" || sha.length === 0) {
    throw new GitHubError("protocol", `${context}: response is missing sha`);
  }
  return sha;
}

/** Validates a "get a blob" response and extracts its base64 content. */
export function extractBlobContent(data: unknown, context: string): string {
  const raw = data as { content?: unknown; encoding?: unknown } | null;
  const content = raw?.content;
  const encoding = raw?.encoding;
  if (typeof content !== "string" || encoding !== "base64") {
    throw new GitHubError("protocol", `${context}: expected base64-encoded blob content`);
  }
  return content;
}
