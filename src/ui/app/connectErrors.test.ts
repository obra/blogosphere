// ABOUTME: describeConnectError — what the connect card and Settings say when a
// ABOUTME: token can't be connected, for the errors the real GitHub client raises.
import { expect, it } from "vitest";
import { ConnectError } from "../../bootstrap/connect";
import {
  buildApi,
  createFetchStub,
  jsonResponse,
  rejectingFetch,
} from "../../core/github/testHelpers";
import { describeConnectError } from "./connectErrors";

/** What getRef actually throws for a response (or a failed fetch). */
function getRefError(fetchImpl: typeof fetch): Promise<unknown> {
  return buildApi(fetchImpl)
    .getRef()
    .then(
      () => new Error("expected getRef to fail"),
      (error: unknown) => error,
    );
}

it("GitHub refusing the token", async () => {
  const error = await getRefError(
    createFetchStub(() => jsonResponse(401, { message: "Bad credentials" })),
  );
  expect(describeConnectError(error)).toBe(
    "GitHub rejected that token. Check that it has read and write access to the blog repository's contents.",
  );
});

it("a token that can't see the repository", async () => {
  const error = await getRefError(
    createFetchStub(() => jsonResponse(404, { message: "Not Found" })),
  );
  expect(describeConnectError(error)).toBe(
    "That token can't see the blog repository. Give it access to that repository and try again.",
  );
});

it("GitHub's rate limit", async () => {
  const error = await getRefError(
    createFetchStub(() =>
      jsonResponse(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0" }),
    ),
  );
  expect(describeConnectError(error)).toBe(
    "GitHub is limiting requests right now. Try again in a few minutes.",
  );
});

it("GitHub out of reach", async () => {
  const error = await getRefError(rejectingFetch(new TypeError("Load failed")));
  expect(describeConnectError(error)).toBe(
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
