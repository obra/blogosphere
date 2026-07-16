// @vitest-environment jsdom
// ABOUTME: Tests for the sidebar footer — the sync button triggers a sync (not
// ABOUTME: Settings), disables when unconfigured, and the gear opens Settings.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ServicesProvider } from "./ServicesContext";
import { Sidebar } from "./Sidebar";
import { AppStoreProvider, createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(() => {
  cleanup();
});

it("sync button calls sync.sync(), not Settings", () => {
  const { services, store } = renderWithStore(<Sidebar />, { seedEntries: [] });
  const { sync } = services;
  if (!sync) {
    throw new Error("fake services should include sync");
  }
  const spy = vi.spyOn(sync, "sync");
  fireEvent.click(screen.getByTitle("Sync now (⌘R)"));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(store.getState().settingsOpen).toBe(false);
});

it("sync button is disabled with helper copy when no sync is configured", () => {
  const fake = buildFakeServices({ seedEntries: [] });
  const tokenless = { ...fake.services, sync: null };
  const store = createAppStore(tokenless);
  render(
    <ServicesProvider services={tokenless}>
      <AppStoreProvider store={store}>
        <Sidebar />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  const button = screen.getByTitle("Connect to your blog to sync");
  expect(button).toHaveProperty("disabled", true);
  expect(button.textContent).toContain("Not connected");
});

it("the gear opens Settings", () => {
  const { store } = renderWithStore(<Sidebar />, { seedEntries: [] });
  fireEvent.click(screen.getByLabelText("Settings"));
  expect(store.getState().settingsOpen).toBe(true);
});
