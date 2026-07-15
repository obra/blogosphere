// ABOUTME: NewLinkDialog's "Fetch title" implementation — GETs a page via
// ABOUTME: the Tauri http plugin (bypasses webview CORS for arbitrary third-
// ABOUTME: party hosts), extracts og:title else <title>, 5s hard timeout,
// ABOUTME: text/html responses only.
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const FETCH_TIMEOUT_MS = 5000;
const HTML_CONTENT_TYPE_PATTERN = /text\/html/i;
const OG_TITLE_CONTENT_FIRST_PATTERN =
  /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i;
const OG_TITLE_PROPERTY_FIRST_PATTERN =
  /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i;
const TITLE_TAG_PATTERN = /<title[^>]*>([^<]*)<\/title>/i;

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

/** Best-effort page-title fetch for the "+ Link" dialog's prefill button.
 *  Resolves to null (never rejects) on any timeout, network error, non-2xx
 *  status, non-HTML response, or missing title — the caller just leaves the
 *  title field as the user typed it. */
export async function fetchPageTitle(url: string): Promise<string | null> {
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
    return extractTitle(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
