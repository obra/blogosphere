// ABOUTME: Pure URL-gating logic for clipboard-based link capture (the desktop
// ABOUTME: "+ Link" prefill). Kept out of tauri.ts so it can be unit-tested directly.

/** Matches a string that starts with "http://" or "https://". */
const HTTP_URL_PATTERN = /^https?:\/\//;

/**
 * Returns clipboard `text` trimmed, iff the trimmed text starts with
 * `http://` or `https://`; otherwise null.
 *
 * This is a deliberately cheap prefix check, not full URL validation: the
 * result only prefills an editable field in the "+ Link" sheet, so a
 * predictable gate beats a strict parser rejecting good-enough clipboard
 * content.
 */
export function extractClipboardUrl(text: string): string | null {
  const trimmed = text.trim();
  return HTTP_URL_PATTERN.test(trimmed) ? trimmed : null;
}
