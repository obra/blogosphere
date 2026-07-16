// ABOUTME: Root application component — boots the right Services (Tauri or
// ABOUTME: the in-memory browser/dev demo), then renders the real app tree.
// ABOUTME: Also owns the Settings "save token" -> live github+sync rebuild.
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { boot, runInitialSync } from "./bootstrap";
import { fetchPageTitle } from "./bootstrap/fetchTitle";
import { buildGithubAndSync, tauriWriteClipboardText } from "./bootstrap/tauri";
import type { Services } from "./core/services";
import { AppShell } from "./ui/app/AppShell";
import { ServicesProvider } from "./ui/app/ServicesContext";
import { AppStoreProvider } from "./ui/app/state";
import type { AppStoreDeps } from "./ui/app/state.types";
import { KEYCHAIN_TOKEN_KEY } from "./ui/app/state.types";

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

export function App() {
  const tauri = isTauri();
  const [services, setServices] = useState<Services | null>(null);

  // Runs once, on mount only: builds Services (Tauri vs demo) and runs the
  // first bootstrap-or-sync before handing them to the tree. A later token
  // save (buildTokenSavedHandler above) updates this same state from an
  // event handler, not from this effect, so the two never race.
  useEffect(() => {
    let cancelled = false;
    boot().then((booted) => {
      if (!cancelled) {
        setServices(booted);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!services) {
    return <LoadingScreen />;
  }

  // Spread in only when non-empty: AppStoreProviderProps.deps is a true
  // optional prop under exactOptionalPropertyTypes, so an explicit
  // `deps={undefined}` on the demo path would be a type error, not a no-op.
  const storeProviderProps: { deps?: Partial<AppStoreDeps> } = tauri
    ? { deps: { writeClipboardText: tauriWriteClipboardText } }
    : {};

  return (
    <ServicesProvider services={services}>
      <AppStoreProvider {...storeProviderProps}>
        <AppShell
          fetchTitle={tauri ? fetchPageTitle : null}
          onTokenSaved={buildTokenSavedHandler(tauri, services, setServices)}
        />
      </AppStoreProvider>
    </ServicesProvider>
  );
}
