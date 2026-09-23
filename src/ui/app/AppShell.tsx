// ABOUTME: Composition root — three-pane layout (Sidebar/EntryList/Detail),
// ABOUTME: global dialogs/toasts, app-wide keyboard shortcuts, a debounced
// ABOUTME: resync on window focus, and a flush-before-quit safety net.
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { ConflictHost } from "./ConflictHost";
import { ConnectScreen } from "./ConnectScreen";
import { EditorScreen } from "./EditorScreen";
import { EntryList } from "./EntryList";
import { debounce } from "./format";
import { DetailToolbar } from "./MacToolbar";
import { MobileShell } from "./MobileShell";
import { installAppMenu } from "./menu";
import { NewLinkDialog } from "./NewLinkDialog";
import { QuickOpenPalette } from "./QuickOpenPalette";
import { handleCloseRequested, useFlushOnHide } from "./quitFlush";
import { useServices } from "./ServicesContext";
import { SettingsScreen } from "./SettingsScreen";
import { Sidebar } from "./Sidebar";
import { SyncLogPanel } from "./SyncLogPanel";
import type { BoundAppStore } from "./state";
import { useAppStore, useAppStoreApi } from "./state";
import { Toasts } from "./Toasts";
import { useAppCompactLayout } from "./useCompactLayout";
import { VersionsPanel } from "./VersionsPanel";

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

function isQuickOpenShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "k";
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
  } else if (isQuickOpenShortcut(event)) {
    event.preventDefault();
    store.getState().openQuickOpen();
  }
}

/** Once the native menu owns the accelerators, a DOM handler on top of it
 *  would double-fire every one — but until it does (browser dev, or a failed
 *  menu install in Tauri), the DOM handler is the only thing making the
 *  shortcuts work at all, so it stays active as the fallback. */
function useKeyboardShortcuts(store: BoundAppStore, menuInstalled: boolean): void {
  useEffect(() => {
    if (menuInstalled) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      handleShortcut(store, event);
    }
    globalThis.window.addEventListener("keydown", onKeyDown);
    return () => globalThis.window.removeEventListener("keydown", onKeyDown);
  }, [store, menuInstalled]);
}

/** Installs the real macOS menu bar (File/Edit/View/Window with working
 *  commands) once the shell mounts. A no-op outside Tauri. Returns whether
 *  the menu is actually installed — the shortcut fallback keys off it. */
function useNativeMenu(store: BoundAppStore): boolean {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let dispose: (() => void) | undefined;
    let cancelled = false;
    installAppMenu(store)
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        dispose = fn;
        setInstalled(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      setInstalled(false);
      dispose?.();
    };
  }, [store]);
  return installed;
}

/** Refresh from remote on window focus (e.g. switching back from editing the
 *  repo in vim or having Claude Code commit directly) — debounced so rapid
 *  focus churn (alt-tabbing) doesn't hammer the API. Pull-only, never sync():
 *  a push here would deploy the site (and any half-finished local edits)
 *  every time the window regains focus. A no-op with no sync configured. */
function useSyncOnFocus(store: BoundAppStore): void {
  useEffect(() => {
    const debounced = debounce(() => {
      store
        .getState()
        .services.sync?.pull()
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
    return (
      <>
        {services.shell.platform() === "macos" ? <DetailToolbar /> : null}
        <ConnectScreen onTokenSaved={props.onTokenSaved} />
      </>
    );
  }
  return <EditorScreen />;
}

/** Dismissible UI layers, topmost first — Android back pops exactly one. */
const BACK_LAYERS: Array<{
  open: (state: ReturnType<BoundAppStore["getState"]>) => boolean;
  close: (state: ReturnType<BoundAppStore["getState"]>) => void;
}> = [
  { open: (s) => s.quickOpenOpen, close: (s) => s.closeQuickOpen() },
  { open: (s) => s.versionsPath !== null, close: (s) => s.closeVersions() },
  { open: (s) => s.publishDialogOpen, close: (s) => s.closePublishDialog() },
  { open: (s) => s.syncLogOpen, close: (s) => s.closeSyncLog() },
  { open: (s) => s.settingsOpen, close: (s) => s.closeSettings() },
  { open: (s) => s.newLinkDialogOpen, close: (s) => s.closeNewLinkDialog() },
  { open: (s) => s.selectedPath !== null, close: (s) => s.select(null) },
];

/** Android's hardware/gesture back pops one UI layer per press — dialog, then
 *  editor→library — matching platform expectations. A no-op everywhere else
 *  (the listener registration simply fails outside Android and is swallowed). */
function useAndroidBack(store: BoundAppStore): void {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import("@tauri-apps/api/app")
      .then((app) =>
        app.onBackButtonPress(() => {
          const state = store.getState();
          BACK_LAYERS.find((layer) => layer.open(state))?.close(state);
        }),
      )
      .then((fn) => {
        if (cancelled) {
          fn.unregister();
          return;
        }
        unlisten = () => fn.unregister();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [store]);
}

function AppShell(props: AppShellProps) {
  const store = useAppStoreApi();
  const compact = useAppCompactLayout();
  // macOS shows the activity log in the sync button's popover instead.
  const mac = useServices().shell.platform() === "macos";
  // Only macOS lets the person hide the sidebar (⌃⌘S, the toolbar toggle).
  const sidebarHidden = useAppStore((state) => mac && state.sidebarHidden);
  const menuInstalled = useNativeMenu(store);
  useKeyboardShortcuts(store, menuInstalled);
  useAndroidBack(store);
  useSyncOnFocus(store);
  useFlushOnHide(store);
  useFlushBeforeQuit(store);

  useEffect(() => {
    store.getState().init();
  }, [store]);

  return (
    <div
      className="app-shell"
      data-shell={isTauri() ? "tauri" : "web"}
      data-layout={compact ? "compact" : "wide"}
      data-sidebar={sidebarHidden ? "hidden" : "shown"}
    >
      {/* Overlay-titlebar drag strip: the top 30px moves the window, like any
          native Mac app. Interactive controls all sit below it. */}
      <div className="titlebar-drag" data-tauri-drag-region="" />
      {compact ? (
        <MobileShell onTokenSaved={props.onTokenSaved} />
      ) : (
        <>
          {sidebarHidden ? null : <Sidebar />}
          <EntryList />
          <div className="detail-pane pane">
            <DetailPane onTokenSaved={props.onTokenSaved} />
          </div>
        </>
      )}
      <NewLinkDialog fetchTitle={props.fetchTitle ?? null} />
      <SettingsScreen onTokenSaved={props.onTokenSaved} />
      {mac ? null : <SyncLogPanel />}
      <QuickOpenPalette />
      <VersionsPanel />
      <ConflictHost />
      <Toasts />
    </div>
  );
}

export { AppShell };
