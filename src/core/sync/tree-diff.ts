// ABOUTME: Pure recursive-tree-listing diff restricted to model-managed paths,
// ABOUTME: plus an asset-index extractor. No IO — just Map/array bookkeeping.
import type { TreeEntry } from "../github/types";

function managedBlobShas(
  entries: readonly TreeEntry[],
  isManagedPath: (path: string) => boolean,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type === "blob" && isManagedPath(entry.path)) {
      map.set(entry.path, entry.sha);
    }
  }
  return map;
}

export interface ManagedPathChange {
  path: string;
  /** Blob sha in the old listing, or null if the path didn't exist there. */
  oldSha: string | null;
  /** Blob sha in the new listing, or null if the path no longer exists. */
  newSha: string | null;
}

/**
 * Diffs two recursive tree listings, restricted to blobs `isManagedPath`
 * accepts. Returns one entry per path whose managed-blob sha differs between
 * the two listings (added, removed, or modified).
 */
export function diffManagedTrees(
  oldEntries: readonly TreeEntry[],
  newEntries: readonly TreeEntry[],
  isManagedPath: (path: string) => boolean,
): ManagedPathChange[] {
  const oldMap = managedBlobShas(oldEntries, isManagedPath);
  const newMap = managedBlobShas(newEntries, isManagedPath);

  const paths = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
  const changes: ManagedPathChange[] = [];
  for (const path of paths) {
    const oldSha = oldMap.get(path) ?? null;
    const newSha = newMap.get(path) ?? null;
    if (oldSha !== newSha) {
      changes.push({ path, oldSha, newSha });
    }
  }
  return changes;
}

export interface AssetIndexEntry {
  path: string;
  sha: string;
}

/** Blob entries whose path lives under `rootPrefix/`, for the assets index. */
export function blobPathsUnder(
  entries: readonly TreeEntry[],
  rootPrefix: string,
): AssetIndexEntry[] {
  const prefix = `${rootPrefix}/`;
  return entries
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix))
    .map((entry) => ({ path: entry.path, sha: entry.sha }));
}
