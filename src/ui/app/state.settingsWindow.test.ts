// ABOUTME: openSettings: on macOS it opens (or focuses) the Settings window;
// ABOUTME: everywhere else it opens the in-window Settings modal as before.
import { expect, it } from "vitest";
import { createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

it("macOS: asks the shell for the Settings window, no modal", () => {
  const { services, shell } = buildFakeServices({ shellOptions: { platform: "macos" } });
  const store = createAppStore(services);
  store.getState().openSettings();
  expect(shell.settingsWindowOpens()).toBe(1);
  expect(store.getState().settingsOpen).toBe(false);
});

it("macOS: opens even while a sheet is up (it's its own window)", () => {
  const { services, shell } = buildFakeServices({ shellOptions: { platform: "macos" } });
  const store = createAppStore(services);
  store.getState().openNewLinkDialog();
  store.getState().openSettings();
  expect(shell.settingsWindowOpens()).toBe(1);
});

it("elsewhere: the modal", () => {
  const { services, shell } = buildFakeServices();
  const store = createAppStore(services);
  store.getState().openSettings();
  expect(store.getState().settingsOpen).toBe(true);
  expect(shell.settingsWindowOpens()).toBe(0);
});
