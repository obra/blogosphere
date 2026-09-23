// ABOUTME: symbolCache — one render per (name, size, weight, scale), and a
// ABOUTME: failed symbol falls back quietly with exactly one warning per name.
import { describe, expect, it, vi } from "vitest";
import { createSymbolCache } from "./symbolCache";

const IMAGE = { dataUrl: "data:image/png;base64,AAAA", width: 16, height: 15 };

describe("createSymbolCache", () => {
  it("renders each (name, size, weight, scale) once", async () => {
    const render = vi.fn().mockResolvedValue(IMAGE);
    const cache = createSymbolCache(render, vi.fn());
    expect(await cache.get("clock", 14, "regular", 2)).toEqual(IMAGE);
    await cache.get("clock", 14, "regular", 2);
    await cache.get("clock", 14, "regular", 1);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("returns null for a failed symbol and warns once per name", async () => {
    const render = vi.fn().mockResolvedValue(null);
    const warn = vi.fn();
    const cache = createSymbolCache(render, warn);
    expect(await cache.get("nope", 14, "regular", 2)).toBeNull();
    expect(await cache.get("nope", 16, "regular", 2)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("SF Symbol unavailable, using fallback icon: nope");
  });
});
