// ABOUTME: Key names and (de)serialization for the small bits of sync-engine
// ABOUTME: state kept in the store's generic meta key/value table.
import type { StoreApi } from "../store/types";
import type { CommitMessageTemplates } from "./types";

const META_CONFLICT_REMOTE_PREFIX = "conflictRemote:";
const RECENT_HEADS_CAP = 20;

function conflictRemoteMetaKey(path: string): string {
  return `${META_CONFLICT_REMOTE_PREFIX}${path}`;
}

function parseStreakCount(raw: string | null, sha: string): number {
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "sha" in parsed &&
      parsed.sha === sha &&
      "count" in parsed &&
      typeof parsed.count === "number"
    ) {
      return parsed.count;
    }
  } catch {
    // fall through — corrupt/foreign value reads as "no streak yet".
  }
  return 0;
}

function isConflictRemote(value: unknown): value is ConflictRemote {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.text === "string" && (record.sha === null || typeof record.sha === "string");
}

// Key names match the examples named in StoreApi.getMeta's own doc comment
// (store/types.ts) so a future Settings screen reads/writes the same slots.
// biome-ignore lint/security/noSecrets: false positive — this is a store meta *key name*, not a secret value.
export const META_LAST_ROOT_TREE_SHA = "lastRootTreeSha";
export const META_LAST_REMOTE_COMMIT_SHA = "lastRemoteCommitSha";
export const META_LAST_SYNC_AT = "lastSyncAt";
export const META_ASSETS_INDEX = "assetsIndex";
export const META_CONFLICTS = "conflicts";
export const META_COMMIT_TEMPLATES = "commitMsgTemplates";
export const META_RECENT_REMOTE_HEADS = "recentRemoteHeads";
export const META_STALE_HEAD_STREAK = "staleHeadStreak";

/** Every commit sha this client has integrated (bootstrap, pull, own push),
 *  newest last. Lets pull recognize a GitHub read-replica serving a head we
 *  have already moved PAST — naively diffing backwards reads as "your
 *  freshly pushed files were deleted remotely" and destroys local rows. */
export async function loadRecentHeads(store: StoreApi): Promise<string[]> {
  const raw = await store.getMeta(META_RECENT_REMOTE_HEADS);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((sha) => typeof sha === "string") : [];
  } catch {
    return [];
  }
}

/** Move-to-end dedupe + cap; also clears any stale-head streak, since a
 *  successful integration means we're reading fresh history again. */
export async function recordRemoteHead(store: StoreApi, sha: string): Promise<void> {
  const heads = (await loadRecentHeads(store)).filter((known) => known !== sha);
  heads.push(sha);
  await store.setMeta(META_RECENT_REMOTE_HEADS, JSON.stringify(heads.slice(-RECENT_HEADS_CAP)));
  await store.setMeta(META_STALE_HEAD_STREAK, JSON.stringify(null));
}

/** Counts consecutive sightings of the same suspect head. Replica lag serves
 *  an old head once or twice; a head that KEEPS coming back is a genuine
 *  history rewind (force-push) that must eventually be accepted as reality. */
export async function bumpStaleHeadStreak(store: StoreApi, sha: string): Promise<number> {
  const raw = await store.getMeta(META_STALE_HEAD_STREAK);
  const next = parseStreakCount(raw, sha) + 1;
  await store.setMeta(META_STALE_HEAD_STREAK, JSON.stringify({ sha, count: next }));
  return next;
}

export const DEFAULT_COMMIT_MESSAGE_TEMPLATES: CommitMessageTemplates = {
  newPost: "Post: {title}",
  edit: "Edit: {title}",
  newDraft: "Draft: {title}",
  newLink: "Link: {title}",
  delete: "Delete: {path}",
};

/** Paths currently flagged as unresolved conflicts. Corrupt/foreign values in
 *  the meta table read back as "no known conflicts" rather than throwing. */
export async function getConflictPaths(store: StoreApi): Promise<string[]> {
  const raw = await store.getMeta(META_CONFLICTS);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return parsed;
    }
  } catch {
    // Fall through to the empty-list default below.
  }
  return [];
}

export async function setConflictPaths(store: StoreApi, paths: readonly string[]): Promise<void> {
  const unique = [...new Set(paths)].sort();
  await store.setMeta(META_CONFLICTS, JSON.stringify(unique));
}

/** User-configurable overrides (Settings) merged over the spec's defaults. */
export async function loadCommitMessageTemplates(store: StoreApi): Promise<CommitMessageTemplates> {
  const raw = await store.getMeta(META_COMMIT_TEMPLATES);
  if (raw === null) {
    return DEFAULT_COMMIT_MESSAGE_TEMPLATES;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      return {
        ...DEFAULT_COMMIT_MESSAGE_TEMPLATES,
        ...(parsed as Partial<CommitMessageTemplates>),
      };
    }
  } catch {
    // Fall through to the defaults below.
  }
  return DEFAULT_COMMIT_MESSAGE_TEMPLATES;
}

/**
 * The remote content pull() found conflicting at detection time. `sha` is
 * null when the remote side of the conflict is a deletion (no blob to point
 * at); `text` is `""` in that case.
 *
 * Why this exists: EntryRecord.baseContent/baseSha are deliberately *not*
 * advanced to the conflicting remote text when pull() detects an overlap
 * (see engine.conflict.test.ts — base stays at the last common ancestor, so
 * a three-way merge is still possible after the user picks a resolution).
 * That means baseContent is never a faithful "theirs" for display purposes —
 * it's the *old* shared base, not the new conflicting remote text. This
 * stash is the seam that lets the UI show the real "theirs" without
 * changing what baseContent means to the merge machinery.
 */
export interface ConflictRemote {
  sha: string | null;
  text: string;
}

/** Stash the remote {sha, text} a just-detected conflict is against. Called
 *  by pull() at the moment it flags a path conflicted. */
export async function stashConflictRemote(
  store: StoreApi,
  path: string,
  remote: ConflictRemote,
): Promise<void> {
  await store.setMeta(conflictRemoteMetaKey(path), JSON.stringify(remote));
}

/** Read back a path's stashed conflicting remote content, if any. Corrupt/
 *  foreign values read back as null rather than throwing. */
export async function getConflictRemote(
  store: StoreApi,
  path: string,
): Promise<ConflictRemote | null> {
  const raw = await store.getMeta(conflictRemoteMetaKey(path));
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isConflictRemote(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Clear a path's stash once its conflict is resolved (or turns out to no
 *  longer apply). Idempotent — clearing an unstashed path is a no-op. */
export async function clearConflictRemote(store: StoreApi, path: string): Promise<void> {
  await store.setMeta(conflictRemoteMetaKey(path), null);
}

/**
 * Clear any unresolved-conflict bookkeeping for `path` — the same cleanup
 * runResolveConflict does at its tail (engine.ts), factored out so any other
 * code that tombstones a path (delete, rename-away) can call it too.
 *
 * Without this, a path that pull() flagged conflicted and is then deleted or
 * renamed away — rather than resolved via resolveConflict — keeps blocking
 * push forever: push()'s conflict-exclusion filter has no way to know the
 * path no longer needs resolving, since nothing else ever removes it from
 * the conflicts list once the path itself stops existing. Idempotent —
 * calling this on a path with no conflict is a no-op.
 */
export async function discardConflictIfAny(store: StoreApi, path: string): Promise<void> {
  const conflicts = await getConflictPaths(store);
  if (!conflicts.includes(path)) {
    return;
  }
  await setConflictPaths(
    store,
    conflicts.filter((conflictPath) => conflictPath !== path),
  );
  await clearConflictRemote(store, path);
}
