// ABOUTME: entryMenuState (menuState.ts) — the pure half of the Entry menu: which record the
// ABOUTME: menu bar's entry commands act on, and its live URL.
import { expect, it } from "vitest";
import { entryMenuState } from "./menuState";
import { makeEntry, makeRaw } from "./testing/builders";
import { createFakeModel } from "./testing/fakeModel";

const model = createFakeModel();

const NO_MODAL = {
  publishDialogOpen: false,
  newLinkDialogOpen: false,
  versionsPath: null,
  conflictSheetPath: null,
  quickOpenOpen: false,
  settingsOpen: false,
};

const POST = makeEntry({
  path: "content/blog/2026/2026-01-01-a.md",
  kind: "post",
  baseSha: "sha",
  baseContent: makeRaw({ title: "Test title", date: "2026-01-01" }),
});

it("nothing selected: no record, no URL", () => {
  expect(entryMenuState({ ...NO_MODAL, entries: [POST], selectedPath: null }, model)).toEqual({
    record: null,
    liveUrl: null,
  });
});

it("a selected post: that record and its live URL", () => {
  expect(entryMenuState({ ...NO_MODAL, entries: [POST], selectedPath: POST.path }, model)).toEqual({
    record: POST,
    liveUrl: "https://blog.fsck.com/2026/01/01/a/",
  });
});

it("a selection that isn't in the list (just deleted): no record", () => {
  expect(entryMenuState({ ...NO_MODAL, entries: [], selectedPath: POST.path }, model)).toEqual({
    record: null,
    liveUrl: null,
  });
});

it("a sheet or other modal is up: no record, so the Entry menu greys out", () => {
  const state = {
    entries: [POST],
    selectedPath: POST.path,
    publishDialogOpen: true,
    newLinkDialogOpen: false,
    versionsPath: null,
    conflictSheetPath: null,
    quickOpenOpen: false,
    settingsOpen: false,
  };
  expect(entryMenuState(state, model)).toEqual({ record: null, liveUrl: null });
  expect(
    entryMenuState({ ...state, publishDialogOpen: false, quickOpenOpen: true }, model),
  ).toEqual({ record: null, liveUrl: null });
});
