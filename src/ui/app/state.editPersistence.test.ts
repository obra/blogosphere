// @vitest-environment jsdom
// ABOUTME: Crash-safety tests for the typing buffer: continuous typing must
// ABOUTME: reach local SQLite on a bounded clock, not only on a typing pause.
import { afterEach, expect, it, vi } from "vitest";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

const DEBOUNCE_MS = 400;
const MAX_UNCOMMITTED_MS = 2000;
const KEYSTROKE_GAP_MS = 100;
const BURST_KEYSTROKES = 30;

afterEach(() => {
  vi.useRealTimers();
});

/** Body text for the i-th keystroke, zero-padded so "keystroke-01" is never
 *  a substring of "keystroke-21" and the assertions stay unambiguous. */
function bodyAt(i: number): string {
  return `keystroke-${String(i).padStart(2, "0")}`;
}

it("continuous typing commits locally no later than editMaxUncommittedMs after the last commit", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  // Injected clock advanced in lockstep with the fake timers: the default
  // deps capture the real Date.now before useFakeTimers() could swap it,
  // which would leave the cap's elapsed-time reads frozen near zero.
  let clock = 0;
  const store = createAppStore(services, {
    editDebounceMs: DEBOUNCE_MS,
    editMaxUncommittedMs: MAX_UNCOMMITTED_MS,
    now: () => clock,
  });
  await store.getState().refresh();

  // Keystrokes 100ms apart never leave a 400ms gap, so the trailing debounce
  // timer resets forever and a hard kill mid-burst would lose everything
  // since the last commit. The cap must bound that window.
  vi.useFakeTimers();
  for (let i = 1; i <= BURST_KEYSTROKES; i += 1) {
    store.getState().edit(draft.path, { kind: "body", body: bodyAt(i) });
    clock += KEYSTROKE_GAP_MS;
    // biome-ignore lint/performance/noAwaitInLoops: keystrokes are a timed sequence — advancing the fake clock between them is the premise.
    await vi.advanceTimersByTimeAsync(KEYSTROKE_GAP_MS);
  }

  // Still mid-burst (last keystroke 100ms ago; debounce has not fired).
  const saved = await services.store.getEntry(draft.path);
  expect(saved?.workingContent).toContain("keystroke-");
  // The burst-start commit wrote keystroke-01; without a cap nothing newer
  // ever lands. The cap must have committed a later keystroke by now.
  expect(saved?.workingContent).not.toContain(bodyAt(1));
});

it("the trailing debounce still commits the final keystroke after the burst ends", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const store = createAppStore(services, {
    editDebounceMs: DEBOUNCE_MS,
    editMaxUncommittedMs: MAX_UNCOMMITTED_MS,
  });
  await store.getState().refresh();

  vi.useFakeTimers();
  for (let i = 1; i <= BURST_KEYSTROKES; i += 1) {
    store.getState().edit(draft.path, { kind: "body", body: bodyAt(i) });
    // biome-ignore lint/performance/noAwaitInLoops: keystrokes are a timed sequence — advancing the fake clock between them is the premise.
    await vi.advanceTimersByTimeAsync(KEYSTROKE_GAP_MS);
  }
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + KEYSTROKE_GAP_MS);

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.workingContent).toContain(bodyAt(BURST_KEYSTROKES));
});
