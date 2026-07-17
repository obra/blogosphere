// ABOUTME: Open a URL in the user's default browser — Tauri's opener plugin
// ABOUTME: in the app (webviews can't spawn browser windows), window.open in dev.
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    await openUrl(url).catch(() => undefined);
    return;
  }
  globalThis.window.open(url, "_blank", "noopener");
}

export { openExternal };
