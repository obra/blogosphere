// @vitest-environment jsdom
// ABOUTME: macOS: a failed autosave is shown by the editor (once, persistently)
// ABOUTME: instead of an alert per typing burst, and clears when a save lands.
import { expect, it, vi } from "vitest";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

const entry = makeEntry({ path: "content/drafts/2026-03-04-one.md", kind: "draft" });

it("records the failure for its entry, raises no alert, and clears on the next save", async () => {
  const { services } = buildFakeServices({
    seedEntries: [entry],
    shellOptions: { platform: "macos" },
  });
  const alert = vi.fn(() => Promise.resolve(false));
  const store = createAppStore(services, { alert, windowFocused: () => true, editDebounceMs: 0 });
  await store.getState().refresh();

  const { upsertEntry } = services.store;
  services.store.upsertEntry = () => Promise.reject(new Error("disk full"));
  store.getState().edit(entry.path, { kind: "body", body: "one" });
  await vi.waitFor(() => expect(store.getState().saveFailure?.path).toBe(entry.path));
  expect(store.getState().saveFailure?.message).toBe("Couldn't save your changes.");
  expect(alert).not.toHaveBeenCalled();

  services.store.upsertEntry = upsertEntry;
  store.getState().edit(entry.path, { kind: "body", body: "two" });
  await vi.waitFor(() => expect(store.getState().saveFailure).toBeNull());
});
