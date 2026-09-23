// ABOUTME: Push helpers that decide *what* a commit contains — which dirty
// ABOUTME: entries are safe to push (conflict/rename-pair aware) and the
// ABOUTME: blob/tree changes and collision guard for them.
import type { TreeChange } from "../github/types";
import type { EntryRecord, OutboxAsset } from "../store/types";
import { SyncError } from "./errors";
import type { SyncDeps } from "./types";

/** Gathers outbox assets riding this push: uploads for live entries, plus
 *  the orphaned rows of deleted entries. Assets for a *deleted* entry must
 *  never be uploaded (there's no point riding an image blob along with
 *  content that's about to disappear), but their outbox rows still need to
 *  be swept up here — otherwise they're never fetched by either the upload
 *  pass or the cleanup pass again, and leak in local storage forever (see
 *  applySuccessfulPush's removeAsset). */
async function collectPushAssets(deps: SyncDeps, pushable: readonly EntryRecord[]) {
  const nonDeletedPaths = pushable.filter((entry) => !entry.deleted).map((entry) => entry.path);
  const deletedPaths = pushable.filter((entry) => entry.deleted).map((entry) => entry.path);
  const uploadAssets = await deps.store.listAssetsFor(nonDeletedPaths);
  const orphanedAssets =
    deletedPaths.length === 0 ? [] : await deps.store.listAssetsFor(deletedPaths);
  return { uploadAssets, assets: [...uploadAssets, ...orphanedAssets] };
}

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

/** Blob paths in the remote tree this push builds on — fetched only when
 *  some pushable entry deletes or renames a path, since those are the only
 *  changes that need to know what GitHub already has. Otherwise empty. */
export async function loadRemotePathsIfNeeded(
  deps: SyncDeps,
  pushable: readonly EntryRecord[],
  remoteTreeSha: string,
): Promise<ReadonlySet<string>> {
  if (!pushable.some((entry) => entry.deleted || entry.renamedFrom !== null)) {
    return new Set();
  }
  const remoteEntries = await deps.github.getTreeRecursive(remoteTreeSha);
  return new Set(remoteEntries.filter((entry) => entry.type === "blob").map((entry) => entry.path));
}

/** GitHub rejects a whole createTree with "GitRPC::BadObjectState" if any
 *  deletion names a path the base tree doesn't have — a draft deleted or
 *  published before it was ever pushed, or a file another writer already
 *  removed. Such a deletion has nothing to do remotely; drop it so the rest
 *  of the batch lands, and the local tombstone is cleaned up as pushed. */
export function dropDeletionsOfMissingPaths(
  changesByPath: Map<string, TreeChange>,
  remotePaths: ReadonlySet<string>,
): void {
  for (const [path, change] of changesByPath) {
    if (change.sha === null && !remotePaths.has(path)) {
      changesByPath.delete(path);
    }
  }
}

/** Rename/publish produces a fresh row (baseSha: null) at the new path. If
 *  that path already has *different*, remote-only content our local store
 *  never reconciled with (a same-path collision with another entry, or a
 *  future caller of the rename plumbing skipping the app's own pre-rename
 *  collision guard), pushing would silently overwrite it — no local diff,
 *  no conflict, nothing for validateForCommit to see. Guard it here too. */
export function findRenameCollision(
  pushable: readonly EntryRecord[],
  remotePaths: ReadonlySet<string>,
): string | null {
  const collision = pushable.find(
    (entry) =>
      !entry.deleted &&
      entry.renamedFrom !== null &&
      entry.baseSha === null &&
      remotePaths.has(entry.path),
  );
  return collision ? collision.path : null;
}

/** Uploads the blobs this push needs and assembles its tree changes: entry
 *  edits/deletions plus outbox assets, minus deletions of paths the remote
 *  tree doesn't have (see dropDeletionsOfMissingPaths). */
export async function buildCommitChanges(
  deps: SyncDeps,
  pushable: readonly EntryRecord[],
  conflictPaths: ReadonlySet<string>,
  remotePaths: ReadonlySet<string>,
) {
  const blobShas = await createEntryBlobs(deps, pushable);
  const changesByPath = buildEntryChanges(pushable, blobShas, conflictPaths);
  const { uploadAssets, assets } = await collectPushAssets(deps, pushable);
  for (const change of await createAssetChanges(deps, uploadAssets)) {
    changesByPath.set(change.path, change);
  }
  dropDeletionsOfMissingPaths(changesByPath, remotePaths);
  return { blobShas, changesByPath, assets };
}
