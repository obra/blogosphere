// ABOUTME: Tauri-backed ShellApi — a thin translation layer over @tauri-apps/api and
// ABOUTME: the sql/http/fs/clipboard-manager plugins. Typechecked only; keep logic out.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir, dirname, join } from "@tauri-apps/api/path";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { exists, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { extractClipboardUrl } from "./clipboardUrl";
import type { Platform, ShellApi } from "./types";

/** Absolute path for a cached asset, mirroring the repo layout under assets/. */
async function assetAbsolutePath(repoPath: string): Promise<string> {
  const base = await appDataDir();
  return join(base, "assets", repoPath);
}

/**
 * ShellApi backed by the real Tauri runtime (keyring commands, sql/http/fs/
 * clipboard-manager plugins). All decision logic (URL gating, ...) lives in
 * sibling modules and is unit-tested there; this file only wires plugin
 * calls to the ShellApi contract, so it is verified by typechecking alone.
 */
export function createTauriShell(): ShellApi {
  return {
    platform(): Platform {
      // v0 targets macOS only (see the design doc's delivery order). Real OS
      // detection (via @tauri-apps/plugin-os) arrives with the iOS/Android phases.
      return "macos";
    },

    keychainGet(key) {
      return invoke<string | null>("keychain_get", { key });
    },
    keychainSet(key, value) {
      return invoke<void>("keychain_set", { key, value });
    },
    keychainDelete(key) {
      return invoke<void>("keychain_delete", { key });
    },

    // No share-target/extension inbox on desktop; the mobile phases add one.
    shareInboxList() {
      return Promise.resolve([]);
    },
    shareInboxAck() {
      return Promise.resolve();
    },

    async assetWrite(repoPath, bytes) {
      const absolutePath = await assetAbsolutePath(repoPath);
      await mkdir(await dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, bytes);
      return absolutePath;
    },
    assetRead(localPath) {
      return readFile(localPath);
    },
    async assetPathFor(repoPath) {
      const absolutePath = await assetAbsolutePath(repoPath);
      return (await exists(absolutePath)) ? absolutePath : null;
    },
    assetDisplayUrl(localPath) {
      return convertFileSrc(localPath);
    },

    async clipboardReadUrl() {
      try {
        return extractClipboardUrl(await readText());
      } catch {
        // Best-effort: an empty/unreadable clipboard is not an app error.
        return null;
      }
    },
  };
}
