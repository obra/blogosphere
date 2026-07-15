// ABOUTME: Fully in-memory ShellApi for unit tests and vite-only (non-Tauri) dev —
// ABOUTME: Map-backed keychain/assets, a seedable share inbox, a settable clipboard.

import { extractClipboardUrl } from "./clipboardUrl";
import type { Platform, SharePayload, ShellApi } from "./types";

const ASSET_LOCAL_PATH_PREFIX = "memory://asset/";

function localPathFor(repoPath: string): string {
  return `${ASSET_LOCAL_PATH_PREFIX}${repoPath}`;
}

function repoPathFor(localPath: string): string | null {
  return localPath.startsWith(ASSET_LOCAL_PATH_PREFIX)
    ? localPath.slice(ASSET_LOCAL_PATH_PREFIX.length)
    : null;
}

/** Extra test-only hooks for driving the fake, beyond the ShellApi contract. */
export interface FakeShell extends ShellApi {
  /** Replaces the simulated OS clipboard contents. */
  setClipboardText(text: string): void;
  /** Appends payload(s) to the share inbox, as if the OS had delivered a share. */
  seedShareInbox(...payloads: SharePayload[]): void;
}

export interface FakeShellOptions {
  /** Defaults to "web" (this fake has no real OS underneath it). */
  platform?: Platform;
  shareInbox?: SharePayload[];
  clipboardText?: string;
}

/** In-memory ShellApi: no filesystem, no OS keychain, no Tauri runtime required. */
export function createFakeShell(options: FakeShellOptions = {}): FakeShell {
  const keychain = new Map<string, string>();
  const assets = new Map<string, Uint8Array>(); // repoPath -> bytes
  let shareInbox: SharePayload[] = [...(options.shareInbox ?? [])];
  let clipboardText = options.clipboardText ?? "";

  return {
    platform(): Platform {
      return options.platform ?? "web";
    },

    keychainGet(key) {
      return Promise.resolve(keychain.get(key) ?? null);
    },
    keychainSet(key, value) {
      keychain.set(key, value);
      return Promise.resolve();
    },
    keychainDelete(key) {
      keychain.delete(key);
      return Promise.resolve();
    },

    shareInboxList() {
      return Promise.resolve([...shareInbox]);
    },
    shareInboxAck(id) {
      shareInbox = shareInbox.filter((payload) => payload.id !== id);
      return Promise.resolve();
    },

    assetWrite(repoPath, bytes) {
      assets.set(repoPath, bytes.slice());
      return Promise.resolve(localPathFor(repoPath));
    },
    assetRead(localPath) {
      const repoPath = repoPathFor(localPath);
      const bytes = repoPath === null ? undefined : assets.get(repoPath);
      if (bytes === undefined) {
        return Promise.reject(new Error(`fake shell: no asset cached at ${localPath}`));
      }
      return Promise.resolve(bytes.slice());
    },
    assetPathFor(repoPath) {
      return Promise.resolve(assets.has(repoPath) ? localPathFor(repoPath) : null);
    },
    assetDisplayUrl(localPath) {
      return `fake-display-url:${localPath}`;
    },

    clipboardReadUrl() {
      return Promise.resolve(extractClipboardUrl(clipboardText));
    },

    setClipboardText(text) {
      clipboardText = text;
    },
    seedShareInbox(...payloads) {
      shareInbox = [...shareInbox, ...payloads];
    },
  };
}
