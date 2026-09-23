// ABOUTME: Pre-render platform probe: asks Rust which OS this is (Tauri) or
// ABOUTME: says "web", then stamps it on <html> so CSS can scope the Mac look.
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

export { applyPlatformAttribute, detectPlatform, type PlatformProbeDeps };
