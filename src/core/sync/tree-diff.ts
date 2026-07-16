// ABOUTME: Pure recursive-tree-listing diff restricted to model-managed paths,
// ABOUTME: plus an asset-index extractor. No IO — just Map/array bookkeeping.
import type { TreeEntry } from "../github/types";

const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|gif|svg|webp|avif)$/i;

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

/**
 * The image-fetch index: everything under content/assets/ plus image blobs
 * co-located with posts (content/blog/2025/some-post/diagram.png). The
 * editor's resolveImage uses this to fetch an uncached image's blob by sha.
 */
export function imageIndexFor(
  entries: readonly TreeEntry[],
  assetsRoot: string,
  contentRoots: readonly string[],
): AssetIndexEntry[] {
  const assets = blobPathsUnder(entries, assetsRoot);
  const seen = new Set(assets.map((a) => a.path));
  const coLocated = contentRoots
    .flatMap((root) => blobPathsUnder(entries, root))
    .filter((entry) => IMAGE_EXTENSION_PATTERN.test(entry.path) && !seen.has(entry.path));
  return [...assets, ...coLocated];
}
