// ABOUTME: Minimal EditorProps.resolveImage/onImage implementations — asset
// ABOUTME: cache read/write via ShellApi, outbox registration via StoreApi.
// ABOUTME: Images are outside this module's assigned spec sections; this is
// ABOUTME: a light, best-effort wiring the images-focused work can replace.
import type { Services } from "../../core/services";
import { META_ASSETS_INDEX } from "../../core/sync/meta";

const TIMESTAMP_PATTERN = /[^0-9]/g;
const CONTENT_PREFIX_PATTERN = /^content\//;
const ISO_DATE_DIGITS_LENGTH = 8; // YYYYMMDD
const ISO_DATETIME_DIGITS_LENGTH = 14; // YYYYMMDDHHMMSS

/**
 * repoPath for a pasted/dropped image, e.g.
 * "content/assets/2026/07/pasted-image-20260715-093012.png" (spec's Images
 * section: pasted-image-YYYYMMDD-HHMMSS). Folder and filename both derive
 * from the same UTC instant so they can never disagree near a
 * local-midnight boundary.
 */
function pastedImageRepoPath(now: Date, suggestedExt: string): string {
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  const digits = now
    .toISOString()
    .replace(TIMESTAMP_PATTERN, "")
    .slice(0, ISO_DATETIME_DIGITS_LENGTH);
  const datePart = digits.slice(0, ISO_DATE_DIGITS_LENGTH);
  const timePart = digits.slice(ISO_DATE_DIGITS_LENGTH);
  return `content/assets/${year}/${month}/pasted-image-${datePart}-${timePart}.${suggestedExt}`;
}

const ASSET_REF_PREFIX = "/assets/";
const REMOTE_REF_PATTERN = /^(?:https?:)?\/\//;

/**
 * Maps an image ref as written in a post to the repo-relative path the asset
 * cache and image index are keyed by:
 *   "/assets/2026/07/x.png"  -> "content/assets/2026/07/x.png"
 *   "./setup.png" (relative) -> resolved against the entry's own directory
 * Remote (http/protocol-relative) refs return null — the webview loads those
 * directly. Refs that escape content/ via ../ also return null.
 */
function repoPathForRef(src: string, entryPath: string): string | null {
  if (REMOTE_REF_PATTERN.test(src) || src.startsWith("data:")) {
    return null;
  }
  if (src.startsWith(ASSET_REF_PREFIX)) {
    return `content${src}`;
  }
  if (src.startsWith("/")) {
    return null; // absolute site path outside /assets/ — nothing to fetch
  }
  const entryDir = entryPath.split("/").slice(0, -1);
  const segments = [...entryDir];
  const parts = src.split("/").filter((part) => part !== "" && part !== ".");
  for (const part of parts) {
    if (part === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  const resolved = segments.join("/");
  return resolved.startsWith("content/") ? resolved : null;
}

interface ImageIndexEntry {
  path: string;
  sha: string;
}

async function lookupImageSha(services: Services, repoPath: string): Promise<string | null> {
  const raw = await services.store.getMeta(META_ASSETS_INDEX);
  if (!raw) {
    return null;
  }
  try {
    const index = JSON.parse(raw) as ImageIndexEntry[];
    return index.find((entry) => entry.path === repoPath)?.sha ?? null;
  } catch {
    return null;
  }
}

/** Cache miss + online: fetch the blob by sha, fill the cache, return a URL. */
async function fetchAndCache(services: Services, repoPath: string): Promise<string | null> {
  const { github } = services;
  if (!github) {
    return null; // not connected (or offline-only demo) — placeholder it is
  }
  const sha = await lookupImageSha(services, repoPath);
  if (!sha) {
    return null;
  }
  try {
    const bytes = await github.getBlob(sha);
    const localPath = await services.shell.assetWrite(repoPath, bytes);
    return services.shell.assetDisplayUrl(localPath);
  } catch {
    // Network/auth hiccup: placeholder now; a later render retries.
    return null;
  }
}

/**
 * The editor's image resolver: local cache first, then a one-time fetch from
 * the repo (spec: "miss + online -> fetch blob via API, cache; miss + offline
 * -> placeholder"). Concurrent requests for the same ref share one fetch.
 */
function makeResolveImage(
  services: Services,
  entryPath: string,
): (src: string) => Promise<string | null> {
  const inFlight = new Map<string, Promise<string | null>>();
  return async (src) => {
    const repoPath = repoPathForRef(src, entryPath);
    if (!repoPath) {
      return null;
    }
    const localPath = await services.shell.assetPathFor(repoPath);
    if (localPath) {
      return services.shell.assetDisplayUrl(localPath);
    }
    const pending = inFlight.get(repoPath);
    if (pending) {
      return pending;
    }
    const fetch = fetchAndCache(services, repoPath).finally(() => inFlight.delete(repoPath));
    inFlight.set(repoPath, fetch);
    return fetch;
  };
}

function makeOnImage(
  services: Services,
  entryPath: string,
): (bytes: Uint8Array, suggestedExt: string) => Promise<string | null> {
  return async (bytes, suggestedExt) => {
    const repoPath = pastedImageRepoPath(new Date(), suggestedExt);
    const localPath = await services.shell.assetWrite(repoPath, bytes);
    await services.store.addAsset({ repoPath, localPath, entryPath, createdAt: Date.now() });
    return `/${repoPath.replace(CONTENT_PREFIX_PATTERN, "")}`;
  };
}

export { makeOnImage, makeResolveImage };
