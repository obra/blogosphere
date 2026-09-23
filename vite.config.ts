// ABOUTME: Vite build/dev-server config. Tuned for the Tauri shell (fixed port,
// ABOUTME: ignores src-tauri/inspo, exposes TAURI_ENV_* to import.meta.env).
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Set by `tauri dev` when running against a remote/mobile device; unused on desktop.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Prevent Vite from obscuring Rust errors in the Tauri terminal.
  clearScreen: false,
  server: {
    // Must match `build.devUrl` in src-tauri/tauri.conf.json.
    port: 5173,
    strictPort: true,
    host: host ?? false,
    // Omit `hmr` entirely rather than setting it to `undefined`: Vite's
    // `HmrOptions` type doesn't include `undefined`, and exactOptionalPropertyTypes
    // treats "present with value undefined" differently from "absent".
    ...(host
      ? {
          hmr: {
            protocol: "ws" as const,
            host,
            port: 5174,
          },
        }
      : {}),
    watch: {
      // src-tauri: Rust build noise. inspo: read-only reference checkouts (own git repos).
      ignored: ["**/src-tauri/**", "**/inspo/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Tauri uses Chromium on Windows, WebKit on macOS/Linux.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    // Vite 8 defaults to the Oxc minifier; "esbuild" would need esbuild as a
    // separate devDependency, which we don't otherwise need.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    // Two pages: the app, and the macOS Settings window (open_settings).
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        settings: fileURLToPath(new URL("settings.html", import.meta.url)),
      },
    },
  },
});
