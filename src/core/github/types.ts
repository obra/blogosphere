// ABOUTME: Contract for the GitHub Git Data API client — refs, commits, trees,
// ABOUTME: blobs, with typed errors and an injected fetch for testability.

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  /** Injected fetch (webview fetch in prod, mock in tests). */
  fetchImpl: typeof fetch;
}

export interface TreeEntry {
  path: string; // repo-relative
  mode: "100644" | "100755" | "040000" | "160000" | "120000";
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

/** sha:null deletes the path. content is used when sha is absent (client uploads). */
export interface TreeChange {
  path: string;
  mode: "100644";
  sha: string | null;
}

export interface CommitInfo {
  sha: string;
  treeSha: string;
  parents: string[];
  message: string;
}

export type UpdateRefResult =
  | { ok: true; newSha: string }
  | { ok: false; reason: "not-fast-forward" };

/** Typed error hierarchy. All client methods throw these, never raw fetch errors. */
export type GitHubErrorKind =
  | "auth" // 401/403 bad or expired token
  | "not-found" // 404
  | "rate-limited"
  | "network" // offline, DNS, timeout
  | "server" // 5xx
  | "protocol"; // unexpected response shape

export class GitHubError extends Error {
  constructor(
    public kind: GitHubErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/**
 * Thin, typed wrapper over the REST v3 Git Data API. No caching, no retry —
 * that's the sync engine's job. One class, one responsibility.
 */
export interface GitHubApi {
  /** Resolve refs/heads/{branch} to a commit sha. */
  getRef(): Promise<string>;

  getCommit(sha: string): Promise<CommitInfo>;

  /** Recursive tree listing. Throws "protocol" if GitHub truncates the listing. */
  getTreeRecursive(treeSha: string): Promise<TreeEntry[]>;

  /** Raw blob bytes. */
  getBlob(sha: string): Promise<Uint8Array>;

  /** Blob decoded as UTF-8 text. */
  getBlobText(sha: string): Promise<string>;

  /** Create a blob; returns its sha. Accepts text or bytes (base64d on the wire). */
  createBlob(content: string | Uint8Array): Promise<string>;

  /** Create a tree from base + changes; returns new tree sha. */
  createTree(baseTreeSha: string, changes: TreeChange[]): Promise<string>;

  createCommit(input: {
    treeSha: string;
    parents: string[];
    message: string;
  }): Promise<string>;

  /** Compare-and-swap ref update. force is never used. */
  updateRef(newSha: string): Promise<UpdateRefResult>;
}

export type GitHubApiFactory = (config: GitHubConfig) => GitHubApi;
