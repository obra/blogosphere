// ABOUTME: Core push logic — pull, validate, build blobs/tree/commit, and CAS
// ABOUTME: the ref, retrying (never forcing) up to 3 times on not-fast-forward races.
import type { EntryRecord, OutboxAsset } from "../store/types";
import { buildCommitMessage } from "./messages";
import {
  getConflictPaths,
  loadCommitMessageTemplates,
  META_LAST_REMOTE_COMMIT_SHA,
  META_LAST_ROOT_TREE_SHA,
  META_LAST_SYNC_AT,
} from "./meta";
import { runPull } from "./pull";
import {
  buildEntryChanges,
  computePushable,
  createAssetChanges,
  createEntryBlobs,
  findRenameCollision,
  requireBlobSha,
} from "./push.changes";
import type { PushResult, SyncDeps } from "./types";

const MAX_ATTEMPTS = 3;

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

interface ApplyPushArgs {
  pushable: readonly EntryRecord[];
  blobShas: ReadonlyMap<string, string>;
  assets: readonly OutboxAsset[];
  now: number;
}

/** Finalize one non-deleted pushed entry. If the store's *current* row for
 *  this path still matches the content snapshot this push actually sent
 *  (the overwhelmingly common case), mark it clean as before. If it
 *  doesn't — a debounced autosave durably committed a newer edit to the
 *  store while this entry's blob was in flight to GitHub — advance the base
 *  to what was actually pushed, but keep the row dirty with the newer
 *  content so the next push cycle picks up exactly the unsent delta instead
 *  of this write silently discarding it. */
async function finalizePushedEntry(
  deps: SyncDeps,
  entry: EntryRecord,
  blobShas: ReadonlyMap<string, string>,
  now: number,
): Promise<void> {
  const baseSha = requireBlobSha(blobShas, entry.path);
  const current = await deps.store.getEntry(entry.path);
  if (current === null) {
    // Row is already gone locally (e.g. removed by a concurrent flow) —
    // nothing left to reconcile.
    return;
  }
  if (current.workingContent !== entry.workingContent) {
    await deps.store.upsertEntry({
      ...current,
      baseSha,
      baseContent: entry.workingContent,
      dirty: true,
      renamedFrom: null,
      updatedAt: now,
    });
    return;
  }
  await deps.store.upsertEntry({
    ...entry,
    baseSha,
    baseContent: entry.workingContent,
    dirty: false,
    renamedFrom: null,
    updatedAt: now,
  });
}

async function applySuccessfulPush(deps: SyncDeps, args: ApplyPushArgs): Promise<void> {
  const { pushable, blobShas, assets, now } = args;
  await Promise.all(
    pushable.map((entry) =>
      entry.deleted
        ? deps.store.removeEntry(entry.path)
        : finalizePushedEntry(deps, entry, blobShas, now),
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

  const renameCollision = await findRenameCollision(deps, pushable, commit.treeSha);
  if (renameCollision !== null) {
    return {
      committed: false,
      retries,
      conflicts: [...conflictPaths],
      errorMessage: `Refusing to push: "${renameCollision}" already has different content on the remote that this rename/publish doesn't know about. Rename the entry to a different date or title and try again.`,
    };
  }

  const blobShas = await createEntryBlobs(deps, pushable);
  const changesByPath = buildEntryChanges(pushable, blobShas, conflictPaths);

  const nonDeletedPaths = pushable.filter((entry) => !entry.deleted).map((entry) => entry.path);
  const deletedPaths = pushable.filter((entry) => entry.deleted).map((entry) => entry.path);
  // Assets for a *deleted* entry must never be uploaded (there's no point
  // riding an image blob along with content that's about to disappear), but
  // their outbox rows still need to be swept up here — otherwise they're
  // never fetched by either the upload pass or the cleanup pass again, and
  // leak in local storage forever (see applySuccessfulPush's removeAsset).
  const uploadAssets = await deps.store.listAssetsFor(nonDeletedPaths);
  const orphanedAssets =
    deletedPaths.length === 0 ? [] : await deps.store.listAssetsFor(deletedPaths);
  for (const change of await createAssetChanges(deps, uploadAssets)) {
    changesByPath.set(change.path, change);
  }
  const assets = [...uploadAssets, ...orphanedAssets];

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
    const pushable = computePushable(await deps.store.listDirty(), conflictPaths);

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
    // A committed:false result with an errorMessage (e.g. the rename-
    // collision guard above) is fatal, not a CAS race — retrying would just
    // waste 3 round-trips and then overwrite this specific message with the
    // generic "kept moving under us" one below. Only the bare
    // updateResult.ok === false case (no errorMessage) is retry-worthy.
    if (result.committed || result.errorMessage !== undefined) {
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
