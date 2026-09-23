// @vitest-environment jsdom
// ABOUTME: detectPlatform / applyPlatformAttribute — the pre-render platform
// ABOUTME: probe that picks the Mac look, with a safe "web" fallback.
import { describe, expect, it, vi } from "vitest";
import {
  applyGlassAttribute,
  applyPlatformAttribute,
  detectGlass,
  detectPlatform,
} from "./platform";

describe("detectPlatform", () => {
  it("is web outside Tauri, without calling the bridge", async () => {
    const invoke = vi.fn();
    expect(await detectPlatform({ isTauri: () => false, invoke })).toBe("web");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks the Rust side inside Tauri", async () => {
    const invoke = vi.fn().mockResolvedValue("macos");
    expect(await detectPlatform({ isTauri: () => true, invoke })).toBe("macos");
    expect(invoke).toHaveBeenCalledWith("current_platform");
  });

  it("maps desktop platforms we don't style natively to web", async () => {
    const invoke = vi.fn().mockResolvedValue("windows");
    expect(await detectPlatform({ isTauri: () => true, invoke })).toBe("web");
  });

  it("falls back to web, and says so, when the command fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const invoke = vi.fn().mockRejectedValue(new Error("bridge not ready"));
    expect(await detectPlatform({ isTauri: () => true, invoke })).toBe("web");
    expect(warn).toHaveBeenCalledWith(
      "current_platform failed; using the web look",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});

describe("applyPlatformAttribute", () => {
  it("writes data-platform on the root element", () => {
    const root = document.createElement("html");
    applyPlatformAttribute(root, "macos");
    expect(root.getAttribute("data-platform")).toBe("macos");
  });
});

describe("detectGlass", () => {
  it("is off off macOS, without asking", async () => {
    const invoke = vi.fn();
    expect(await detectGlass("web", invoke)).toBe(false);
    expect(await detectGlass("ios", invoke)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks Rust on macOS", async () => {
    const invoke = vi.fn().mockResolvedValue(true);
    expect(await detectGlass("macos", invoke)).toBe(true);
    expect(invoke).toHaveBeenCalledWith("glass_active");
  });

  it("treats a failed or odd answer as off (opaque is always safe)", async () => {
    expect(await detectGlass("macos", vi.fn().mockRejectedValue(new Error("no")))).toBe(false);
    expect(await detectGlass("macos", vi.fn().mockResolvedValue("yes"))).toBe(false);
  });
});

describe("applyGlassAttribute", () => {
  it("writes data-glass on the root element", () => {
    const root = document.createElement("html");
    applyGlassAttribute(root, true);
    expect(root.getAttribute("data-glass")).toBe("on");
    applyGlassAttribute(root, false);
    expect(root.getAttribute("data-glass")).toBe("off");
  });
});
