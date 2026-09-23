// ABOUTME: AppShell's hooks into the app's native window: the menu bar, the
// ABOUTME: flush-before-quit close handler, the Settings window bridge, Android back.
import { isTauri } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { SETTINGS_WINDOW } from "../../settings/protocol";
import { tauriTransport } from "../../settings/tauriTransport";
import { installAppMenu } from "./menu";
import { handleCloseRequested } from "./quitFlush";
import { installSettingsBridge } from "./settingsBridge";
import type { BoundAppStore } from "./state";

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
      .onCloseRequested((event) =>
        handleCloseRequested(store, event, win, () => WebviewWindow.getByLabel(SETTINGS_WINDOW)),
      )
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

/** macOS: answers the Settings window (a separate window with no data of
 *  its own) from this window's store, for as long as the shell is mounted. */
function useSettingsBridge(
  store: BoundAppStore,
  mac: boolean,
  onTokenSaved: ((token: string) => void | Promise<void>) | undefined,
): void {
  const connect = useRef(onTokenSaved);
  connect.current = onTokenSaved;
  useEffect(() => {
    if (!(mac && isTauri())) {
      return;
    }
    let dispose: (() => void) | undefined;
    let cancelled = false;
    installSettingsBridge({
      transport: tauriTransport,
      store,
      connect: async (token) => {
        await connect.current?.(token);
      },
    })
      .then((stop) => {
        if (cancelled) {
          stop();
        } else {
          dispose = stop;
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [store, mac]);
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

export { useAndroidBack, useFlushBeforeQuit, useNativeMenu, useSettingsBridge };
