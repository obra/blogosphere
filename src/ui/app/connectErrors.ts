// ABOUTME: What to tell someone whose GitHub token couldn't be connected — shared
// ABOUTME: by the first-run connect card and Settings.
import { ConnectError } from "../../bootstrap/connect";

const AUTH_ERROR_PATTERN = /401|403|auth/i;
const NETWORK_ERROR_PATTERN = /network|fetch|offline/i;

function describeConnectError(error: unknown): string {
  if (error instanceof ConnectError) {
    return error.kind === "keychain"
      ? "GitHub accepted the token, but it couldn't be saved to the keychain. Try again."
      : "Still checking the last token. Try again in a moment.";
  }
  const message = error instanceof Error ? error.message : "";
  if (AUTH_ERROR_PATTERN.test(message)) {
    return "GitHub rejected that token. Check that it has read and write access to the blog repository's contents.";
  }
  if (NETWORK_ERROR_PATTERN.test(message)) {
    return "Couldn't reach GitHub. Check your connection and try again.";
  }
  return "Connecting failed. Check the token and try again.";
}

export { describeConnectError };
