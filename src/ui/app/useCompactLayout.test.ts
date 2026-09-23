// @vitest-environment jsdom
// ABOUTME: useCompactLayout — the phone/desktop breakpoint hook. jsdom has no
// ABOUTME: matchMedia, so these tests install a controllable stub.
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { COMPACT_LAYOUT_QUERY, useCompactLayout } from "./useCompactLayout";

type Listener = (event: { matches: boolean }) => void;

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<Listener>();
  let matches = initialMatches;
  const mql = {
    get matches() {
      return matches;
    },
    media: COMPACT_LAYOUT_QUERY,
    addEventListener: (_type: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_type: string, cb: Listener) => listeners.delete(cb),
  };
  vi.stubGlobal("matchMedia", () => mql);
  return {
    setMatches(next: boolean) {
      matches = next;
      for (const cb of listeners) {
        cb({ matches: next });
      }
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("reports compact when the media query matches", () => {
  installMatchMedia(true);
  const { result } = renderHook(() => useCompactLayout("web"));
  expect(result.current).toBe(true);
});

it("tracks live viewport changes (rotation, window resize)", () => {
  const media = installMatchMedia(false);
  const { result } = renderHook(() => useCompactLayout("web"));
  expect(result.current).toBe(false);

  act(() => media.setMatches(true));
  expect(result.current).toBe(true);
});

it("cleans up its listener on unmount", () => {
  const media = installMatchMedia(false);
  const { unmount } = renderHook(() => useCompactLayout("web"));
  expect(media.listenerCount()).toBe(1);
  unmount();
  expect(media.listenerCount()).toBe(0);
});

it("defaults to desktop when matchMedia is unavailable (jsdom, old webviews)", () => {
  vi.stubGlobal("matchMedia", undefined);
  const { result } = renderHook(() => useCompactLayout("web"));
  expect(result.current).toBe(false);
});

it("never reports compact on macOS, even when the viewport is narrow", () => {
  const media = installMatchMedia(true);
  const { result } = renderHook(() => useCompactLayout("macos"));
  expect(result.current).toBe(false);

  act(() => media.setMatches(true));
  expect(result.current).toBe(false);
});
