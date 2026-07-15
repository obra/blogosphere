// ABOUTME: Composition root — three-pane layout (Sidebar/EntryList/Detail),
// ABOUTME: global dialogs/toasts, app-wide keyboard shortcuts, and a
// ABOUTME: debounced resync on window focus.
import { useEffect } from "react";
import { ConflictHost } from "./ConflictHost";
import { EditorScreen } from "./EditorScreen";
import { EntryList } from "./EntryList";
import { debounce } from "./format";
import { NewLinkDialog } from "./NewLinkDialog";
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

function AppShell(props: AppShellProps) {
  const store = useAppStoreApi();
  useKeyboardShortcuts(store);
  useSyncOnFocus(store);

  useEffect(() => {
    store.getState().init();
  }, [store]);

  return (
    <div className="app-shell">
      <Sidebar />
      <EntryList />
      <div className="detail-pane pane">
        <EditorScreen />
      </div>
      <NewLinkDialog fetchTitle={props.fetchTitle ?? null} />
      <SettingsScreen onTokenSaved={props.onTokenSaved} />
      <ConflictHost />
      <Toasts />
    </div>
  );
}

export { AppShell };
