// @vitest-environment jsdom
// ABOUTME: SyncLogPanel — renders the activity log newest-first with level
// ABOUTME: styling and detail, and closes cleanly.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ServicesProvider } from "./ServicesContext";
import { SyncLogPanel } from "./SyncLogPanel";
import { AppStoreProvider, createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

const EMPTY_STATE_PATTERN = /Nothing yet/;

afterEach(() => {
  cleanup();
});

function renderPanel() {
  const fake = buildFakeServices();
  const store = createAppStore(fake.services);
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <SyncLogPanel />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  return { store, ...fake };
}

it("renders nothing until opened", () => {
  renderPanel();
  expect(screen.queryByRole("dialog", { name: "Activity log" })).toBeNull();
});

it("shows log entries newest-first with their detail", () => {
  const { store, sync } = renderPanel();
  act(() => {
    sync?.emitLog({ at: 1000, level: "info", message: "Older entry" });
    sync?.emitLog({
      at: 2000,
      level: "error",
      message: "Won't push content/drafts/bad.md: missing required field: title",
      detail: "content/drafts/bad.md",
    });
    store.getState().openSyncLog();
  });

  const rows = document.body.querySelectorAll(".sync-log-row");
  expect(rows).toHaveLength(2);
  expect(rows[0]?.textContent).toContain("Won't push");
  expect(rows[0]?.getAttribute("data-level")).toBe("error");
  expect(rows[1]?.textContent).toContain("Older entry");
  expect(screen.getByText("content/drafts/bad.md")).not.toBeNull();
});

it("shows an empty-state hint and a Sync now button", () => {
  const { store, sync } = renderPanel();
  act(() => {
    store.getState().openSyncLog();
  });

  expect(screen.getByText(EMPTY_STATE_PATTERN)).not.toBeNull();

  fireEvent.click(screen.getByText("Sync now"));
  expect(sync?.syncCallCount()).toBe(1);
});

it("the close button closes the panel", () => {
  const { store, sync } = renderPanel();
  act(() => {
    sync?.emitLog({ at: 1, level: "info", message: "hello" });
    store.getState().openSyncLog();
  });

  fireEvent.click(screen.getByLabelText("Close activity log"));

  expect(store.getState().syncLogOpen).toBe(false);
  expect(screen.queryByRole("dialog", { name: "Activity log" })).toBeNull();
});
