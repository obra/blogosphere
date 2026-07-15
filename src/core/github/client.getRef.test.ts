// ABOUTME: Tests for GitHubApi.getRef — resolves refs/heads/{branch} to a
// ABOUTME: commit sha, tolerates extra response fields, rejects a missing sha.

import { describe, expect, it } from "vitest";
import { buildApi, createFetchStub, HTTP_OK, jsonResponse } from "./testHelpers";

const REF_COMMIT_SHA = "commit-sha-1";

describe("GitHubApi.getRef", () => {
  it("resolves refs/heads/{branch} to a commit sha", async () => {
    let seenUrl = "";
    let seenMethod = "";
    let seenHeaders = new Headers();
    const fetchImpl = createFetchStub((url, init) => {
      seenUrl = url;
      seenMethod = init.method ?? "";
      seenHeaders = new Headers(init.headers);
      return jsonResponse(HTTP_OK, {
        ref: "refs/heads/main",
        nodeId: "REF_kwDOAbc123",
        url: "https://api.github.com/x",
        object: { type: "commit", sha: REF_COMMIT_SHA, url: "https://api.github.com/x" },
      });
    });

    const sha = await buildApi(fetchImpl).getRef();

    expect(sha).toBe(REF_COMMIT_SHA);
    expect(seenUrl).toBe("https://api.github.com/repos/obra/blog/git/ref/heads/main");
    expect(seenMethod).toBe("GET");
    expect(seenHeaders.get("authorization")).toBe("Bearer ghp_test_token_123");
    expect(seenHeaders.get("accept")).toBe("application/vnd.github+json");
    expect(seenHeaders.get("x-github-api-version")).toBe("2022-11-28");
    expect(seenHeaders.get("content-type")).toBeNull();
  });

  it("throws protocol when object.sha is missing from the response", async () => {
    const fetchImpl = createFetchStub(() => jsonResponse(HTTP_OK, { ref: "refs/heads/main" }));
    await expect(buildApi(fetchImpl).getRef()).rejects.toMatchObject({
      name: "GitHubError",
      kind: "protocol",
    });
  });
});
