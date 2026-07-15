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
