// ABOUTME: Pre-render platform probe: asks Rust which OS this is (Tauri) or
// ABOUTME: says "web" (and whether macOS glass is on), stamped on <html> for CSS.
import type { Platform } from "../shell/types";

interface PlatformProbeDeps {
  isTauri: () => boolean;
  invoke: (cmd: string) => Promise<unknown>;
}

const NATIVE_PLATFORMS: ReadonlySet<string> = new Set(["macos", "ios", "android"]);

function isNativePlatform(value: unknown): value is Platform {
  return typeof value === "string" && NATIVE_PLATFORMS.has(value);
}

/** Never rejects: a failed probe must not blank the window, so anything
 *  unexpected means "web" — today's non-Mac look. */
async function detectPlatform(deps: PlatformProbeDeps): Promise<Platform> {
  if (!deps.isTauri()) {
    return "web";
  }
  try {
    const reported = await deps.invoke("current_platform");
    return isNativePlatform(reported) ? reported : "web";
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: boot runs before any app logger exists; this is the only trace of a failed probe.
    console.warn("current_platform failed; using the web look", err);
    return "web";
  }
}

function applyPlatformAttribute(root: HTMLElement, platform: Platform): void {
  root.dataset.platform = platform;
}

/** Whether the macOS glass sidebar is on. Anything but a clear "yes" means
 *  off: an opaque sidebar is always safe, a transparent one over nothing is
 *  not. */
async function detectGlass(
  platform: Platform,
  invoke: PlatformProbeDeps["invoke"],
): Promise<boolean> {
  if (platform !== "macos") {
    return false;
  }
  try {
    return (await invoke("glass_active")) === true;
  } catch {
    return false;
  }
}

function applyGlassAttribute(root: HTMLElement, on: boolean): void {
  root.dataset.glass = on ? "on" : "off";
}

export {
  applyGlassAttribute,
  applyPlatformAttribute,
  detectGlass,
  detectPlatform,
  type PlatformProbeDeps,
};
