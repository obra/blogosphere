// ABOUTME: menuEnabledState — the pure half of the native menu: which
// ABOUTME: selection-dependent commands are enabled for a given app state.
import { expect, it } from "vitest";
import { menuEnabledState } from "./menu";
import { makeEntry, makeRaw } from "./testing/builders";

const CLEAN = makeEntry({
  path: "content/blog/2026/2026-01-01-a.md",
  kind: "post",
  baseSha: "sha",
  baseContent: makeRaw({ title: "Test title", date: "2026-01-01" }),
});

it("nothing selected: every entry command disabled", () => {
  const flags = menuEnabledState({ entries: [CLEAN], selectedPath: null });
  expect(flags).toEqual({ hasSelection: false, canDiscard: false });
});

it("clean entry selected: entry commands enabled, discard not", () => {
  const flags = menuEnabledState({ entries: [CLEAN], selectedPath: CLEAN.path });
  expect(flags).toEqual({ hasSelection: true, canDiscard: false });
});

it("dirty entry with a synced base: discard enabled", () => {
  const dirty = { ...CLEAN, dirty: true };
  const flags = menuEnabledState({ entries: [dirty], selectedPath: dirty.path });
  expect(flags).toEqual({ hasSelection: true, canDiscard: true });
});

it("dirty entry that was never synced: discard stays disabled", () => {
  const fresh = makeEntry({
    path: "content/drafts/2026-01-01-new.md",
    kind: "draft",
    draft: true,
    dirty: true,
  });
  const flags = menuEnabledState({ entries: [fresh], selectedPath: fresh.path });
  expect(flags).toEqual({ hasSelection: true, canDiscard: false });
});
