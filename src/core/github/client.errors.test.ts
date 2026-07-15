// ABOUTME: Tests for GitHubApi error mapping — every HTTP status branch and
// ABOUTME: every transport/parsing failure resolves to the right GitHubErrorKind.

import { describe, expect, it } from "vitest";
import {
  buildApi,
  createFetchStub,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_SERVER_ERROR,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAUTHORIZED,
  jsonResponse,
  rejectingFetch,
} from "./testHelpers";
import { GitHubError } from "./types";

const HTTP_BAD_GATEWAY = 502;

describe("GitHubApi.error mapping: 401 and 403", () => {
  it("maps 401 to auth", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_UNAUTHORIZED, { message: "Bad credentials" }),
    );
    await expect(buildApi(fetchImpl).getRef()).rejects.toMatchObject({
      name: "GitHubError",
      kind: "auth",
      status: HTTP_UNAUTHORIZED,
    });
  });

  it("maps 403 without rate-limit headers to auth", async () => {
    const fetchImpl = createFetchStub(() => jsonResponse(HTTP_FORBIDDEN, { message: "Forbidden" }));
    await expect(buildApi(fetchImpl).getCommit("x")).rejects.toMatchObject({
      kind: "auth",
      status: HTTP_FORBIDDEN,
    });
  });

  it("maps 403 with x-ratelimit-remaining: 0 to rate-limited", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(
        HTTP_FORBIDDEN,
        { message: "API rate limit exceeded" },
        { "x-ratelimit-remaining": "0" },
      ),
    );
    await expect(buildApi(fetchImpl).getTreeRecursive("x")).rejects.toMatchObject({
      kind: "rate-limited",
      status: HTTP_FORBIDDEN,
    });
  });

  it("does not treat a 403 with remaining quota as rate-limited", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_FORBIDDEN, { message: "Forbidden" }, { "x-ratelimit-remaining": "42" }),
    );
    await expect(buildApi(fetchImpl).getRef()).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("GitHubApi.error mapping: 404, 429, and 5xx", () => {
  it("maps 404 to not-found", async () => {
    const fetchImpl = createFetchStub(() => jsonResponse(HTTP_NOT_FOUND, { message: "Not Found" }));
    await expect(buildApi(fetchImpl).getBlob("missing-sha")).rejects.toMatchObject({
      kind: "not-found",
      status: HTTP_NOT_FOUND,
    });
  });

  it("maps 429 to rate-limited", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_TOO_MANY_REQUESTS, { message: "Too Many Requests" }),
    );
    await expect(buildApi(fetchImpl).createBlob("x")).rejects.toMatchObject({
      kind: "rate-limited",
      status: HTTP_TOO_MANY_REQUESTS,
    });
  });

  it("maps 500 to server", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_SERVER_ERROR, { message: "Internal Server Error" }),
    );
    await expect(buildApi(fetchImpl).createTree("x", [])).rejects.toMatchObject({
      kind: "server",
      status: HTTP_SERVER_ERROR,
    });
  });

  it("maps 503 to server", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_SERVICE_UNAVAILABLE, { message: "Service Unavailable" }),
    );
    await expect(
      buildApi(fetchImpl).createCommit({ treeSha: "x", parents: [], message: "m" }),
    ).rejects.toMatchObject({ kind: "server", status: HTTP_SERVICE_UNAVAILABLE });
  });
});

describe("GitHubApi.error mapping: transport and body parsing", () => {
  it("maps a fetch rejection to network", async () => {
    const fetchImpl = rejectingFetch(new TypeError("Failed to fetch"));
    await expect(buildApi(fetchImpl).getRef()).rejects.toMatchObject({ kind: "network" });
  });

  it("maps an aborted fetch to network", async () => {
    const fetchImpl = rejectingFetch(new DOMException("The operation was aborted.", "AbortError"));
    await expect(buildApi(fetchImpl).getCommit("x")).rejects.toMatchObject({ kind: "network" });
  });

  it("maps a malformed JSON success body to protocol", async () => {
    const fetchImpl = createFetchStub(() => new Response("not json{{{", { status: HTTP_OK }));
    await expect(buildApi(fetchImpl).getRef()).rejects.toMatchObject({ kind: "protocol" });
  });

  it("falls back to raw text / status text for a non-JSON error body", async () => {
    const fetchImpl = createFetchStub(
      () =>
        new Response("<html>Bad Gateway</html>", {
          status: HTTP_BAD_GATEWAY,
          statusText: "Bad Gateway",
        }),
    );
    await expect(buildApi(fetchImpl).getRef()).rejects.toMatchObject({
      kind: "server",
      status: HTTP_BAD_GATEWAY,
    });
  });

  it("every rejection is a GitHubError instance, never a raw error", async () => {
    const fetchImpl = rejectingFetch(new Error("boom"));
    await expect(buildApi(fetchImpl).getRef()).rejects.toBeInstanceOf(GitHubError);
  });
});
