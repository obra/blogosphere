// @vitest-environment jsdom
// ABOUTME: The macOS toolbar row: the list side (search, compose, and the
// ABOUTME: sidebar toggle when the sidebar is hidden) and the sidebar's top bar.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import type { Platform } from "../../shell/types";
import { AppShell } from "./AppShell";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

afterEach(() => {
  cleanup();
});

function renderShell(platform: Platform) {
  const { services } = buildFakeServices({ shellOptions: { platform } });
  const store = createAppStore(services);
  render(
    <ServicesProvider services={services}>
      <AppStoreProvider store={store}>
        <AppShell />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  return store;
}

function listToolbar(): HTMLElement {
  const row = document.querySelector<HTMLElement>(".entry-list-pane .toolbar-row");
  if (!row) {
    throw new Error("no list toolbar row");
  }
  return row;
}

describe("macOS list toolbar", () => {
  it("is a draggable toolbar row holding search and compose", () => {
    renderShell("macos");
    const row = listToolbar();
    expect(row.getAttribute("data-tauri-drag-region")).toBe("deep");
    expect(row.querySelector('input[type="search"]')).not.toBeNull();
    expect(row.querySelector('button[aria-label="New Post"]')).not.toBeNull();
  });

  it("makes and selects a new draft from the compose button", async () => {
    const store = renderShell("macos");
    expect(store.getState().selectedPath).toBeNull();
    await act(async () => {
      fireEvent.click(within(listToolbar()).getByRole("button", { name: "New Post" }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const selected = store.getState().selectedPath;
    expect(selected).not.toBeNull();
    expect(store.getState().entries.find((entry) => entry.path === selected)?.kind).toBe("draft");
  });

  it("puts the sidebar toggle in the sidebar's top bar, or the list toolbar when hidden", () => {
    const store = renderShell("macos");
    const toggleIn = (selector: string) =>
      document.querySelector(
        `${selector} button[aria-label="Hide Sidebar"], ${selector} button[aria-label="Show Sidebar"]`,
      );
    expect(toggleIn(".sidebar .toolbar-row")).not.toBeNull();
    expect(toggleIn(".entry-list-pane .toolbar-row")).toBeNull();

    act(() => store.getState().toggleSidebar());
    expect(toggleIn(".entry-list-pane .toolbar-row")).not.toBeNull();
    expect(listToolbar().getAttribute("data-leading-inset")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Show Sidebar" }));
    expect(store.getState().sidebarHidden).toBe(false);
  });
});

describe("other platforms", () => {
  it("keep today's list header and sidebar", () => {
    renderShell("web");
    expect(document.querySelector(".toolbar-row")).toBeNull();
    expect(document.querySelector(".entry-list-search input")).not.toBeNull();
    expect(screen.getByText("New Post")).not.toBeNull();
  });
});
