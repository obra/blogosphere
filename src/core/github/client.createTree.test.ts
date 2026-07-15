// ABOUTME: Tests for GitHubApi.createTree — builds a tree from base_tree +
// ABOUTME: changes, including a deletion (null sha).

import { describe, expect, it } from "vitest";
import { buildApi, createFetchStub, HTTP_CREATED, jsonResponse, readJsonBody } from "./testHelpers";
import type { TreeChange } from "./types";

const BASE_TREE_SHA = "tree-sha-1";
const NEW_TREE_SHA = "tree-sha-2";
const POST_BLOB_SHA = "blob-sha-1";

describe("GitHubApi.createTree", () => {
  it("builds a tree from base_tree + changes, including a deletion", async () => {
    const changes: TreeChange[] = [
      { path: "content/blog/2026/2026-07-15-post.md", mode: "100644", sha: POST_BLOB_SHA },
      { path: "content/drafts/old-draft.md", mode: "100644", sha: null },
    ];
    let capturedUrl = "";
    let capturedBody: unknown;
    const fetchImpl = createFetchStub((url, init) => {
      capturedUrl = url;
      capturedBody = readJsonBody(init);
      return jsonResponse(HTTP_CREATED, { sha: NEW_TREE_SHA, tree: [] });
    });

    const sha = await buildApi(fetchImpl).createTree(BASE_TREE_SHA, changes);

    expect(sha).toBe(NEW_TREE_SHA);
    expect(capturedUrl).toBe("https://api.github.com/repos/obra/blog/git/trees");

    // Built via assignment (see client.ts) since GitHub's wire format requires
    // the literal snake_case key "base_tree", which isn't ours to rename.
    const expectedBody: Record<string, unknown> = {
      tree: [
        {
          path: "content/blog/2026/2026-07-15-post.md",
          mode: "100644",
          type: "blob",
          sha: POST_BLOB_SHA,
        },
        { path: "content/drafts/old-draft.md", mode: "100644", type: "blob", sha: null },
      ],
    };
    expectedBody.base_tree = BASE_TREE_SHA;
    expect(capturedBody).toEqual(expectedBody);
  });
});
