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
  recordRemoteHead,
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
import type { PushResult, PushSkip, SyncDeps } from "./types";

const MAX_ATTEMPTS = 3;

/** Splits dirty entries into pushable and validation-skipped. A skipped entry
 *  stays dirty and is reported (log + result), but must never block the rest
 *  of the queue — one malformed file holding the whole blog hostage is worse
 *  than pushing around it. Deletions carry no content to validate. */
function partitionByValidation(
  deps: SyncDeps,
  entries: readonly EntryRecord[],
): { pushable: EntryRecord[]; skipped: PushSkip[] } {
  const pushable: EntryRecord[] = [];
  const skipped: PushSkip[] = [];
  for (const entry of entries) {
    const errors = entry.deleted
      ? []
      : deps.model
          .validateForCommit(entry.path, entry.workingContent)
          .filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      skipped.push({ path: entry.path, reason: errors.map((issue) => issue.message).join("; ") });
    } else {
      pushable.push(entry);
    }
  }
  return { pushable, skipped };
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

interface AttemptArgs {
  pushable: readonly EntryRecord[];
  skipped: PushSkip[];
  retries: number;
  conflictPaths: ReadonlySet<string>;
}

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

async function attemptCommit(deps: SyncDeps, args: AttemptArgs): Promise<PushOutcome> {
  const { pushable, skipped, retries, conflictPaths } = args;
  const headSha = await deps.github.getRef();
  const commit = await deps.github.getCommit(headSha);

  const renameCollision = await findRenameCollision(deps, pushable, commit.treeSha);
  if (renameCollision !== null) {
    return {
      committed: false,
      retries,
      conflicts: [...conflictPaths],
      pushed: [],
      skipped,
      errorMessage: `Refusing to push: "${renameCollision}" already has different content on the remote that this rename/publish doesn't know about. Rename the entry to a different date or title and try again.`,
    };
  }

  const blobShas = await createEntryBlobs(deps, pushable);
  const changesByPath = buildEntryChanges(pushable, blobShas, conflictPaths);
  const { uploadAssets, assets } = await collectPushAssets(deps, pushable);
  for (const change of await createAssetChanges(deps, uploadAssets)) {
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
    return { committed: false, retries, conflicts: [...conflictPaths], pushed: [], skipped };
  }

  const now = deps.now();
  await applySuccessfulPush(deps, { pushable, blobShas, assets, now });
  await deps.store.setMeta(META_LAST_ROOT_TREE_SHA, newTreeSha);
  await deps.store.setMeta(META_LAST_REMOTE_COMMIT_SHA, commitSha);
  await deps.store.setMeta(META_LAST_SYNC_AT, String(now));
  // Our own commit is integrated history now — a later pull served this sha's
  // PARENT by a lagging replica must be recognized as stale, not a deletion.
  await recordRemoteHead(deps.store, commitSha);

  return {
    committed: true,
    commitSha,
    retries,
    conflicts: [...conflictPaths],
    pushed: pushable.map((entry) => entry.path),
    skipped,
  };
}

/** Nothing dirty at all is a normal quiet round; everything-skipped means the
 *  user's pending work is stuck and deserves the error state. */
function nothingPushableOutcome(
  retries: number,
  conflictPaths: ReadonlySet<string>,
  skipped: PushSkip[],
): PushOutcome {
  return {
    committed: false,
    retries,
    conflicts: [...conflictPaths],
    pushed: [],
    skipped,
    ...(skipped.length > 0
      ? {
          errorMessage: `${skipped.length} pending ${skipped.length === 1 ? "change" : "changes"} failed validation and can't be pushed — see the activity log.`,
        }
      : {}),
  };
}

export function toPushResult(outcome: PushOutcome): PushResult {
  const base: PushResult = {
    committed: outcome.committed,
    retries: outcome.retries,
    conflicts: outcome.conflicts,
    pushed: outcome.pushed,
    skipped: outcome.skipped,
  };
  return outcome.commitSha === undefined ? base : { ...base, commitSha: outcome.commitSha };
}

export async function runPush(deps: SyncDeps): Promise<PushOutcome> {
  let retries = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: CAS retries are inherently sequential.
    await runPull(deps);

    const conflictPaths = new Set(await getConflictPaths(deps.store));
    const candidates = computePushable(await deps.store.listDirty(), conflictPaths);
    const { pushable, skipped } = partitionByValidation(deps, candidates);

    if (pushable.length === 0) {
      return nothingPushableOutcome(retries, conflictPaths, skipped);
    }

    const result = await attemptCommit(deps, { pushable, skipped, retries, conflictPaths });
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
    pushed: [],
    skipped: [],
    errorMessage: "Push failed after 3 CAS retries; the remote kept moving under us.",
  };
}

export type { PushOutcome };
