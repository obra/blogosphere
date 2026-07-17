// ABOUTME: watchDeploy — follows the GitHub Actions run for a just-pushed
// ABOUTME: commit and reports "live on the site" (or a failed build) through
// ABOUTME: the activity log. Wired from attachSync's log subscription.
import type { ActionCtx } from "./state.types";

// CONTRACT STUB — implemented by the deploy-watch feature (see
// docs/superpowers/plans/2026-07-16-delight-pass-contracts.md, feature C).
// Requirements: poll services.github.listWorkflowRunsForSha(commitSha) on an
// interval until a run completes or a timeout passes; append entries to
// state.syncLog (same shape the engine emits) for "deploy started",
// "Live on blog.fsck.com ✓" (with the entry's htmlUrl as detail), and
// "Deploy failed"; swallow auth errors after logging ONE info line saying the
// token can't read Actions; never throw; dedupe concurrent watches per sha.
async function watchDeploy(_ctx: ActionCtx, _commitSha: string): Promise<void> {
  // Implemented by feature C.
}

export { watchDeploy };
