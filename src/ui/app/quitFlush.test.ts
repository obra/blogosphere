// @vitest-environment jsdom
// ABOUTME: Tests for handleCloseRequested — the flush-before-quit safety
// ABOUTME: net wired into AppShell's onCloseRequested handler.
import { expect, it, vi } from "vitest";
import { handleCloseRequested } from "./quitFlush";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

it("flushes a still-debounced edit, then force-closes, even though the immediate close is prevented", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, { editDebounceMs: 10_000 });
  await store.getState().refresh();
  store.getState().edit(draft.path, { kind: "body", body: "Typed right before Cmd-Q." });

  const preventDefault = vi.fn();
  const destroy = vi.fn().mockResolvedValue(undefined);

  await handleCloseRequested(store, { preventDefault }, { destroy });

  expect(preventDefault).toHaveBeenCalledTimes(1);
  const saved = await services.store.getEntry(draft.path);
  expect(saved?.workingContent).toContain("Typed right before Cmd-Q.");
  // destroy() must only run *after* the flush above already awaited.
  expect(destroy).toHaveBeenCalledTimes(1);
});

it("still force-closes when nothing was pending", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const preventDefault = vi.fn();
  const destroy = vi.fn().mockResolvedValue(undefined);

  await handleCloseRequested(store, { preventDefault }, { destroy });

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledTimes(1);
});

it("closes the Settings window too, after the flush and before the main window", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);
  const order: string[] = [];
  const settings = {
    destroy: vi.fn(() => Promise.resolve(order.push("settings")).then(() => undefined)),
  };
  const main = { destroy: vi.fn(() => Promise.resolve(order.push("main")).then(() => undefined)) };

  await handleCloseRequested(store, { preventDefault: vi.fn() }, main, () =>
    Promise.resolve(settings),
  );

  expect(order).toEqual(["settings", "main"]);
});

it("still closes the main window when Settings isn't open, or won't close", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);
  const main = { destroy: vi.fn().mockResolvedValue(undefined) };
  await handleCloseRequested(store, { preventDefault: vi.fn() }, main, () => Promise.resolve(null));
  const stuck = { destroy: vi.fn().mockRejectedValue(new Error("gone")) };
  await handleCloseRequested(store, { preventDefault: vi.fn() }, main, () =>
    Promise.resolve(stuck),
  );
  await handleCloseRequested(store, { preventDefault: vi.fn() }, main, () =>
    Promise.reject(new Error("no IPC")),
  );
  expect(main.destroy).toHaveBeenCalledTimes(3);
});
