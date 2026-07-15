// ABOUTME: Tests for GitHubApi.getBlob and getBlobText — base64 (with
// ABOUTME: embedded newlines) to bytes/UTF-8 text, and protocol-error paths.

import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "./base64";
import { buildApi, createFetchStub, HTTP_OK, jsonResponse, wrapBase64 } from "./testHelpers";

describe("GitHubApi.getBlob / getBlobText: decoding", () => {
  const text = "---\ntitle: Hello World\ndate: 2026-07-15\n---\n\nBody text.\n";

  it("decodes base64 blob content (with embedded newlines) to bytes", async () => {
    const wrapped = wrapBase64(bytesToBase64(new TextEncoder().encode(text)));
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_OK, {
        sha: "blob-sha-1",
        nodeId: "B_kwDOAbc123",
        size: text.length,
        url: "https://api.github.com/x",
        content: wrapped,
        encoding: "base64",
      }),
    );

    const bytes = await buildApi(fetchImpl).getBlob("blob-sha-1");

    expect(bytes).toEqual(new TextEncoder().encode(text));
  });

  it("getBlobText decodes UTF-8 text including multi-byte characters", async () => {
    const unicodeText = "Title: café ☕ — a linkblog post\n";
    const wrapped = wrapBase64(bytesToBase64(new TextEncoder().encode(unicodeText)));
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_OK, {
        sha: "x",
        size: unicodeText.length,
        content: wrapped,
        encoding: "base64",
      }),
    );

    const result = await buildApi(fetchImpl).getBlobText("x");

    expect(result).toBe(unicodeText);
  });
});

describe("GitHubApi.getBlob / getBlobText: errors", () => {
  it("requests the correct URL", async () => {
    let seenUrl = "";
    const fetchImpl = createFetchStub((url) => {
      seenUrl = url;
      return jsonResponse(HTTP_OK, { sha: "x", content: "", encoding: "base64" });
    });
    await buildApi(fetchImpl).getBlob("deadbeef");
    expect(seenUrl).toBe("https://api.github.com/repos/obra/blog/git/blobs/deadbeef");
  });

  it("throws protocol when blob encoding is not base64", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_OK, { sha: "x", content: "plain text", encoding: "utf-8" }),
    );
    await expect(buildApi(fetchImpl).getBlob("x")).rejects.toMatchObject({ kind: "protocol" });
  });

  it("wraps a malformed base64 payload as protocol", async () => {
    const fetchImpl = createFetchStub(() =>
      jsonResponse(HTTP_OK, { sha: "x", content: "!!!not-base64!!!", encoding: "base64" }),
    );
    await expect(buildApi(fetchImpl).getBlob("x")).rejects.toMatchObject({ kind: "protocol" });
  });
});
