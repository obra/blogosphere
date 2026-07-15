// ABOUTME: Composition root — three-pane layout (Sidebar/EntryList/Detail),
// ABOUTME: global dialogs/toasts, and app-wide keyboard shortcuts.
import { useEffect, useState } from "react";
import { ConflictDialog } from "./ConflictDialog";
import { EditorScreen } from "./EditorScreen";
import { EntryList } from "./EntryList";
import { NewLinkDialog } from "./NewLinkDialog";
import { SettingsScreen } from "./SettingsScreen";
import { Sidebar } from "./Sidebar";
import type { BoundAppStore } from "./state";
import { useAppStore, useAppStoreApi } from "./state";
import { Toasts } from "./Toasts";

interface AppShellProps {
  /** Integration wires the real og:title/<title> fetch for "+ Link". */
  fetchTitle?: ((url: string) => Promise<string | null>) | null;
  /** Integration wires the "rebuild github+sync" step, run after a token save. */
  onTokenSaved?: (token: string) => void | Promise<void>;
}

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

function ConflictHost() {
  const store = useAppStoreApi();
  const conflicts = useAppStore((state) => state.syncStatus?.conflicts ?? []);
  const entries = useAppStore((state) => state.entries);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const activePath = conflicts.find((path) => path !== dismissed);
  const record = activePath ? entries.find((e) => e.path === activePath) : undefined;
  if (!(activePath && record)) {
    return null;
  }

  return (
    <ConflictDialog
      path={activePath}
      mine={record.workingContent}
      theirs={record.baseContent ?? ""}
      onChoose={(resolution) => {
        setDismissed(null);
        store.getState().resolveConflict(activePath, resolution);
      }}
      onCancel={() => setDismissed(activePath)}
    />
  );
}

function AppShell(props: AppShellProps) {
  const store = useAppStoreApi();
  useKeyboardShortcuts(store);

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
