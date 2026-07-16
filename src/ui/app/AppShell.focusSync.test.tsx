// @vitest-environment jsdom
// ABOUTME: The window-focus resync must be pull-only: it exists to pick up
// ABOUTME: external repo edits, and a push would deploy unfinished local work.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import { AppShell } from "./AppShell";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

const FOCUS_DEBOUNCE_MARGIN_MS = 900;

afterEach(() => {
  cleanup();
});

it("window focus pulls remote changes but never pushes", async () => {
  const fake = buildFakeServices();
  const store = createAppStore(fake.services);
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <AppShell />
      </AppStoreProvider>
    </ServicesProvider>,
  );

  await act(async () => {
    globalThis.window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, FOCUS_DEBOUNCE_MARGIN_MS));
  });

  expect(fake.sync?.pullCallCount()).toBeGreaterThan(0);
  expect(fake.sync?.syncCallCount()).toBe(0);
});
