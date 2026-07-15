// ABOUTME: Tests for GitHubApi.createBlob — string content goes utf-8, byte
// ABOUTME: content goes base64 (chunked), and a missing sha in the response throws.

import { describe, expect, it } from "vitest";
import { base64ToBytes } from "./base64";
import {
  buildApi,
  createFetchStub,
  HTTP_CREATED,
  jsonResponse,
  readJsonBody,
  sequentialBytes,
} from "./testHelpers";

const CHUNK_TEST_BYTE_COUNT = 500;

describe("GitHubApi.createBlob", () => {
  it("sends string content with utf-8 encoding", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders = new Headers();
    let capturedBody: unknown;
    const fetchImpl = createFetchStub((url, init) => {
      capturedUrl = url;
      capturedMethod = init.method ?? "";
      capturedHeaders = new Headers(init.headers);
      capturedBody = readJsonBody(init);
      return jsonResponse(HTTP_CREATED, { sha: "blob-sha-1" });
    });

    const sha = await buildApi(fetchImpl).createBlob("---\ntitle: Test\n---\n");

    expect(sha).toBe("blob-sha-1");
    expect(capturedUrl).toBe("https://api.github.com/repos/obra/blog/git/blobs");
    expect(capturedMethod).toBe("POST");
    expect(capturedHeaders.get("content-type")).toBe("application/json");
    expect(capturedBody).toEqual({ content: "---\ntitle: Test\n---\n", encoding: "utf-8" });
  });

  it("base64-encodes Uint8Array content, chunked, without corruption", async () => {
    const bytes = sequentialBytes(CHUNK_TEST_BYTE_COUNT);
    let capturedBody: unknown;
    const fetchImpl = createFetchStub((_url, init) => {
      capturedBody = readJsonBody(init);
      return jsonResponse(HTTP_CREATED, { sha: "blob-sha-2" });
    });

    const sha = await buildApi(fetchImpl).createBlob(bytes);

    expect(sha).toBe("blob-sha-2");
    const body = capturedBody as { content: string; encoding: string };
    expect(body.encoding).toBe("base64");
    expect(base64ToBytes(body.content)).toEqual(bytes);
  });

  it("throws protocol when the response is missing sha", async () => {
    const fetchImpl = createFetchStub(() => jsonResponse(HTTP_CREATED, {}));
    await expect(buildApi(fetchImpl).createBlob("x")).rejects.toMatchObject({
      kind: "protocol",
    });
  });
});
