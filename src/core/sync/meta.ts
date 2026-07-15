// ABOUTME: Key names and (de)serialization for the small bits of sync-engine
// ABOUTME: state kept in the store's generic meta key/value table.
import type { StoreApi } from "../store/types";
import type { CommitMessageTemplates } from "./types";

// Key names match the examples named in StoreApi.getMeta's own doc comment
// (store/types.ts) so a future Settings screen reads/writes the same slots.
// biome-ignore lint/security/noSecrets: false positive — this is a store meta *key name*, not a secret value.
export const META_LAST_ROOT_TREE_SHA = "lastRootTreeSha";
export const META_LAST_REMOTE_COMMIT_SHA = "lastRemoteCommitSha";
export const META_LAST_SYNC_AT = "lastSyncAt";
export const META_ASSETS_INDEX = "assetsIndex";
export const META_CONFLICTS = "conflicts";
export const META_COMMIT_TEMPLATES = "commitMsgTemplates";

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
