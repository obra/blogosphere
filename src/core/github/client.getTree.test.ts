// ABOUTME: Tests for GitHubApi.getTreeRecursive — parses a mixed tree/blob
// ABOUTME: listing (tolerating extra fields), rejects truncation and bad modes.

import { describe, expect, it } from "vitest";
import { buildApi, createFetchStub, HTTP_OK, jsonResponse } from "./testHelpers";

const ROOT_TREE_SHA = "tree-sha-1";
const DIR_SHA = "tree-sha-2";
const BLOG_POST_SHA = "blob-sha-1";
const BLOG_POST_BYTE_SIZE = 1234;

describe("GitHubApi.getTreeRecursive: parses", () => {
  it("parses a realistic mixed tree/blob listing", async () => {
    const fetchImpl = createFetchStub((url) => {
      expect(url).toBe(
        `https://api.github.com/repos/obra/blog/git/trees/${ROOT_TREE_SHA}?recursive=1`,
      );
      return jsonResponse(HTTP_OK, {
        sha: ROOT_TREE_SHA,
        url: "https://api.github.com/x",
        tree: [
          {
            path: "content",
            mode: "040000",
            type: "tree",
            sha: DIR_SHA,
            url: "https://api.github.com/x",
          },
          {
            path: "content/blog/2026/2026-07-15-post.md",
            mode: "100644",
            type: "blob",
            sha: BLOG_POST_SHA,
            size: BLOG_POST_BYTE_SIZE,
            url: "https://api.github.com/x",
          },
        ],
        truncated: false,
      });
    });

    const entries = await buildApi(fetchImpl).getTreeRecursive(ROOT_TREE_SHA);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ path: "content", mode: "040000", type: "tree", sha: DIR_SHA });
    expect(entries[0]).not.toHaveProperty("size");
    expect(entries[1]).toEqual({
      path: "content/blog/2026/2026-07-15-post.md",
      mode: "100644",
      type: "blob",
      sha: BLOG_POST_SHA,
      size: BLOG_POST_BYTE_SIZE,
    });
  });
});

describe("GitHubApi.getTreeRecursive: rejects malformed trees", () => {
  it("throws protocol when GitHub truncates the recursive listing", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_OK, { sha: "x", url: "y", tree: [], truncated: true }),
    );
    await expect(buildApi(fetchImpl).getTreeRecursive("x")).rejects.toMatchObject({
      name: "GitHubError",
      kind: "protocol",
    });
  });

  it("throws protocol when an entry has an unrecognized mode", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_OK, {
        tree: [{ path: "x", mode: "999999", type: "blob", sha: "s" }],
        truncated: false,
      }),
    );
    await expect(buildApi(fetchImpl).getTreeRecursive("x")).rejects.toMatchObject({
      kind: "protocol",
    });
  });
});
