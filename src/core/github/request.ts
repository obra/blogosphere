// ABOUTME: Transport-level helpers shared by every GitHub API method — runs a
// ABOUTME: fetch, maps non-2xx/network failures to typed GitHubErrors, parses JSON.

import { GitHubError } from "./types";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_THRESHOLD = 500;

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/** Attaches the original failure as `cause` without changing GitHubError's frozen constructor. */
export function withCause(error: GitHubError, cause: unknown): GitHubError {
  error.cause = cause;
  return error;
}

/** Runs fetchImpl, mapping any rejection (offline, DNS, abort, ...) to "network". */
export async function doFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (err) {
    throw withCause(
      new GitHubError("network", `Network error requesting ${url}: ${errorMessage(err)}`),
      err,
    );
  }
}

/** Reads and JSON-parses a response body; any surprise becomes "protocol". */
export async function parseJsonBody(response: Response, context: string): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    throw withCause(
      new GitHubError("network", `${context}: failed reading response body (${errorMessage(err)})`),
      err,
    );
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw withCause(
      new GitHubError(
        "protocol",
        `${context}: response body was not valid JSON (${errorMessage(err)})`,
      ),
      err,
    );
  }
}

/** Extracts a human-readable message from an error response body. */
export async function readErrorMessage(response: Response): Promise<string> {
  const fallback = response.statusText.length > 0 ? response.statusText : `HTTP ${response.status}`;
  let text: string;
  try {
    text = await response.text();
  } catch {
    return fallback;
  }
  if (text.length === 0) {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    const message = (parsed as { message?: unknown } | null)?.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  } catch {
    // Not JSON — the raw response text is the best message available.
  }
  return text;
}

/** Maps a non-2xx status + message to the one GitHubErrorKind that fits. */
export function buildStatusError(
  status: number,
  message: string,
  rateLimited: boolean,
): GitHubError {
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
    if (status === HTTP_FORBIDDEN && rateLimited) {
      return new GitHubError("rate-limited", message, status);
    }
    return new GitHubError("auth", message, status);
  }
  if (status === HTTP_NOT_FOUND) {
    return new GitHubError("not-found", message, status);
  }
  if (status === HTTP_TOO_MANY_REQUESTS) {
    return new GitHubError("rate-limited", message, status);
  }
  if (status >= HTTP_SERVER_ERROR_THRESHOLD) {
    return new GitHubError("server", message, status);
  }
  return new GitHubError("protocol", message, status);
}

/** Reads a non-ok Response into the correctly-kinded GitHubError. */
export async function readMappedError(response: Response, context: string): Promise<GitHubError> {
  const message = await readErrorMessage(response);
  const rateLimited =
    response.status === HTTP_FORBIDDEN && response.headers.get("x-ratelimit-remaining") === "0";
  return buildStatusError(response.status, `${context}: ${message}`, rateLimited);
}

/** GET/POST/PATCH a JSON endpoint; throws a mapped GitHubError on any failure. */
export async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  context: string,
): Promise<unknown> {
  const response = await doFetch(fetchImpl, url, init);
  if (!response.ok) {
    throw await readMappedError(response, context);
  }
  return parseJsonBody(response, context);
}
