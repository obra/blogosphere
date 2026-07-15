// ABOUTME: Tests for GitHubApi.updateRef — fast-forward updates, the
// ABOUTME: not-fast-forward compare-and-swap path, and standard error mapping.

import { describe, expect, it } from "vitest";
import {
  buildApi,
  createFetchStub,
  HTTP_OK,
  HTTP_UNAUTHORIZED,
  HTTP_UNPROCESSABLE_ENTITY,
  jsonResponse,
  readJsonBody,
} from "./testHelpers";
import { GitHubError } from "./types";

const NEW_SHA = "commit-sha-2";

describe("GitHubApi.updateRef", () => {
  it("fast-forwards the ref and returns the new sha", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: unknown;
    const fetchImpl = createFetchStub((url, init) => {
      capturedUrl = url;
      capturedMethod = init.method ?? "";
      capturedBody = readJsonBody(init);
      return jsonResponse(HTTP_OK, {
        ref: "refs/heads/main",
        object: { type: "commit", sha: NEW_SHA, url: "https://api.github.com/x" },
      });
    });

    const result = await buildApi(fetchImpl).updateRef(NEW_SHA);

    expect(result).toEqual({ ok: true, newSha: NEW_SHA });
    expect(capturedUrl).toBe("https://api.github.com/repos/obra/blog/git/refs/heads/main");
    expect(capturedMethod).toBe("PATCH");
    expect(capturedBody).toEqual({ sha: NEW_SHA, force: false });
  });

  it("returns not-fast-forward on a 422 rejection instead of throwing", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_UNPROCESSABLE_ENTITY, {
        message: "Update is not a fast forward",
        documentationUrl: "https://docs.github.com/x",
      }),
    );

    const result = await buildApi(fetchImpl).updateRef("attempted-sha");

    expect(result).toEqual({ ok: false, reason: "not-fast-forward" });
  });

  it("still throws for a 422 that is not a fast-forward rejection", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_UNPROCESSABLE_ENTITY, { message: "Object does not exist" }),
    );

    await expect(buildApi(fetchImpl).updateRef("attempted-sha")).rejects.toThrow(GitHubError);
  });

  it("maps a non-422 failure (e.g. auth) through the standard error path", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_UNAUTHORIZED, { message: "Bad credentials" }),
    );

    await expect(buildApi(fetchImpl).updateRef("attempted-sha")).rejects.toMatchObject({
      kind: "auth",
    });
  });
});
