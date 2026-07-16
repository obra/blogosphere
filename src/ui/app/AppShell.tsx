// ABOUTME: Composition root — three-pane layout (Sidebar/EntryList/Detail),
// ABOUTME: global dialogs/toasts, app-wide keyboard shortcuts, a debounced
// ABOUTME: resync on window focus, and a flush-before-quit safety net.
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { ConflictHost } from "./ConflictHost";
import { ConnectScreen } from "./ConnectScreen";
import { EditorScreen } from "./EditorScreen";
import { EntryList } from "./EntryList";
import { debounce } from "./format";
import { NewLinkDialog } from "./NewLinkDialog";
import { handleCloseRequested } from "./quitFlush";
import { useServices } from "./ServicesContext";
import { SettingsScreen } from "./SettingsScreen";
import { Sidebar } from "./Sidebar";
import type { BoundAppStore } from "./state";
import { useAppStoreApi } from "./state";
import { Toasts } from "./Toasts";

interface AppShellProps {
  /** Integration wires the real og:title/<title> fetch for "+ Link". */
  fetchTitle?: ((url: string) => Promise<string | null>) | null;
  /** Integration wires the "rebuild github+sync" step, run after a token save. */
  onTokenSaved?: (token: string) => void | Promise<void>;
}

const FOCUS_SYNC_DEBOUNCE_MS = 800;

function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
}

function isNewPostShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "n";
}

function isNewLinkShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "l";
}

function isSettingsShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key === ",";
}

function isSyncShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "r";
}

function handleShortcut(store: BoundAppStore, event: KeyboardEvent): void {
  if (isSaveShortcut(event)) {
    event.preventDefault();
    store.getState().saveNow();
  } else if (isNewPostShortcut(event)) {
    event.preventDefault();
    store.getState().newDraft({ title: "" });
  } else if (isNewLinkShortcut(event)) {
    event.preventDefault();
    store.getState().openNewLinkDialog();
  } else if (isSettingsShortcut(event)) {
    event.preventDefault();
    store.getState().openSettings();
  } else if (isSyncShortcut(event)) {
    // Also swallows the webview's own Reload — reloading mid-edit would be
    // strictly worse than the sync the user actually asked for.
    event.preventDefault();
    store.getState().syncNow();
  }
}

function useKeyboardShortcuts(store: BoundAppStore): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      handleShortcut(store, event);
    }
    globalThis.window.addEventListener("keydown", onKeyDown);
    return () => globalThis.window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}

/** Resync on window focus (e.g. switching back from editing the repo in vim
 *  or having Claude Code commit directly) — debounced so rapid focus churn
 *  (alt-tabbing) doesn't hammer the API. A no-op with no sync configured. */
function useSyncOnFocus(store: BoundAppStore): void {
  useEffect(() => {
    const debounced = debounce(() => {
      store
        .getState()
        .services.sync?.sync()
        .catch(() => undefined);
    }, FOCUS_SYNC_DEBOUNCE_MS);
    function onFocus() {
      debounced.call();
    }
    globalThis.window.addEventListener("focus", onFocus);
    return () => {
      globalThis.window.removeEventListener("focus", onFocus);
      debounced.cancel();
    };
  }, [store]);
}

/**
 * Flushes any debounced-but-not-yet-committed edit to SQLite before letting
 * the window actually close. Without this, Cmd-Q / the close box during the
 * debounce window (editDebounceMs after the last keystroke) kills the
 * process with the edit still sitting in an in-process setTimeout — losing
 * it outright, unlike every other quit timing (see state.entryActions.ts's
 * edit()/flushEdit, and the spec's "crash/force-quit loses nothing"
 * promise). A no-op outside Tauri (e.g. `vite dev`'s browser preview).
 */
function useFlushBeforeQuit(store: BoundAppStore): void {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    const win = getCurrentWindow();
    win
      .onCloseRequested((event) => handleCloseRequested(store, event, win))
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [store]);
}

/** First run (no sync configured) shows the connect card where the editor
 *  would go; the rest of the shell stays visible but honest about being empty. */
function DetailPane(props: { onTokenSaved: AppShellProps["onTokenSaved"] }) {
  const services = useServices();
  if (services.sync === null) {
    return <ConnectScreen onTokenSaved={props.onTokenSaved} />;
  }
  return <EditorScreen />;
}

function AppShell(props: AppShellProps) {
  const store = useAppStoreApi();
  useKeyboardShortcuts(store);
  useSyncOnFocus(store);
  useFlushBeforeQuit(store);

  useEffect(() => {
    store.getState().init();
  }, [store]);

  return (
    <div className="app-shell">
      <Sidebar />
      <EntryList />
      <div className="detail-pane pane">
        <DetailPane onTokenSaved={props.onTokenSaved} />
      </div>
      <NewLinkDialog fetchTitle={props.fetchTitle ?? null} />
      <SettingsScreen onTokenSaved={props.onTokenSaved} />
      <ConflictHost />
      <Toasts />
    </div>
  );
}

export { AppShell };
