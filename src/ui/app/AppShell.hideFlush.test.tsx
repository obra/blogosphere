// @vitest-environment jsdom
// ABOUTME: Backgrounding the app (visibilitychange -> hidden) must flush the
// ABOUTME: debounced typing buffer to SQLite: on mobile, hidden is the last
// ABOUTME: reliable moment before the OS may kill the process outright.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import { AppShell } from "./AppShell";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

/** Long enough that the trailing debounce cannot fire during the test —
 *  only the hidden-flush can explain the edit reaching the store. */
const NEVER_FIRES_DEBOUNCE_MS = 60_000;

afterEach(() => {
  cleanup();
});

function withVisibilityState(state: DocumentVisibilityState, run: () => Promise<void>) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  return run().finally(() => {
    Reflect.deleteProperty(document, "visibilityState");
  });
}

it("going hidden flushes the pending edit to the local store", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const fake = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(fake.services, { editDebounceMs: NEVER_FIRES_DEBOUNCE_MS });
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <AppShell />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await store.getState().refresh();
  // Two keystrokes: the first is a burst-start, which edit() already commits
  // immediately on its own. The second sits purely in the debounce buffer —
  // only the hidden-flush (or the never-firing debounce) can persist it.
  store.getState().edit(draft.path, { kind: "body", body: "typed then" });
  store.getState().edit(draft.path, { kind: "body", body: "typed then backgrounded" });

  await withVisibilityState("hidden", async () => {
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
  });

  const saved = await fake.services.store.getEntry(draft.path);
  expect(saved?.workingContent).toContain("typed then backgrounded");
});
