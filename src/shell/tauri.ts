// ABOUTME: Tauri-backed ShellApi — a thin translation layer over @tauri-apps/api and
// ABOUTME: the sql/http/fs/clipboard-manager plugins. Typechecked only; keep logic out.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir, dirname, join } from "@tauri-apps/api/path";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { extractClipboardUrl } from "./clipboardUrl";
import type { PickedFile, Platform, ShellApi, SymbolImage, SymbolWeight } from "./types";

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
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

/** The system open panel for one image, then its bytes. */
async function pickImageFile(): Promise<PickedFile | null> {
  try {
    // The dialog plugin adds the picked path to the fs scope, so the read
    // below is allowed outside the app-data directory.
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
    });
    if (path === null) {
      return null;
    }
    return { bytes: await readFile(path), name: path.split("/").pop() ?? path };
  } catch {
    return null;
  }
}

async function renderSymbol(
  name: string,
  pointSize: number,
  weight: SymbolWeight,
  scale: number,
): Promise<SymbolImage | null> {
  try {
    const out = await invoke<{ pngBase64: string; width: number; height: number }>(
      "render_symbol",
      { name, pointSize, weight, scale },
    );
    return {
      dataUrl: `data:image/png;base64,${out.pngBase64}`,
      width: out.width,
      height: out.height,
    };
  } catch {
    // Unknown symbol, older macOS, or not an Apple platform: the caller
    // draws its fallback icon instead.
    return null;
  }
}

async function openSettingsWindow(): Promise<void> {
  await invoke("open_settings").catch(() => undefined);
}

export function createTauriShell(platform: Platform): ShellApi {
  return {
    platform(): Platform {
      return platform;
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

    renderSymbol,

    pickImage: pickImageFile,
    openSettingsWindow,

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
