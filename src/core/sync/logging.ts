// ABOUTME: Sync activity-log channel + the result→log-line derivations, split
// ABOUTME: from engine.ts purely for the line cap. One entry per outcome.
import type {
  ConflictResolution,
  PullResult,
  PushResult,
  SyncDeps,
  SyncLogEntry,
  SyncLogLevel,
} from "./types";

type LogFn = (level: SyncLogLevel, message: string, detail?: string) => void;

const SHORT_SHA_LENGTH = 7;

function createLogChannel(deps: SyncDeps) {
  const listeners = new Set<(entry: SyncLogEntry) => void>();
  const log: LogFn = (level, message, detail) => {
    const entry: SyncLogEntry =
      detail === undefined
        ? { at: deps.now(), level, message }
        : { at: deps.now(), level, message, detail };
    for (const listener of listeners) {
      listener(entry);
    }
  };
  return {
    log,
    subscribe: (cb: (entry: SyncLogEntry) => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

function logPullResult(log: LogFn, result: PullResult): void {
  if (result.updated.length > 0) {
    log("info", `Pulled ${result.updated.length} update(s) from GitHub`, result.updated.join("\n"));
  }
  if (result.merged.length > 0) {
    log(
      "info",
      `Auto-merged ${result.merged.length} entr${result.merged.length === 1 ? "y" : "ies"} with remote changes`,
      result.merged.join("\n"),
    );
  }
  for (const path of result.conflicts) {
    log("warn", `Conflict: ${path} changed both here and on GitHub — needs resolving`);
  }
  if (result.updated.length + result.merged.length + result.conflicts.length === 0) {
    log("info", "Checked GitHub — no remote changes");
  }
}

function logPushResult(log: LogFn, result: PushResult, errorMessage?: string): void {
  for (const skip of result.skipped) {
    log("error", `Won't push ${skip.path}: ${skip.reason}`);
  }
  if (result.committed) {
    const sha = result.commitSha ? ` (commit ${result.commitSha.slice(0, SHORT_SHA_LENGTH)})` : "";
    log(
      "info",
      `Pushed ${result.pushed.length} change${result.pushed.length === 1 ? "" : "s"} to GitHub${sha}`,
      result.pushed.join("\n"),
    );
    return;
  }
  if (errorMessage !== undefined) {
    log("error", errorMessage);
  } else if (result.skipped.length === 0) {
    log("info", "Nothing to push");
  }
}

function describeResolution(resolution: ConflictResolution): string {
  if (resolution.choose === "mine") {
    return "kept this device's version";
  }
  if (resolution.choose === "theirs") {
    return "kept GitHub's version";
  }
  return "kept a hand-merged version";
}

export type { LogFn };
export { createLogChannel, describeResolution, logPullResult, logPushResult };
