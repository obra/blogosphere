// ABOUTME: Shared fixtures for GitHub client tests — a stub fetchImpl builder,
// ABOUTME: byte-buffer generators, and HTTP status constants. Not a *.test.ts file.

import { createGitHubApi } from "./client";
import type { GitHubApi, GitHubConfig } from "./types";

const BYTE_RANGE = 256;
const RANDOM_CHUNK_MAX = 65_536;

function stubFetchImpl(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  return Promise.resolve(handler(url, init ?? {}));
}

export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_UNPROCESSABLE_ENTITY = 422;
export const HTTP_TOO_MANY_REQUESTS = 429;
export const HTTP_SERVER_ERROR = 500;
export const HTTP_SERVICE_UNAVAILABLE = 503;

export const baseConfig: Omit<GitHubConfig, "fetchImpl"> = {
  owner: "obra",
  repo: "blog",
  branch: "main",
  token: "ghp_test_token_123",
};

/** Builds a fetchImpl stub that hands (url, init) to `handler` for every request. */
export function createFetchStub(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return (input, init) => stubFetchImpl(handler, input, init);
}

/** A fetchImpl that always rejects, simulating offline/DNS/abort failures. */
export function rejectingFetch(error: unknown): typeof fetch {
  return () => Promise.reject(error);
}

/** A GitHubApi wired to `fetchImpl` over the shared fixture repo/owner/branch/token. */
export function buildApi(fetchImpl: typeof fetch): GitHubApi {
  return createGitHubApi({ ...baseConfig, fetchImpl });
}

export function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

/** Parses a captured RequestInit's JSON string body back into a value. */
export function readJsonBody(init: RequestInit): unknown {
  if (typeof init.body !== "string") {
    throw new Error("Expected a string request body");
  }
  return JSON.parse(init.body);
}

/** Wraps a flat base64 string at `width` columns, mimicking GitHub's blob content wrapping. */
export function wrapBase64(base64: string, width = 60): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += width) {
    lines.push(base64.slice(i, i + width));
  }
  return `${lines.join("\n")}\n`;
}

/** `length` bytes cycling 0..255 — deterministic, no allocation surprises. */
export function sequentialBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = i % BYTE_RANGE;
  }
  return bytes;
}

/** `length` cryptographically-random bytes, filled in chunks (getRandomValues caps per call). */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += RANDOM_CHUNK_MAX) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + RANDOM_CHUNK_MAX, length)));
  }
  return bytes;
}
