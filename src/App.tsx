// ABOUTME: Root application component — boots the right Services (Tauri or
// ABOUTME: the in-memory browser/dev demo), then renders the real app tree.
// ABOUTME: Also owns the Settings "save token" -> live github+sync rebuild.
import { isTauri } from "@tauri-apps/api/core";
import { confirm as tauriConfirm, message as tauriMessage } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { boot, runInitialSync } from "./bootstrap";
import { fetchPageTitle } from "./bootstrap/fetchTitle";
import { buildGithubAndSync, tauriWriteClipboardText } from "./bootstrap/tauri";
import type { Services } from "./core/services";
import type { Platform } from "./shell/types";
import { AppShell } from "./ui/app/AppShell";
import { DEFAULT_LAYOUT_PREFS, type LayoutPrefs, loadLayoutPrefs } from "./ui/app/layoutPrefs";
import { ServicesProvider } from "./ui/app/ServicesContext";
import { AppStoreProvider } from "./ui/app/state";
import type { AppStoreDeps } from "./ui/app/state.types";
import { KEYCHAIN_TOKEN_KEY } from "./ui/app/state.types";

const TRY_AGAIN = "Try Again";

/** A native alert for an action that failed. With a retry it offers Try
 *  Again (the default button) and Cancel, which Escape picks; the dialog
 *  plugin answers with the
 *  chosen button's label. */
async function showFailureAlert(text: string, options: { retry: boolean }): Promise<boolean> {
  const chosen = await tauriMessage(text, {
    title: "Blogosphere",
    kind: "warning",
    buttons: options.retry ? { ok: TRY_AGAIN, cancel: "Cancel" } : "Ok",
  });
  return chosen === TRY_AGAIN;
}

function LoadingScreen() {
  return (
    <main className="app-loading">
      <p>Loading Blogosphere…</p>
    </main>
  );
}

/** Rebuilds github+sync from a freshly-saved token and swaps them into the
 *  live Services object — AppStoreProvider's effect (state.ts) picks up the
 *  new `sync` automatically and resubscribes, no app restart needed. */
function buildTokenSavedHandler(
  tauri: boolean,
  services: Services | null,
  setServices: (services: Services) => void,
): (token: string) => Promise<void> {
  return async (token) => {
    if (!(tauri && services)) {
      return; // demo path: no real GitHub to talk to
    }
    const { github, sync } = buildGithubAndSync(
      token,
      services.store,
      services.model,
      services.shell,
    );
    // Validate before installing: one cheap authenticated read. A bad token
    // rejects here — the connect card / settings show the error and the app
    // keeps its previous (possibly unconfigured) sync instead of a broken one.
    try {
      await github.getRef();
    } catch (cause) {
      await services.shell.keychainDelete(KEYCHAIN_TOKEN_KEY).catch(() => undefined);
      throw cause;
    }
    const next: Services = { ...services, github, sync };
    setServices(next);
    await runInitialSync(next);
  };
}

interface BootState {
  services: Services | null;
  setServices: (services: Services) => void;
  bootError: string | null;
  retryBoot: () => void;
  layout: LayoutPrefs;
}

/**
 * Runs once per boot attempt: builds Services (Tauri vs demo) and runs the
 * first bootstrap-or-sync before handing them to the tree. A later token
 * save (buildTokenSavedHandler above) updates this same state from an
 * event handler, not from this effect, so the two never race. A failure
 * (e.g. SQLite can't be created on a full disk — seen live on the iOS
 * simulator) must surface with a retry, never an eternal spinner.
 */
function useBoot(platform: Platform): BootState {
  const [services, setServices] = useState<Services | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [layout, setLayout] = useState<LayoutPrefs>(DEFAULT_LAYOUT_PREFS);

  useEffect(() => {
    let cancelled = false;
    setBootError(null);
    boot(platform)
      .then(async (booted) => {
        // Read before the first render so a hidden sidebar doesn't flash in.
        const prefs = await loadLayoutPrefs(booted.store);
        if (!cancelled) {
          setLayout(prefs);
          setServices(booted);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bootAttempt, platform]);

  return {
    services,
    setServices,
    bootError,
    retryBoot: () => setBootAttempt((n) => n + 1),
    layout,
  };
}

export function App(props: { platform: Platform }) {
  const tauri = isTauri();
  const { services, setServices, bootError, retryBoot, layout } = useBoot(props.platform);

  if (bootError !== null) {
    return (
      <div className="boot-error">
        <h2>Couldn't start</h2>
        <p>{bootError}</p>
        <button type="button" className="btn" onClick={retryBoot}>
          Try again
        </button>
      </div>
    );
  }

  if (!services) {
    return <LoadingScreen />;
  }

  // Spread in only when non-empty: AppStoreProviderProps.deps is a true
  // optional prop under exactOptionalPropertyTypes, so an explicit
  // `deps={undefined}` on the demo path would be a type error, not a no-op.
  // `confirm` becomes the real native NSAlert (tauri-plugin-dialog) instead
  // of the webview's "This page says…" panel.
  const storeProviderProps: { deps?: Partial<AppStoreDeps> } = tauri
    ? {
        deps: {
          writeClipboardText: tauriWriteClipboardText,
          confirm: (message) => tauriConfirm(message, { title: "Blogosphere" }),
          alert: showFailureAlert,
        },
      }
    : {};

  return (
    <ServicesProvider services={services}>
      <AppStoreProvider {...storeProviderProps} layout={layout}>
        <AppShell
          fetchTitle={tauri ? fetchPageTitle : null}
          onTokenSaved={buildTokenSavedHandler(tauri, services, setServices)}
        />
      </AppStoreProvider>
    </ServicesProvider>
  );
}
