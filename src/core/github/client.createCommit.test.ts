// ABOUTME: Tests for GitHubApi.createCommit — creates a commit from a tree
// ABOUTME: sha, parent shas, and a message; returns the new commit sha.

import { describe, expect, it } from "vitest";
import { buildApi, createFetchStub, HTTP_CREATED, jsonResponse, readJsonBody } from "./testHelpers";

const TREE_SHA = "tree-sha-2";
const PARENT_SHA = "commit-sha-1";
const NEW_COMMIT_SHA = "commit-sha-2";

describe("GitHubApi.createCommit", () => {
  it("creates a commit from tree + parents + message", async () => {
    let capturedBody: unknown;
    const fetchImpl = createFetchStub((_url, init) => {
      capturedBody = readJsonBody(init);
      return jsonResponse(HTTP_CREATED, { sha: NEW_COMMIT_SHA });
    });

    const sha = await buildApi(fetchImpl).createCommit({
      treeSha: TREE_SHA,
      parents: [PARENT_SHA],
      message: "Post: A new post",
    });

    expect(sha).toBe(NEW_COMMIT_SHA);
    expect(capturedBody).toEqual({
      message: "Post: A new post",
      tree: TREE_SHA,
      parents: [PARENT_SHA],
    });
  });
});
