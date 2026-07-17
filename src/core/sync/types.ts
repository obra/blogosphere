// ABOUTME: Contract for the sync engine — pull/push state machine over the GitHub
// ABOUTME: client and store, diff3 merge, conflict tracking, status events.

import type { GitHubApi } from "../github/types";
import type { ModelApi } from "../model/types";
import type { StoreApi } from "../store/types";

export type SyncState = "idle" | "syncing" | "offline" | "conflict" | "error";

export interface SyncStatus {
  state: SyncState;
  /** Dirty entries + tombstones awaiting push. */
  pendingCount: number;
  /** Paths currently in unresolved conflict. */
  conflicts: string[];
  lastSyncAt: number | null;
  /** Human-readable detail for the error state. */
  message?: string;
}

export interface PullResult {
  /** Clean entries updated from remote. */
  updated: string[];
  /** Dirty entries auto-merged with remote changes (diff3, non-overlapping). */
  merged: string[];
  /** Entries with overlapping changes, now awaiting resolution. */
  conflicts: string[];
  /** Set when the round was skipped because GitHub served a head this client
   *  already integrated past (read-replica lag) — see pull.ts. */
  staleHead?: string;
}

/** A dirty entry excluded from a push because it failed validateForCommit.
 *  It stays dirty (still pending) and is reported via the log — one bad file
 *  must never block the rest of the blog from pushing. */
export interface PushSkip {
  path: string;
  reason: string;
}

export interface PushResult {
  committed: boolean;
  commitSha?: string;
  /** Ref CAS failures retried (pull+rebuild loops). */
  retries: number;
  conflicts: string[];
  /** Paths included in the commit (edits and deletions alike). */
  pushed: string[];
  skipped: PushSkip[];
}

export type SyncLogLevel = "info" | "warn" | "error";

/** One line of the sync activity log — what an operation actually did. */
export interface SyncLogEntry {
  at: number;
  level: SyncLogLevel;
  message: string;
  /** Optional multi-line detail (e.g. the list of pushed paths). */
  detail?: string;
  /** Set on "Pushed …" entries: the commit that landed — deploy-watch keys off it. */
  commitSha?: string;
}

/** Pure three-way merge result. */
export type MergeResult =
  | { ok: true; merged: string }
  | { ok: false; reason: "overlap" };

/** Pure function, exported for direct property testing. */
export type Merge3 = (base: string, mine: string, theirs: string) => MergeResult;

export type ConflictResolution =
  | { choose: "mine" }
  | { choose: "theirs" }
  | { choose: "content"; content: string };

export interface SyncDeps {
  github: GitHubApi;
  store: StoreApi;
  model: ModelApi;
  /** Clock injection for determinism in tests. */
  now: () => number;
  /** Read outbox asset bytes (shell-provided; injected so core stays portable). */
  readAsset: (localPath: string) => Promise<Uint8Array>;
}

export interface CommitMessageTemplates {
  newPost: string; // "Post: {title}"
  edit: string; // "Edit: {title}"
  newDraft: string; // "Draft: {title}"
  newLink: string; // "Link: {title}"
  delete: string; // "Delete: {path}"
}

export interface SyncApi {
  status(): SyncStatus;
  /** Subscribe to status changes; returns unsubscribe. */
  onStatus(cb: (s: SyncStatus) => void): () => void;
  /** Subscribe to the activity log (what each operation actually did —
   *  pushes with paths, pulls, skips, conflicts, errors); returns unsubscribe. */
  onLog(cb: (entry: SyncLogEntry) => void): () => void;

  /** Fetch remote state; update clean entries; merge or flag dirty ones. */
  pull(): Promise<PullResult>;

  /** Pull, then commit all dirty entries + their outbox assets, CAS the ref,
   *  retrying the loop on not-fast-forward. Never force-pushes. */
  push(): Promise<PushResult>;

  /** pull() + push() with a single status cycle. Safe to call when offline —
   *  resolves with the offline status rather than throwing. */
  sync(): Promise<{ pull: PullResult | null; push: PushResult | null }>;

  resolveConflict(path: string, resolution: ConflictResolution): Promise<void>;

  /** Initial full sync for a fresh database. */
  bootstrap(): Promise<void>;
}

export type SyncFactory = (deps: SyncDeps) => SyncApi;
