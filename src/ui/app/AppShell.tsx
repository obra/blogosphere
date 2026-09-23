// ABOUTME: Composition root — three-pane layout (Sidebar/EntryList/Detail),
// ABOUTME: the overlays, app-wide keyboard shortcuts, and a debounced resync on
// ABOUTME: window focus. Native-window hooks live in windowHooks.ts.
import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { ColumnDivider } from "./ColumnDivider";
import { ConflictHost } from "./ConflictHost";
import { ConnectScreen } from "./ConnectScreen";
import { layoutColumns } from "./columnLayout";
import { EditorScreen } from "./EditorScreen";
import { EntryList } from "./EntryList";
import { debounce } from "./format";
import { Hud } from "./Hud";
import { DetailToolbar } from "./MacToolbar";
import { MobileShell } from "./MobileShell";
import { runMenuCommand } from "./menuModel";
import { NewLinkDialog } from "./NewLinkDialog";
import { QuickOpenPalette } from "./QuickOpenPalette";
import { useFlushOnHide } from "./quitFlush";
import { useServices } from "./ServicesContext";
import { SettingsScreen } from "./SettingsScreen";
import { Sidebar } from "./Sidebar";
import { SyncLogPanel } from "./SyncLogPanel";
import type { BoundAppStore } from "./state";
import { useAppStore, useAppStoreApi } from "./state";
import { Toasts } from "./Toasts";
import { useAppCompactLayout } from "./useCompactLayout";
import { useWindowWidth } from "./useWindowWidth";
import { VersionsPanel } from "./VersionsPanel";
import {
  useAndroidBack,
  useFlushBeforeQuit,
  useNativeMenu,
  useSettingsBridge,
} from "./windowHooks";

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
    runMenuCommand("newPost", store);
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

/** macOS: grid columns from the stored widths, fitted to the window by
 *  columnLayout, and the divider positions between them. */
function useMacColumns(mac: boolean, sidebarHidden: boolean) {
  const windowWidth = useWindowWidth();
  const sidebarWidth = useAppStore((state) => state.sidebarWidth);
  const listWidth = useAppStore((state) => state.listWidth);
  const fitted = layoutColumns({ windowWidth, sidebarWidth, listWidth, sidebarHidden });
  if (!mac) {
    return null;
  }
  const template = sidebarHidden
    ? `${fitted.listWidth}px 1fr`
    : `${fitted.sidebarWidth}px ${fitted.listWidth}px 1fr`;
  return {
    template,
    sidebarEdge: sidebarHidden ? null : fitted.sidebarWidth,
    listEdge: (sidebarHidden ? 0 : fitted.sidebarWidth) + fitted.listWidth,
  };
}

/** Everything that floats over the panes. macOS has its own homes for
 *  Settings (a window), the Activity log (a popover), and notices (the HUD). */
function Overlays(props: AppShellProps & { mac: boolean }) {
  return (
    <>
      <NewLinkDialog fetchTitle={props.fetchTitle ?? null} />
      {props.mac ? null : <SettingsScreen onTokenSaved={props.onTokenSaved} />}
      {props.mac ? null : <SyncLogPanel />}
      <QuickOpenPalette />
      <VersionsPanel />
      <ConflictHost />
      <Toasts />
      {props.mac ? <Hud /> : null}
    </>
  );
}

function AppShell(props: AppShellProps) {
  const store = useAppStoreApi();
  const compact = useAppCompactLayout();
  // macOS shows the activity log in the sync button's popover instead.
  const mac = useServices().shell.platform() === "macos";
  // Only macOS lets the person hide the sidebar (⌃⌘S, the toolbar toggle).
  const sidebarHidden = useAppStore((state) => mac && state.sidebarHidden);
  const columns = useMacColumns(mac, sidebarHidden);
  const menuInstalled = useNativeMenu(store);
  useKeyboardShortcuts(store, menuInstalled);
  useAndroidBack(store);
  useSyncOnFocus(store);
  useFlushOnHide(store);
  useFlushBeforeQuit(store);
  useSettingsBridge(store, mac, props.onTokenSaved);

  useEffect(() => {
    store.getState().init();
  }, [store]);

  return (
    <div
      className="app-shell"
      data-shell={isTauri() ? "tauri" : "web"}
      data-layout={compact ? "compact" : "wide"}
      data-sidebar={sidebarHidden ? "hidden" : "shown"}
      style={columns ? { gridTemplateColumns: columns.template } : undefined}
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
          {columns && columns.sidebarEdge !== null ? (
            <ColumnDivider column="sidebar" at={columns.sidebarEdge} />
          ) : null}
          {columns ? <ColumnDivider column="list" at={columns.listEdge} /> : null}
          <div className="detail-pane pane">
            <DetailPane onTokenSaved={props.onTokenSaved} />
          </div>
        </>
      )}
      <Overlays {...props} mac={mac} />
    </div>
  );
}

export { AppShell };
