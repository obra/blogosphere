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

it("sync button opens Settings when no sync is configured — never a dead click", () => {
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
  const button = screen.getByTitle("Not connected — open Settings to connect");
  expect(button).toHaveProperty("disabled", false);
  expect(button.textContent).toContain("Not connected");

  fireEvent.click(button);
  expect(store.getState().settingsOpen).toBe(true);
});

it("the activity-log button opens the sync log panel", () => {
  const { store } = renderWithStore(<Sidebar />, { seedEntries: [] });
  fireEvent.click(screen.getByLabelText("Activity log"));
  expect(store.getState().syncLogOpen).toBe(true);
});

it("the gear opens Settings", () => {
  const { store } = renderWithStore(<Sidebar />, { seedEntries: [] });
  fireEvent.click(screen.getByLabelText("Settings"));
  expect(store.getState().settingsOpen).toBe(true);
});

it("focuses a section when it's clicked, so the sidebar shows the focused selection", () => {
  const { store } = renderWithStore(<Sidebar />, { seedEntries: [] });
  const posts = screen.getByText("Posts").closest("button");
  if (!posts) {
    throw new Error("Posts section not rendered");
  }
  fireEvent.click(posts);
  expect(document.activeElement).toBe(posts);
  expect(store.getState().section).toBe("posts");
});

it("on macOS is just the sections, each with an icon (compose and ⌘, replace the rest)", () => {
  renderWithStore(<Sidebar />, { seedEntries: [], shellOptions: { platform: "macos" } });
  expect(document.querySelector(".sidebar-brand")).toBeNull();
  expect(screen.queryByText("New Post")).toBeNull();
  expect(screen.queryByText("New Link")).toBeNull();
  expect(document.querySelector(".sidebar-footer")).toBeNull();
  expect(document.querySelectorAll(".sidebar-section-button .sidebar-section-icon")).toHaveLength(
    4,
  );
});

it("keeps its brand, New buttons, and footer elsewhere", () => {
  renderWithStore(<Sidebar />, { seedEntries: [] });
  expect(document.querySelector(".sidebar-brand")).not.toBeNull();
  expect(screen.getByText("New Post")).not.toBeNull();
  expect(document.querySelector(".sidebar-footer")).not.toBeNull();
  expect(document.querySelectorAll(".sidebar-section-icon")).toHaveLength(0);
});
