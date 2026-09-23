// ABOUTME: entryMenuState — the pure half of the Entry menu: which record the
// ABOUTME: menu bar's entry commands act on, and its live URL.
import { expect, it } from "vitest";
import { entryMenuState } from "./menu";
import { makeEntry, makeRaw } from "./testing/builders";
import { createFakeModel } from "./testing/fakeModel";

const model = createFakeModel();

const POST = makeEntry({
  path: "content/blog/2026/2026-01-01-a.md",
  kind: "post",
  baseSha: "sha",
  baseContent: makeRaw({ title: "Test title", date: "2026-01-01" }),
});

it("nothing selected: no record, no URL", () => {
  expect(entryMenuState({ entries: [POST], selectedPath: null }, model)).toEqual({
    record: null,
    liveUrl: null,
  });
});

it("a selected post: that record and its live URL", () => {
  expect(entryMenuState({ entries: [POST], selectedPath: POST.path }, model)).toEqual({
    record: POST,
    liveUrl: "https://blog.fsck.com/2026/01/01/a/",
  });
});

it("a selection that isn't in the list (just deleted): no record", () => {
  expect(entryMenuState({ entries: [], selectedPath: POST.path }, model)).toEqual({
    record: null,
    liveUrl: null,
  });
});
