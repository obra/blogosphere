// ABOUTME: watchDeploy — follows the GitHub Actions run for a just-pushed
// ABOUTME: commit and reports "live on the site" (or a failed build) through
// ABOUTME: the activity log. Wired from attachSync's log subscription.
import type { WorkflowRun } from "../../core/github/types";
import { GitHubError } from "../../core/github/types";
import type { SyncLogEntry } from "../../core/sync/types";
import type { ActionCtx } from "./state.types";
import { SYNC_LOG_CAP } from "./state.types";

/** Poll cadence and overall budget: check roughly every 10s, give up after
 *  roughly 4 minutes (a stuck/slow Pages build shouldn't poll forever). */
const POLL_INTERVAL_MS = 10_000;
const TIMEOUT_MS = 240_000;
const MAX_ATTEMPTS = Math.ceil(TIMEOUT_MS / POLL_INTERVAL_MS);

type WaitFn = (ms: number) => Promise<void>;

function realWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Swapped out in tests so the full poll loop runs without real delays —
 *  see resetDeployWatchForTests. */
let wait: WaitFn = realWait;

/** Shas currently being polled — a second watchDeploy for a sha already
 *  in flight is a no-op (checked synchronously before the first await). */
const activeWatches = new Set<string>();

/** Sticky for the app session once a poll fails with an auth error: never
 *  re-warn, never re-poll, on any later push. Module-level because ActionCtx
 *  (the only thing this action can thread state through) has no per-session
 *  bag of its own — see the feature C contract. */
let deployWatchDisabled = false;

function appendLog(ctx: ActionCtx, entry: Omit<SyncLogEntry, "at">): void {
  const full: SyncLogEntry = { at: ctx.deps.now(), ...entry };
  ctx.set((state) => ({ syncLog: [...state.syncLog, full].slice(-SYNC_LOG_CAP) }));
}

function isAuthError(error: unknown): boolean {
  return error instanceof GitHubError && error.kind === "auth";
}

/** An auth error means this token can't watch deploys — log it once (ever)
 *  and stop. Only auth qualifies: any other failure (a network blip, a 5xx)
 *  says nothing about the token's scopes, and disabling on it would falsely
 *  and permanently blame the token for a transient hiccup. */
function disableDeployWatch(ctx: ActionCtx): void {
  if (deployWatchDisabled) {
    return;
  }
  deployWatchDisabled = true;
  appendLog(ctx, {
    level: "info",
    message:
      "Deploy status is off: the token can't read GitHub Actions. Publishing still works — add the Actions read permission to see deploy progress.",
  });
}

function findConcludedRun(runs: WorkflowRun[]): WorkflowRun | null {
  return runs.find((run) => run.status === "completed" && run.conclusion !== null) ?? null;
}

function reportConcludedRun(ctx: ActionCtx, run: WorkflowRun): void {
  if (run.conclusion === "success") {
    appendLog(ctx, { level: "info", message: "Live on blog.fsck.com ✓", detail: run.htmlUrl });
    ctx.get().addToast({ tone: "success", message: "Live on blog.fsck.com" });
    return;
  }
  appendLog(ctx, {
    level: "error",
    message: "Deploy failed — the site still shows the previous version",
    detail: run.htmlUrl,
  });
}

/** The poll budget ran out — two very different stories: a run was found and
 *  is just slow (point at it; its outcome is unknowable from here), or no
 *  run ever showed up for this sha at all. */
function reportTimeout(ctx: ActionCtx, lastSeenRun: WorkflowRun | null): void {
  if (lastSeenRun) {
    appendLog(ctx, {
      level: "info",
      message: "Deploy is still running — check the run on GitHub for the result",
      detail: lastSeenRun.htmlUrl,
    });
    return;
  }
  appendLog(ctx, { level: "info", message: "Couldn't find a deploy for this push" });
}

async function watchDeploy(ctx: ActionCtx, commitSha: string): Promise<void> {
  if (deployWatchDisabled || activeWatches.has(commitSha)) {
    return;
  }
  const { github } = ctx.get().services;
  if (!github) {
    return;
  }
  activeWatches.add(commitSha);
  try {
    let lastSeenRun: WorkflowRun | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let runs: WorkflowRun[];
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each poll depends on the previous one's outcome (and the wait between them) — inherently sequential, not parallelizable.
        runs = await github.listWorkflowRunsForSha(commitSha);
      } catch (error) {
        if (isAuthError(error)) {
          disableDeployWatch(ctx);
          return;
        }
        runs = []; // transient miss (network blip, 5xx) — keep polling
      }
      lastSeenRun = runs[0] ?? lastSeenRun;
      const concluded = findConcludedRun(runs);
      if (concluded) {
        reportConcludedRun(ctx, concluded);
        return;
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        await wait(POLL_INTERVAL_MS);
      }
    }
    reportTimeout(ctx, lastSeenRun);
  } finally {
    activeWatches.delete(commitSha);
  }
}

/** Test-only: clear dedupe/auth-warning state and optionally swap the wait
 *  function so the full poll loop runs without real delays. */
function resetDeployWatchForTests(overrides: { wait?: WaitFn } = {}): void {
  activeWatches.clear();
  deployWatchDisabled = false;
  wait = overrides.wait ?? realWait;
}

export { resetDeployWatchForTests, watchDeploy };
