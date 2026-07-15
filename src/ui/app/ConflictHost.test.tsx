// @vitest-environment jsdom
// ABOUTME: Tests for ConflictHost — "theirs" comes from the stashed
// ABOUTME: conflicting remote text (core/sync/meta.ts's ConflictRemote), not
// ABOUTME: the entry's stale baseContent, with baseContent as a last-resort
// ABOUTME: fallback when nothing was ever stashed for a path.
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { stashConflictRemote } from "../../core/sync/meta";
import { ConflictHost } from "./ConflictHost";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(() => {
  cleanup();
});

const PATH = "content/drafts/2026-01-01-a.md";

it("shows the stashed conflicting remote text as 'theirs', not the stale local baseContent", async () => {
  const entry = makeEntry({
    path: PATH,
    kind: "draft",
    workingContent: "my local version",
    baseContent: "the old shared base (stale)",
    dirty: true,
  });
  const { services, store } = renderWithStore(<ConflictHost />, {
    seedEntries: [entry],
    syncOptions: {
      status: { state: "conflict", pendingCount: 0, conflicts: [PATH], lastSyncAt: null },
    },
  });
  await stashConflictRemote(services.store, PATH, {
    sha: "deadbeef",
    text: "the real remote text",
  });
  await act(async () => {
    await store.getState().refresh();
  });

  await waitFor(() => {
    expect(screen.getByLabelText("Their version")).toHaveProperty("value", "the real remote text");
  });
  expect(screen.getByLabelText("Your version")).toHaveProperty("value", "my local version");
});

it("falls back to baseContent when a path was never stashed", async () => {
  const entry = makeEntry({
    path: PATH,
    kind: "draft",
    workingContent: "my local version",
    baseContent: "last-resort fallback text",
    dirty: true,
  });
  const { store } = renderWithStore(<ConflictHost />, {
    seedEntries: [entry],
    syncOptions: {
      status: { state: "conflict", pendingCount: 0, conflicts: [PATH], lastSyncAt: null },
    },
  });
  await act(async () => {
    await store.getState().refresh();
  });

  await waitFor(() => {
    expect(screen.getByLabelText("Their version")).toHaveProperty(
      "value",
      "last-resort fallback text",
    );
  });
});

it("renders nothing when there is no active conflict", async () => {
  const { store } = renderWithStore(<ConflictHost />, { seedEntries: [] });
  await act(async () => {
    await store.getState().refresh();
  });

  expect(screen.queryByRole("dialog")).toBeNull();
});

it("renders without an infinite-render loop when no sync is configured yet (no token)", async () => {
  // Regression test: a selector reading `state.syncStatus?.conflicts ?? []`
  // returns a fresh array every call once syncStatus is null (no token
  // saved yet — the ordinary first-run state), which zustand's
  // useSyncExternalStore reads as "changed" on every render and loops
  // forever. See state.types.ts's EMPTY_CONFLICTS.
  const { store } = renderWithStore(<ConflictHost />, { seedEntries: [], withSync: false });
  await act(async () => {
    await store.getState().refresh();
  });

  expect(screen.queryByRole("dialog")).toBeNull();
});
