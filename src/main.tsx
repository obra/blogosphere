// ABOUTME: App entry point — mounts the React tree into #root. Replaced only
// ABOUTME: incidentally as real wiring lands; keep this file boring.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import {
  applyGlassAttribute,
  applyPlatformAttribute,
  detectGlass,
  detectPlatform,
} from "./bootstrap/platform";
import "./ui/app/app.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}

// The platform decides which stylesheet tokens apply, so it must be on
// <html> before the first paint — otherwise the Mac look flashes in late.
// detectPlatform never rejects (it falls back to "web").
const probeInvoke = (cmd: string) => invoke(cmd);

async function start(mount: HTMLElement): Promise<void> {
  const platform = await detectPlatform({ isTauri, invoke: probeInvoke });
  const root = document.documentElement;
  applyPlatformAttribute(root, platform);
  // Glass state too: the sidebar may only go transparent once it's known.
  applyGlassAttribute(root, await detectGlass(platform, probeInvoke));
  if (platform === "macos") {
    // Reduce Transparency can change while the app runs; Rust re-applies
    // the effect and tells us.
    listen<boolean>("glass-changed", (event) => applyGlassAttribute(root, event.payload)).catch(
      () => undefined,
    );
  }
  createRoot(mount).render(
    <StrictMode>
      <App platform={platform} />
    </StrictMode>,
  );
}

start(container);
