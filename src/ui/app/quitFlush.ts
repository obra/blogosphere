// ABOUTME: Flush-before-the-process-might-die safety nets: the close-requested
// ABOUTME: handler (graceful quit) and the visibility-hidden flush (mobile OSes
// ABOUTME: kill backgrounded apps with no close event). Kept out of
// ABOUTME: AppShell.tsx (component-only exports) so both are unit-testable.
import { useEffect } from "react";
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

/**
 * Flushes the typing buffer the moment the app stops being visible.
 * Backgrounding is the last reliable moment before a mobile OS may kill the
 * process — no close-requested event ever fires there. Desktop minimize hits
 * this too; the commit is an idempotent local upsert, so the extra write is
 * harmless (and never a push — see commitPending).
 */
export function useFlushOnHide(store: BoundAppStore): void {
  useEffect(() => {
    function onVisibilityChange(): void {
      if (globalThis.document.visibilityState === "hidden") {
        store
          .getState()
          .flushEdit()
          .catch(() => undefined);
      }
    }
    globalThis.document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      globalThis.document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [store]);
}
