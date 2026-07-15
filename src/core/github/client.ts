// ABOUTME: Factory for the GitHub Git Data API client — implements GitHubApi
// ABOUTME: over config.fetchImpl only; no caching or retry (that's sync's job).

import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  extractBlobContent,
  extractCreatedSha,
  extractRefSha,
  parseCommitResponse,
  parseTreeResponse,
} from "./parse";
import {
  buildStatusError,
  doFetch,
  errorMessage,
  parseJsonBody,
  readErrorMessage,
  readMappedError,
  requestJson,
  withCause,
} from "./request";
import type {
  CommitInfo,
  GitHubApi,
  GitHubConfig,
  TreeChange,
  TreeEntry,
  UpdateRefResult,
} from "./types";
import { GitHubError } from "./types";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";
const HTTP_UNPROCESSABLE_ENTITY = 422;
/** GitHub's rejection wording for a non-fast-forward ref update; tolerate the hyphenated form too. */
const NOT_FAST_FORWARD_PATTERN = /not a fast[- ]forward/i;

/** Per-client transport state, threaded through the free functions below. */
interface ClientContext {
  config: GitHubConfig;
  repoUrl: string;
}

function buildHeaders(config: GitHubConfig, hasBody: boolean): Record<string, string> {
  const base: Record<string, string> = {
    authorization: `Bearer ${config.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": API_VERSION,
  };
  if (hasBody) {
    base["content-type"] = "application/json";
  }
  return base;
}

function getJson(ctx: ClientContext, path: string, context: string): Promise<unknown> {
  return requestJson(
    ctx.config.fetchImpl,
    `${ctx.repoUrl}${path}`,
    { method: "GET", headers: buildHeaders(ctx.config, false) },
    context,
  );
}

function postJson(
  ctx: ClientContext,
  path: string,
  body: unknown,
  context: string,
): Promise<unknown> {
  return requestJson(
    ctx.config.fetchImpl,
    `${ctx.repoUrl}${path}`,
    { method: "POST", headers: buildHeaders(ctx.config, true), body: JSON.stringify(body) },
    context,
  );
}

async function getRef(ctx: ClientContext): Promise<string> {
  const data = await getJson(ctx, `/git/ref/heads/${ctx.config.branch}`, "getRef");
  return extractRefSha(data, "getRef");
}

async function getCommit(ctx: ClientContext, sha: string): Promise<CommitInfo> {
  const data = await getJson(ctx, `/git/commits/${sha}`, "getCommit");
  return parseCommitResponse(data, "getCommit");
}

async function getTreeRecursive(ctx: ClientContext, treeSha: string): Promise<TreeEntry[]> {
  const data = await getJson(ctx, `/git/trees/${treeSha}?recursive=1`, "getTreeRecursive");
  return parseTreeResponse(data, "getTreeRecursive");
}

async function getBlobBytes(ctx: ClientContext, sha: string): Promise<Uint8Array> {
  const data = await getJson(ctx, `/git/blobs/${sha}`, "getBlob");
  const content = extractBlobContent(data, "getBlob");
  try {
    return base64ToBytes(content);
  } catch (err) {
    throw withCause(
      new GitHubError("protocol", `getBlob: malformed base64 content (${errorMessage(err)})`),
      err,
    );
  }
}

async function getBlobText(ctx: ClientContext, sha: string): Promise<string> {
  const bytes = await getBlobBytes(ctx, sha);
  return new TextDecoder().decode(bytes);
}

async function createBlob(ctx: ClientContext, content: string | Uint8Array): Promise<string> {
  const body =
    typeof content === "string"
      ? { content, encoding: "utf-8" }
      : { content: bytesToBase64(content), encoding: "base64" };
  const data = await postJson(ctx, "/git/blobs", body, "createBlob");
  return extractCreatedSha(data, "createBlob");
}

function toRawTreeChange(change: TreeChange): {
  path: string;
  mode: TreeChange["mode"];
  type: "blob";
  sha: string | null;
} {
  return { path: change.path, mode: change.mode, type: "blob", sha: change.sha };
}

async function createTree(
  ctx: ClientContext,
  baseTreeSha: string,
  changes: TreeChange[],
): Promise<string> {
  // GitHub's wire format requires the literal snake_case key "base_tree". Set
  // by assignment rather than as an object-literal key, since it's a name we
  // don't control and camelCasing it would change what's sent over the wire.
  const body: Record<string, unknown> = { tree: changes.map(toRawTreeChange) };
  body.base_tree = baseTreeSha;
  const data = await postJson(ctx, "/git/trees", body, "createTree");
  return extractCreatedSha(data, "createTree");
}

async function createCommit(
  ctx: ClientContext,
  input: { treeSha: string; parents: string[]; message: string },
): Promise<string> {
  const body = { message: input.message, tree: input.treeSha, parents: input.parents };
  const data = await postJson(ctx, "/git/commits", body, "createCommit");
  return extractCreatedSha(data, "createCommit");
}

async function updateRef(ctx: ClientContext, newSha: string): Promise<UpdateRefResult> {
  const url = `${ctx.repoUrl}/git/refs/heads/${ctx.config.branch}`;
  const response = await doFetch(ctx.config.fetchImpl, url, {
    method: "PATCH",
    headers: buildHeaders(ctx.config, true),
    body: JSON.stringify({ sha: newSha, force: false }),
  });

  if (response.ok) {
    const data = await parseJsonBody(response, "updateRef");
    return { ok: true, newSha: extractRefSha(data, "updateRef") };
  }

  if (response.status === HTTP_UNPROCESSABLE_ENTITY) {
    const message = await readErrorMessage(response);
    if (NOT_FAST_FORWARD_PATTERN.test(message)) {
      return { ok: false, reason: "not-fast-forward" };
    }
    throw buildStatusError(HTTP_UNPROCESSABLE_ENTITY, `updateRef: ${message}`, false);
  }

  throw await readMappedError(response, "updateRef");
}

export function createGitHubApi(config: GitHubConfig): GitHubApi {
  const ctx: ClientContext = {
    config,
    repoUrl: `${API_BASE}/repos/${config.owner}/${config.repo}`,
  };
  return {
    getRef: () => getRef(ctx),
    getCommit: (sha) => getCommit(ctx, sha),
    getTreeRecursive: (treeSha) => getTreeRecursive(ctx, treeSha),
    getBlob: (sha) => getBlobBytes(ctx, sha),
    getBlobText: (sha) => getBlobText(ctx, sha),
    createBlob: (content) => createBlob(ctx, content),
    createTree: (baseTreeSha, changes) => createTree(ctx, baseTreeSha, changes),
    createCommit: (input) => createCommit(ctx, input),
    updateRef: (newSha) => updateRef(ctx, newSha),
  };
}
