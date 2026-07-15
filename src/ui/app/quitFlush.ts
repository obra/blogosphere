// ABOUTME: The flush-before-quit safety net's handler, kept out of
// ABOUTME: AppShell.tsx (component-only exports) so it's directly
// ABOUTME: unit-testable without mocking @tauri-apps/api.
import type { BoundAppStore } from "./state";

/** Minimal shape this module needs from Tauri's Window/CloseRequestedEvent —
 *  kept narrow so the handler below is testable with plain fakes, without
 *  mocking the @tauri-apps/api modules themselves. */
export interface CloseGuardedWindow {
  destroy(): Promise<void>;
}
export interface CloseRequestedLike {
  preventDefault(): void;
}

/**
 * Always prevents the immediate close, flushes every debounced-but-not-yet-
 * committed edit to SQLite, then force-closes. Without this, Cmd-Q / the
 * close box during the debounce window (editDebounceMs after the last
 * keystroke) kills the process with the edit still sitting in an in-process
 * setTimeout — losing it outright, unlike every other quit timing (see
 * state.entryActions.ts's edit()/flushEdit, and the spec's "crash/force-quit
 * loses nothing" promise).
 */
export async function handleCloseRequested(
  store: BoundAppStore,
  event: CloseRequestedLike,
  win: CloseGuardedWindow,
): Promise<void> {
  event.preventDefault();
  await store.getState().flushEdit();
  // destroy() (not close()) so this doesn't re-emit closeRequested and
  // recurse back into this same handler.
  await win.destroy();
}
