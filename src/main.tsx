// ABOUTME: App entry point — mounts the React tree into #root. Replaced only
// ABOUTME: incidentally as real wiring lands; keep this file boring.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyPlatformAttribute, detectPlatform } from "./bootstrap/platform";
import "./ui/app/app.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}

// The platform decides which stylesheet tokens apply, so it must be on
// <html> before the first paint — otherwise the Mac look flashes in late.
// detectPlatform never rejects (it falls back to "web").
detectPlatform({ isTauri, invoke: (cmd) => invoke(cmd) }).then((platform) => {
  applyPlatformAttribute(document.documentElement, platform);
  createRoot(container).render(
    <StrictMode>
      <App platform={platform} />
    </StrictMode>,
  );
});
