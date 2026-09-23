// @vitest-environment jsdom
// ABOUTME: Hiding the sidebar (⌃⌘S / the toolbar toggle) removes it from the
// ABOUTME: macOS layout; other platforms always show their sidebar.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
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

it("removes the sidebar on macOS when it's hidden, and brings it back", () => {
  const store = renderShell("macos");
  expect(document.querySelector("nav.sidebar")).not.toBeNull();

  act(() => store.getState().toggleSidebar());
  expect(document.querySelector("nav.sidebar")).toBeNull();
  expect(document.querySelector(".app-shell")?.getAttribute("data-sidebar")).toBe("hidden");

  act(() => store.getState().toggleSidebar());
  expect(document.querySelector("nav.sidebar")).not.toBeNull();
});

it("keeps the sidebar elsewhere, whatever the flag says", () => {
  const store = renderShell("web");
  act(() => store.getState().toggleSidebar());
  expect(document.querySelector("nav.sidebar")).not.toBeNull();
});
