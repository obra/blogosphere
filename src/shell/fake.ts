// ABOUTME: Fully in-memory ShellApi for unit tests and vite-only (non-Tauri) dev —
// ABOUTME: Map-backed keychain/assets, a seedable share inbox, a settable clipboard.

import { bytesToBase64 } from "../core/github/base64";
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

const FAKE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
};

function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return FAKE_MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** A real, renderable data: URL so the browser demo and jsdom tests can show
 *  cached images instead of a broken placeholder. */
function fakeDisplayUrl(assets: Map<string, Uint8Array>, localPath: string): string {
  const repoPath = repoPathFor(localPath);
  const bytes = repoPath ? assets.get(repoPath) : undefined;
  if (!bytes) {
    return `fake-display-url:${localPath}`;
  }
  return `data:${mimeForPath(localPath)};base64,${bytesToBase64(bytes)}`;
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
      return fakeDisplayUrl(assets, localPath);
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
