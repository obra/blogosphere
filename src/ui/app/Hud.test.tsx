// @vitest-environment jsdom
// ABOUTME: The macOS HUD: shows the current notice, clears itself after 2s (4s
// ABOUTME: for long messages), and a newer notice restarts the clock.
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hud } from "./Hud";
import { hudDuration } from "./hudDuration";
import { renderWithStore } from "./testing/renderWithStore";

describe("hudDuration", () => {
  it("is 2s, or 4s for messages over 60 characters", () => {
    expect(hudDuration("Saved.")).toBe(2000);
    expect(hudDuration("x".repeat(60))).toBe(2000);
    expect(hudDuration("x".repeat(61))).toBe(4000);
  });
});

describe("Hud", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function renderHud() {
    return renderWithStore(<Hud />, {
      shellOptions: { platform: "macos" },
      storeOverrides: { windowFocused: () => true },
    });
  }

  it("shows the notice as a status, then clears it", () => {
    const { store } = renderHud();
    act(() => {
      store.getState().addToast({ tone: "info", message: "Saved." });
    });
    expect(screen.getByRole("status").textContent).toBe("Saved.");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(store.getState().hud).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a newer notice restarts the clock", () => {
    const { store } = renderHud();
    act(() => {
      store.getState().addToast({ tone: "info", message: "Saved." });
    });
    act(() => {
      vi.advanceTimersByTime(1500);
      store.getState().addToast({ tone: "success", message: "Published." });
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("status").textContent).toBe("Published.");
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
