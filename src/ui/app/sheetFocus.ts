// ABOUTME: A sheet takes keyboard focus as it opens (its first field, else its
// ABOUTME: first button), so keys stop reaching the list and editor behind it.

// biome-ignore lint/security/noSecrets: a CSS selector, not a credential.
const FOCUSABLE = "input:not([disabled]), select, textarea:not([readonly]), button:not([disabled])";

/** A ref callback for a sheet's container: runs once, when it mounts. */
function focusSheetOnOpen(sheet: HTMLElement | null): void {
  sheet?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}

export { focusSheetOnOpen };
