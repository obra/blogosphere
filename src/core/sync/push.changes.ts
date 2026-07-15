// ABOUTME: Push helpers that decide *what* a commit contains — which dirty
// ABOUTME: entries are safe to push (conflict/rename-pair aware) and the
// ABOUTME: blob/tree changes and collision guard for them.
import type { TreeChange } from "../github/types";
import type { EntryRecord, OutboxAsset } from "../store/types";
import { SyncError } from "./errors";
import type { SyncDeps } from "./types";

export function requireBlobSha(blobShas: ReadonlyMap<string, string>, path: string): string {
  const sha = blobShas.get(path);
  if (sha === undefined) {
    throw new SyncError(`missing blob sha for ${path}`);
  }
  return sha;
}

export async function createEntryBlobs(
  deps: SyncDeps,
  pushable: readonly EntryRecord[],
): Promise<Map<string, string>> {
  const withContent = pushable.filter((entry) => !entry.deleted);
  const pairs = await Promise.all(
    withContent.map(
      async (entry): Promise<[string, string]> => [
        entry.path,
        await deps.github.createBlob(entry.workingContent),
      ],
    ),
  );
  return new Map(pairs);
}

export function createAssetChanges(
  deps: SyncDeps,
  assets: readonly OutboxAsset[],
): Promise<TreeChange[]> {
  return Promise.all(
    assets.map(async (asset): Promise<TreeChange> => {
      const bytes = await deps.readAsset(asset.localPath);
      const sha = await deps.github.createBlob(bytes);
      return { path: asset.repoPath, mode: "100644", sha };
    }),
  );
}

export function buildEntryChanges(
  pushable: readonly EntryRecord[],
  blobShas: ReadonlyMap<string, string>,
  conflictPaths: ReadonlySet<string>,
): Map<string, TreeChange> {
  const changesByPath = new Map<string, TreeChange>();
  for (const entry of pushable) {
    changesByPath.set(entry.path, {
      path: entry.path,
      mode: "100644",
      sha: entry.deleted ? null : requireBlobSha(blobShas, entry.path),
    });
    // Defense-in-depth: computePushable already excludes a whole rename pair
    // once either half is conflicted, so entry.renamedFrom should never be
    // in conflictPaths here — but never let this side-channel delete a path
    // whose own conflict this push doesn't know how to resolve.
    if (entry.renamedFrom !== null && !conflictPaths.has(entry.renamedFrom)) {
      changesByPath.set(entry.renamedFrom, { path: entry.renamedFrom, mode: "100644", sha: null });
    }
  }
  return changesByPath;
}

/** Dirty entries + tombstones eligible to push, excluding conflicted paths —
 *  and, for a rename pair (old-path tombstone + new-path row carrying
 *  renamedFrom), excluding *both* halves whenever either one is conflicted.
 *  A rename's delete+add must land in the same commit or not at all: pushing
 *  only the tombstone would delete the old path while silently dropping the
 *  new content, and pushing only the new path while skipping its
 *  renamedFrom-driven delete would (per buildEntryChanges above) still try
 *  to delete a path this push has no business touching. */
export function computePushable(
  dirty: readonly EntryRecord[],
  conflictPaths: ReadonlySet<string>,
): EntryRecord[] {
  const blocked = new Set<string>(conflictPaths);
  for (const entry of dirty) {
    if (
      entry.renamedFrom !== null &&
      (conflictPaths.has(entry.path) || conflictPaths.has(entry.renamedFrom))
    ) {
      blocked.add(entry.path);
      blocked.add(entry.renamedFrom);
    }
  }
  return dirty.filter((entry) => !blocked.has(entry.path));
}

/** Rename/publish produces a fresh row (baseSha: null) at the new path. If
 *  that path already has *different*, remote-only content our local store
 *  never reconciled with (a same-path collision with another entry, or a
 *  future caller of the rename plumbing skipping the app's own pre-rename
 *  collision guard), pushing would silently overwrite it — no local diff,
 *  no conflict, nothing for validateForCommit to see. Guard it here too. */
export async function findRenameCollision(
  deps: SyncDeps,
  pushable: readonly EntryRecord[],
  remoteTreeSha: string,
): Promise<string | null> {
  const renamedIn = pushable.filter(
    (entry) => !entry.deleted && entry.renamedFrom !== null && entry.baseSha === null,
  );
  if (renamedIn.length === 0) {
    return null;
  }
  const remoteEntries = await deps.github.getTreeRecursive(remoteTreeSha);
  const remotePaths = new Set(
    remoteEntries.filter((entry) => entry.type === "blob").map((entry) => entry.path),
  );
  const collision = renamedIn.find((entry) => remotePaths.has(entry.path));
  return collision ? collision.path : null;
}
