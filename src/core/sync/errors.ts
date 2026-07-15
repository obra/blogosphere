// ABOUTME: Local error type for sync-engine invariant violations that aren't
// ABOUTME: GitHub API failures — those are always a GitHubError from the github module.
export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncError";
  }
}
