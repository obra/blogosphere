// ABOUTME: Tests for GitHubApi.getCommit — parses a realistic commit payload
// ABOUTME: (tolerating extra fields) into CommitInfo, and rejects bad parents.

import { describe, expect, it } from "vitest";
import { buildApi, createFetchStub, HTTP_OK, jsonResponse } from "./testHelpers";

const COMMIT_SHA = "commit-sha-1";
const TREE_SHA = "tree-sha-1";
const PARENT_SHA = "parent-sha-1";

describe("GitHubApi.getCommit", () => {
  it("parses a realistic commit payload into CommitInfo", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_OK, {
        sha: COMMIT_SHA,
        nodeId: "C_kwDOAbc123",
        url: "https://api.github.com/x",
        htmlUrl: "https://github.com/x",
        author: { name: "Jesse Vincent", email: "jesse@keyboard.io", date: "2026-07-15T12:00:00Z" },
        committer: {
          name: "Jesse Vincent",
          email: "jesse@keyboard.io",
          date: "2026-07-15T12:00:00Z",
        },
        tree: { sha: TREE_SHA, url: "https://api.github.com/x" },
        message: "Post: A new post",
        parents: [
          { sha: PARENT_SHA, url: "https://api.github.com/x", htmlUrl: "https://github.com/x" },
        ],
        verification: { verified: false, reason: "unsigned", signature: null, payload: null },
      }),
    );

    const commit = await buildApi(fetchImpl).getCommit(COMMIT_SHA);

    expect(commit).toEqual({
      sha: COMMIT_SHA,
      treeSha: TREE_SHA,
      parents: [PARENT_SHA],
      message: "Post: A new post",
    });
  });

  it("requests the correct URL", async () => {
    let seenUrl = "";
    const fetchImpl = createFetchStub((url) => {
      seenUrl = url;
      return jsonResponse(HTTP_OK, { sha: "s", tree: { sha: "t" }, parents: [], message: "m" });
    });
    await buildApi(fetchImpl).getCommit("deadbeef");
    expect(seenUrl).toBe("https://api.github.com/repos/obra/blog/git/commits/deadbeef");
  });

  it("throws protocol when a parent entry is missing sha", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_OK, { sha: "s", tree: { sha: "t" }, parents: [{}], message: "m" }),
    );
    await expect(buildApi(fetchImpl).getCommit("s")).rejects.toMatchObject({
      kind: "protocol",
    });
  });
});
