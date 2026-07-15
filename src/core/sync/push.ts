// ABOUTME: Core push logic — pull, validate, build blobs/tree/commit, and CAS
// ABOUTME: the ref, retrying (never forcing) up to 3 times on not-fast-forward races.
import type { TreeChange } from "../github/types";
import type { EntryRecord, OutboxAsset } from "../store/types";
import { SyncError } from "./errors";
import { buildCommitMessage } from "./messages";
import {
  getConflictPaths,
  loadCommitMessageTemplates,
  META_LAST_REMOTE_COMMIT_SHA,
  META_LAST_ROOT_TREE_SHA,
  META_LAST_SYNC_AT,
} from "./meta";
import { runPull } from "./pull";
import type { PushResult, SyncDeps } from "./types";

const MAX_ATTEMPTS = 3;

function requireBlobSha(blobShas: ReadonlyMap<string, string>, path: string): string {
  const sha = blobShas.get(path);
  if (sha === undefined) {
    throw new SyncError(`missing blob sha for ${path}`);
  }
  return sha;
}

function firstValidationFailure(
  deps: SyncDeps,
  entries: readonly EntryRecord[],
): { path: string; message: string } | null {
  for (const entry of entries) {
    if (!entry.deleted) {
      const issues = deps.model.validateForCommit(entry.path, entry.workingContent);
      const errors = issues.filter((issue) => issue.severity === "error");
      if (errors.length > 0) {
        return { path: entry.path, message: errors.map((issue) => issue.message).join("; ") };
      }
    }
  }
  return null;
}

async function createEntryBlobs(
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

function createAssetChanges(deps: SyncDeps, assets: readonly OutboxAsset[]): Promise<TreeChange[]> {
  return Promise.all(
    assets.map(async (asset): Promise<TreeChange> => {
      const bytes = await deps.readAsset(asset.localPath);
      const sha = await deps.github.createBlob(bytes);
      return { path: asset.repoPath, mode: "100644", sha };
    }),
  );
}

function buildEntryChanges(
  pushable: readonly EntryRecord[],
  blobShas: ReadonlyMap<string, string>,
): Map<string, TreeChange> {
  const changesByPath = new Map<string, TreeChange>();
  for (const entry of pushable) {
    changesByPath.set(entry.path, {
      path: entry.path,
      mode: "100644",
      sha: entry.deleted ? null : requireBlobSha(blobShas, entry.path),
    });
    if (entry.renamedFrom !== null) {
      changesByPath.set(entry.renamedFrom, { path: entry.renamedFrom, mode: "100644", sha: null });
    }
  }
  return changesByPath;
}

interface ApplyPushArgs {
  pushable: readonly EntryRecord[];
  blobShas: ReadonlyMap<string, string>;
  assets: readonly OutboxAsset[];
  now: number;
}

async function applySuccessfulPush(deps: SyncDeps, args: ApplyPushArgs): Promise<void> {
  const { pushable, blobShas, assets, now } = args;
  await Promise.all(
    pushable.map((entry) =>
      entry.deleted
        ? deps.store.removeEntry(entry.path)
        : deps.store.upsertEntry({
            ...entry,
            baseSha: requireBlobSha(blobShas, entry.path),
            baseContent: entry.workingContent,
            dirty: false,
            renamedFrom: null,
            updatedAt: now,
          }),
    ),
  );
  await Promise.all(assets.map((asset) => deps.store.removeAsset(asset.repoPath)));
}

/** push()'s public result, plus an internal-only failure message the engine's
 *  status wrapper turns into `state: "error"` before stripping it back off. */
interface PushOutcome extends PushResult {
  errorMessage?: string;
}

async function attemptCommit(
  deps: SyncDeps,
  pushable: readonly EntryRecord[],
  retries: number,
  conflictPaths: ReadonlySet<string>,
): Promise<PushOutcome> {
  const headSha = await deps.github.getRef();
  const commit = await deps.github.getCommit(headSha);

  const blobShas = await createEntryBlobs(deps, pushable);
  const changesByPath = buildEntryChanges(pushable, blobShas);

  const nonDeletedPaths = pushable.filter((entry) => !entry.deleted).map((entry) => entry.path);
  const assets = await deps.store.listAssetsFor(nonDeletedPaths);
  for (const change of await createAssetChanges(deps, assets)) {
    changesByPath.set(change.path, change);
  }

  const templates = await loadCommitMessageTemplates(deps.store);
  const message = buildCommitMessage(pushable, templates);

  const newTreeSha = await deps.github.createTree(commit.treeSha, [...changesByPath.values()]);
  const commitSha = await deps.github.createCommit({
    treeSha: newTreeSha,
    parents: [headSha],
    message,
  });
  const updateResult = await deps.github.updateRef(commitSha);

  if (!updateResult.ok) {
    return { committed: false, retries, conflicts: [...conflictPaths] };
  }

  const now = deps.now();
  await applySuccessfulPush(deps, { pushable, blobShas, assets, now });
  await deps.store.setMeta(META_LAST_ROOT_TREE_SHA, newTreeSha);
  await deps.store.setMeta(META_LAST_REMOTE_COMMIT_SHA, commitSha);
  await deps.store.setMeta(META_LAST_SYNC_AT, String(now));

  return { committed: true, commitSha, retries, conflicts: [...conflictPaths] };
}

export function toPushResult(outcome: PushOutcome): PushResult {
  const base: PushResult = {
    committed: outcome.committed,
    retries: outcome.retries,
    conflicts: outcome.conflicts,
  };
  return outcome.commitSha === undefined ? base : { ...base, commitSha: outcome.commitSha };
}

export async function runPush(deps: SyncDeps): Promise<PushOutcome> {
  let retries = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: CAS retries are inherently sequential.
    await runPull(deps);

    const conflictPaths = new Set(await getConflictPaths(deps.store));
    const pushable = (await deps.store.listDirty()).filter(
      (entry) => !conflictPaths.has(entry.path),
    );

    if (pushable.length === 0) {
      return { committed: false, retries, conflicts: [...conflictPaths] };
    }

    const failure = firstValidationFailure(deps, pushable);
    if (failure) {
      return {
        committed: false,
        retries,
        conflicts: [...conflictPaths],
        errorMessage: `Validation failed for ${failure.path}: ${failure.message}`,
      };
    }

    const result = await attemptCommit(deps, pushable, retries, conflictPaths);
    if (result.committed) {
      return result;
    }
    retries += 1;
  }

  return {
    committed: false,
    retries,
    conflicts: [...(await getConflictPaths(deps.store))],
    errorMessage: "Push failed after 3 CAS retries; the remote kept moving under us.",
  };
}

export type { PushOutcome };
