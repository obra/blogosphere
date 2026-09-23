// @vitest-environment jsdom
// ABOUTME: <Icon> — SF Symbol mask on macOS when the OS renders it; Lucide on
// ABOUTME: other platforms and whenever the symbol isn't available.
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Platform, ShellApi } from "../../shell/types";
import { ServicesProvider } from "../app/ServicesContext";
import { buildFakeServices } from "../app/testing/fakes";
import { Icon } from "./Icon";
import { ICONS } from "./iconNames";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderIcon(node: ReactNode, platform: Platform, renderSymbol?: ShellApi["renderSymbol"]) {
  const { services } = buildFakeServices({
    shellOptions: renderSymbol ? { platform, renderSymbol } : { platform },
  });
  return render(<ServicesProvider services={services}>{node}</ServicesProvider>);
}

describe("Icon", () => {
  it("draws the Lucide icon on non-Apple platforms without asking for a symbol", () => {
    const renderSymbol = vi.fn();
    const { container } = renderIcon(<Icon name="versions" />, "android", renderSymbol);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(renderSymbol).not.toHaveBeenCalled();
  });

  it("uses the OS-rendered SF Symbol as a mask on macOS", async () => {
    const image = { dataUrl: "data:image/png;base64,QUJD", width: 15, height: 14 };
    const { container } = renderIcon(<Icon name="versions" size={14} />, "macos", () =>
      Promise.resolve(image),
    );
    await waitFor(() => {
      const mask = container.querySelector<HTMLElement>(".icon-symbol");
      expect(mask?.style.getPropertyValue("--icon-mask")).toBe(`url("${image.dataUrl}")`);
      // The box stays size x size (the mask is `contain`), so swapping the
      // placeholder for the symbol never shifts the toolbar.
      expect(mask?.style.width).toBe("14px");
      expect(mask?.style.height).toBe("14px");
    });
    expect(container.querySelector("svg")).toBeNull();
  });

  it("falls back to Lucide on macOS when the symbol can't be rendered, and says so once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { container } = renderIcon(<Icon name="openOnSite" />, "macos", () =>
      Promise.resolve(null),
    );
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(warn).toHaveBeenCalledWith(
      `SF Symbol unavailable, using fallback icon: ${ICONS.openOnSite.sfSymbol}`,
    );
  });

  it("re-renders the symbol when the window moves to a display with another scale", async () => {
    let listener: (() => void) | undefined;
    vi.stubGlobal("devicePixelRatio", 1);
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: (_type: string, cb: () => void) => {
        listener = cb;
      },
      removeEventListener: () => undefined,
    }));
    const renderSymbol = vi.fn(() =>
      Promise.resolve({ dataUrl: "data:image/png;base64,QUJD", width: 15, height: 14 }),
    );
    renderIcon(<Icon name="versions" />, "macos", renderSymbol);
    await waitFor(() =>
      expect(renderSymbol).toHaveBeenCalledWith("clock.arrow.circlepath", 14, "regular", 1),
    );

    vi.stubGlobal("devicePixelRatio", 2);
    act(() => listener?.());
    await waitFor(() =>
      expect(renderSymbol).toHaveBeenCalledWith("clock.arrow.circlepath", 14, "regular", 2),
    );
    vi.unstubAllGlobals();
  });

  it("is decorative: hidden from assistive tech", () => {
    const { container } = renderIcon(<Icon name="openOnSite" />, "web");
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(Object.keys(ICONS) as (keyof typeof ICONS)[])("renders %s on the web", (name) => {
    const { container } = renderIcon(<Icon name={name} />, "web");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
