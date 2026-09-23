// ABOUTME: The macOS Settings window's entry point. It only exists on macOS
// ABOUTME: (settings.html sets data-platform), so there's no platform probe here.
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { v4 as uuidv4 } from "uuid";
import { createSettingsClient } from "./client";
import { SettingsWindow } from "./SettingsWindow";
import { tauriTransport } from "./tauriTransport";
import "../ui/app/app.css";

/** Matches open_settings's width; only the height follows the content. */
const WINDOW_WIDTH = 500;

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}

const client = createSettingsClient(tauriTransport, { createId: () => uuidv4() });

/** Makes the page's viewport exactly `height` tall. The size Tauri sets
 *  (and reports) includes the title bar the webview sits below, so the
 *  difference between it and the page's own viewport is added on. */
async function fitWindow(height: number): Promise<void> {
  const tauriWindow = getCurrentWindow();
  const [size, scale] = await Promise.all([tauriWindow.innerSize(), tauriWindow.scaleFactor()]);
  const titleBar = size.height / scale - globalThis.innerHeight;
  await tauriWindow.setSize(new LogicalSize(WINDOW_WIDTH, height + titleBar));
}

createRoot(container).render(
  <StrictMode>
    <SettingsWindow
      client={client}
      onContentHeight={(height) => {
        fitWindow(height).catch(() => undefined);
      }}
    />
  </StrictMode>,
);
