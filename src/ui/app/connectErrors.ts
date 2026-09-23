// ABOUTME: What to tell someone whose GitHub token couldn't be connected — shared
// ABOUTME: by the first-run connect card and Settings.
import { ConnectError } from "../../bootstrap/connect";
import { GitHubError, type GitHubErrorKind } from "../../core/github/types";

const BY_KIND: Partial<Record<GitHubErrorKind, string>> = {
  auth: "GitHub rejected that token. Check that it has read and write access to the blog repository's contents.",
  "not-found":
    "That token can't see the blog repository. Give it access to that repository and try again.",
  "rate-limited": "GitHub is limiting requests right now. Try again in a few minutes.",
  network: "Couldn't reach GitHub. Check your connection and try again.",
};

function describeConnectError(error: unknown): string {
  if (error instanceof ConnectError) {
    return error.kind === "keychain"
      ? "GitHub accepted the token, but it couldn't be saved to the keychain. Try again."
      : "Still checking the last token. Try again in a moment.";
  }
  const byKind = error instanceof GitHubError ? BY_KIND[error.kind] : undefined;
  return byKind ?? "Connecting failed. Check the token and try again.";
}

export { describeConnectError };
