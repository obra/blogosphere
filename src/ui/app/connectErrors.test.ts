// ABOUTME: describeConnectError — what the connect card and Settings say when a
// ABOUTME: token can't be connected.
import { expect, it } from "vitest";
import { ConnectError } from "../../bootstrap/connect";
import { GitHubError } from "../../core/github/types";
import { describeConnectError } from "./connectErrors";

it("GitHub refusing the token", () => {
  expect(describeConnectError(new GitHubError("auth", "401 Bad credentials"))).toContain(
    "GitHub rejected that token",
  );
});

it("GitHub out of reach", () => {
  expect(describeConnectError(new GitHubError("network", "Failed to fetch"))).toBe(
    "Couldn't reach GitHub. Check your connection and try again.",
  );
});

it("the keychain refusing it", () => {
  expect(describeConnectError(new ConnectError("keychain"))).toBe(
    "GitHub accepted the token, but it couldn't be saved to the keychain. Try again.",
  );
});

it("a token already being checked", () => {
  expect(describeConnectError(new ConnectError("inFlight"))).toBe(
    "Still checking the last token. Try again in a moment.",
  );
});

it("anything else", () => {
  expect(describeConnectError(new Error("??"))).toBe(
    "Connecting failed. Check the token and try again.",
  );
});
