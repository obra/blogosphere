// ABOUTME: Core push logic — pull, validate, build blobs/tree/commit, and CAS
// ABOUTME: the ref, retrying (never forcing) up to 3 times on not-fast-forward races.
import type { EntryRecord, OutboxAsset } from "../store/types";
import { buildCommitMessage } from "./messages";
import {
  getConflictPaths,
  loadCommitMessageTemplates,
  loadRecentHeads,
  META_LAST_REMOTE_COMMIT_SHA,
  META_LAST_ROOT_TREE_SHA,
  META_LAST_SYNC_AT,
  recordRemoteHead,
} from "./meta";
import { runPull } from "./pull";
import {
  buildCommitChanges,
  computePushable,
  findRenameCollision,
  loadRemotePathsIfNeeded,
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
 *  status wrapper turns into `state: "error"` before stripping it back off,
 *  and whether updateRef lost a CAS race (the only retry-worthy outcome). */
interface PushOutcome extends PushResult {
  errorMessage?: string;
  casRejected?: boolean;
}

interface AttemptArgs {
  pushable: readonly EntryRecord[];
  skipped: PushSkip[];
  retries: number;
  conflictPaths: ReadonlySet<string>;
}

/** The head to build the commit on. GitHub's read replicas can serve a head
 *  we've already integrated PAST (most often our own previous push's parent,
 *  seconds after that push). Building on it guarantees updateRef refuses
 *  (not fast-forward) — three retries against the same lagging replica then
 *  report "the remote kept moving under us" with no other writer anywhere.
 *  When the served head is one we've already moved past, build on the newest
 *  head this client has integrated instead: commit objects are permanent, so
 *  getCommit on it always works, and the CAS on updateRef still protects us
 *  if the remote genuinely advanced meanwhile. */
async function effectiveHead(deps: SyncDeps): Promise<string> {
  const fetched = await deps.github.getRef();
  const recent = await loadRecentHeads(deps.store);
  const latest = recent.at(-1);
  if (latest !== undefined && latest !== fetched && recent.includes(fetched)) {
    return latest;
  }
  return fetched;
}

/** An attempt that made no commit; `extra` says why when it matters. */
function notCommitted(args: AttemptArgs, extra: Partial<PushOutcome> = {}): PushOutcome {
  return {
    committed: false,
    retries: args.retries,
    conflicts: [...args.conflictPaths],
    pushed: [],
    skipped: args.skipped,
    ...extra,
  };
}

/** Local bookkeeping once updateRef accepted our commit: settle the pushed
 *  rows and assets, and remember the new remote head. */
async function recordLandedCommit(
  deps: SyncDeps,
  applied: ApplyPushArgs,
  landed: { treeSha: string; commitSha: string },
): Promise<void> {
  await applySuccessfulPush(deps, applied);
  await deps.store.setMeta(META_LAST_ROOT_TREE_SHA, landed.treeSha);
  await deps.store.setMeta(META_LAST_REMOTE_COMMIT_SHA, landed.commitSha);
  await deps.store.setMeta(META_LAST_SYNC_AT, String(applied.now));
  // Our own commit is integrated history now — a later pull served this sha's
  // PARENT by a lagging replica must be recognized as stale, not a deletion.
  await recordRemoteHead(deps.store, landed.commitSha);
}

async function attemptCommit(deps: SyncDeps, args: AttemptArgs): Promise<PushOutcome> {
  const { pushable, skipped, retries, conflictPaths } = args;
  const headSha = await effectiveHead(deps);
  const commit = await deps.github.getCommit(headSha);

  const remotePaths = await loadRemotePathsIfNeeded(deps, pushable, commit.treeSha);

  const renameCollision = findRenameCollision(pushable, remotePaths);
  if (renameCollision !== null) {
    return notCommitted(args, {
      errorMessage: `Refusing to push: "${renameCollision}" already has different content on the remote that this rename/publish doesn't know about. Rename the entry to a different date or title and try again.`,
    });
  }

  const { blobShas, changesByPath, assets } = await buildCommitChanges(
    deps,
    pushable,
    conflictPaths,
    remotePaths,
  );

  if (changesByPath.size === 0) {
    // Only tombstones for paths GitHub never had: nothing to commit, but the
    // local rows are done and must not sit dirty forever.
    await applySuccessfulPush(deps, { pushable, blobShas, assets, now: deps.now() });
    return notCommitted(args);
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
    return notCommitted(args, { casRejected: true });
  }

  const landed = { treeSha: newTreeSha, commitSha };
  await recordLandedCommit(deps, { pushable, blobShas, assets, now: deps.now() }, landed);

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
    // Only a lost CAS race is retry-worthy. Anything else — a commit, a fatal
    // guard like the rename-collision check, or a push that had nothing to
    // send GitHub — is final; retrying would waste round-trips and could
    // overwrite a specific message with the generic "kept moving" one below.
    if (result.casRejected !== true) {
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
