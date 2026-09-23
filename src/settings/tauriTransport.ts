// ABOUTME: The settings protocol over Tauri events: emitTo a window by label,
// ABOUTME: and listen only to events sent to this window (or to every window).
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { SettingsTransport } from "./protocol";

const tauriTransport: SettingsTransport = {
  emitTo: (target, event, payload) => emitTo(target, event, payload),
  listen: (event, handler) =>
    getCurrentWebviewWindow().listen(event, (message) => handler(message.payload as never)),
};

export { tauriTransport };
