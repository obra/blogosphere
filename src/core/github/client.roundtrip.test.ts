// ABOUTME: Round-trip test for GitHubApi.createBlob -> getBlob on a >100KB
// ABOUTME: random buffer, proving the chunked base64 codec never corrupts data.

import { describe, expect, it } from "vitest";
import {
  buildApi,
  createFetchStub,
  HTTP_CREATED,
  HTTP_NOT_FOUND,
  HTTP_OK,
  jsonResponse,
  randomBytes,
  readJsonBody,
  wrapBase64,
} from "./testHelpers";

const LARGE_BLOB_BYTE_COUNT = 150_000;
const MIN_ROUND_TRIP_BYTES = 100_000;
const BLOB_SHA_FROM_URL = /\/git\/blobs\/([^/]+)$/;

describe("GitHubApi.binary blob round-trip", () => {
  it("round-trips a >100KB random buffer through createBlob and getBlob", async () => {
    const original = randomBytes(LARGE_BLOB_BYTE_COUNT);
    const blobs = new Map<string, string>();
    let nextId = 0;

    const fetchImpl = createFetchStub((url, init) => {
      if (url.endsWith("/git/blobs") && init.method === "POST") {
        const body = readJsonBody(init) as { content: string; encoding: string };
        expect(body.encoding).toBe("base64");
        const sha = `blob-sha-${nextId}`;
        nextId += 1;
        blobs.set(sha, body.content);
        return jsonResponse(HTTP_CREATED, { sha });
      }
      const match = BLOB_SHA_FROM_URL.exec(url);
      if (match && init.method === "GET") {
        const sha = match[1] ?? "";
        const stored = blobs.get(sha);
        if (stored === undefined) {
          return jsonResponse(HTTP_NOT_FOUND, { message: "Not Found" });
        }
        return jsonResponse(HTTP_OK, {
          sha,
          size: stored.length,
          content: wrapBase64(stored),
          encoding: "base64",
        });
      }
      throw new Error(`Unhandled request in test stub: ${init.method ?? "GET"} ${url}`);
    });

    const api = buildApi(fetchImpl);
    const sha = await api.createBlob(original);
    const roundTripped = await api.getBlob(sha);

    expect(roundTripped.length).toBeGreaterThan(MIN_ROUND_TRIP_BYTES);
    expect(roundTripped).toEqual(original);
  });
});
