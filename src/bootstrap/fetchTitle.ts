// ABOUTME: NewLinkDialog's "Fetch title" implementation — GETs a page via
// ABOUTME: the Tauri http plugin (bypasses webview CORS for arbitrary third-
// ABOUTME: party hosts), extracts og:title else <title>, 5s hard timeout,
// ABOUTME: text/html responses only, a byte-capped read, and a loopback/
// ABOUTME: private-network host block (see http:default's "https://**"
// ABOUTME: capability in src-tauri/capabilities/default.json).
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const FETCH_TIMEOUT_MS = 5000;
// Titles never need more than a page's <head>; capping what we read also
// bounds the memory/CPU cost of a hostile or oversized response instead of
// relying solely on the wall-clock timeout above.
const MAX_RESPONSE_BYTES = 262_144; // 256 KiB
const HTML_CONTENT_TYPE_PATTERN = /text\/html/i;
const OG_TITLE_CONTENT_FIRST_PATTERN =
  /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i;
const OG_TITLE_PROPERTY_FIRST_PATTERN =
  /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i;
const TITLE_TAG_PATTERN = /<title[^>]*>([^<]*)<\/title>/i;

// http:default's "https://**" capability grants this plugin's fetch() any
// HTTPS host on its default port — deliberately broad, since "Fetch title"
// exists to hit arbitrary third-party blogs/articles, but that also means a
// clipboard-prefilled URL (NewLinkDialog's usePrefillFromClipboard, which a
// malicious page can write to the clipboard) reaching a loopback/private/
// link-local host on 443 would otherwise be a one-click recon/exfil oracle
// against internal services. This is a cheap, best-effort hostname
// stopgap — it can't stop DNS rebinding (the real connection happens later,
// in Rust, after this check runs) — not a hard security boundary.
const LOOPBACK_OR_PRIVATE_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /^127\./, // 127.0.0.0/8
  /^0\.0\.0\.0$/,
  /^10\./, // 10.0.0.0/8
  /^192\.168\./, // 192.168.0.0/16
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^\[?::1\]?$/, // IPv6 loopback
  /^\[?f[cd][0-9a-f]{2}:/i, // IPv6 unique-local (fc00::/7)
  /^\[?fe80:/i, // IPv6 link-local
];

function isDisallowedHost(hostname: string): boolean {
  return LOOPBACK_OR_PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

const ENTITY_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#0?39;/g, "'"],
  [/&apos;/g, "'"],
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"], // last: avoid double-decoding entities produced above
];

/** Minimal HTML entity decoding — the handful of entities that actually show
 *  up in <title>/og:title text, not a general HTML-entity decoder. */
function decodeEntitiesMinimal(text: string): string {
  return ENTITY_REPLACEMENTS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

function extractTitle(html: string): string | null {
  const match =
    OG_TITLE_CONTENT_FIRST_PATTERN.exec(html) ??
    OG_TITLE_PROPERTY_FIRST_PATTERN.exec(html) ??
    TITLE_TAG_PATTERN.exec(html);
  const raw = match?.[1];
  if (raw === undefined) {
    return null;
  }
  const decoded = decodeEntitiesMinimal(raw).trim();
  return decoded === "" ? null : decoded;
}

/** Reads at most MAX_RESPONSE_BYTES of the response body. Streams and stops
 *  early when the underlying Response exposes one (bounding the transfer
 *  itself, not just what we hold in memory); falls back to a full read
 *  truncated after the fact if it doesn't. */
async function readCapped(response: Response): Promise<string> {
  const { body } = response;
  if (!body) {
    const text = await response.text();
    return text.slice(0, MAX_RESPONSE_BYTES);
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (received < MAX_RESPONSE_BYTES) {
      // biome-ignore lint/performance/noAwaitInLoops: each chunk read is inherently sequential (a stream reader), and the whole point is to stop early once the cap is hit rather than buffer everything via Promise.all.
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text;
}

/** Best-effort page-title fetch for the "+ Link" dialog's prefill button.
 *  Resolves to null (never rejects) on any timeout, network error, non-2xx
 *  status, non-HTML response, disallowed host, or missing title — the
 *  caller just leaves the title field as the user typed it. */
export async function fetchPageTitle(url: string): Promise<string | null> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (isDisallowedHost(parsedUrl.hostname)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await tauriFetch(url, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!HTML_CONTENT_TYPE_PATTERN.test(contentType)) {
      return null;
    }
    return extractTitle(await readCapped(response));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
