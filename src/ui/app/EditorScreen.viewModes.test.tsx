// @vitest-environment jsdom
// ABOUTME: The editor screen publishes its three modes for View › ⌃⌘1–3: titles
// ABOUTME: that follow the entry, Live only with a live URL, and choosing works.
import { act, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import { EditorScreen } from "./EditorScreen";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";
import { getViewModes } from "./viewModes";

afterEach(cleanup);

const post = makeEntry({
  path: "content/blog/2026/2026-03-04-a.md",
  kind: "post",
  date: "2026-03-04",
  title: "A",
});
const draft = makeEntry({ path: "content/drafts/2026-03-05-d.md", kind: "draft", title: "D" });
const legacy = makeEntry({
  path: "content/blog/2004/2004-03-04-old.html",
  kind: "post",
  title: "Old",
});

async function show(path: string) {
  const rendered = renderWithStore(<EditorScreen />, { seedEntries: [post, draft, legacy] });
  await act(async () => {
    await rendered.store.getState().refresh();
    rendered.store.getState().select(path);
  });
  return rendered;
}

function segments() {
  return getViewModes()?.segments.map((s) => [s.title, s.enabled]);
}

it("a Markdown entry: Write, Markdown, Live", async () => {
  await show(post.path);
  expect(segments()).toEqual([
    ["Write", true],
    ["Markdown", true],
    ["Live", true],
  ]);
});

it("a draft nobody can reach yet: Live disabled", async () => {
  await show(draft.path);
  expect(segments()?.[2]).toEqual(["Live", false]);
});

it("a legacy HTML entry: Preview, HTML, Live", async () => {
  await show(legacy.path);
  expect(segments()?.map((s) => s[0])).toEqual(["Preview", "HTML", "Live"]);
});

it("choosing a segment switches the editor", async () => {
  await show(post.path);
  await act(async () => {
    getViewModes()?.choose(1);
    await Promise.resolve();
  });
  expect(document.querySelector(".editor-doc")?.getAttribute("data-editor-mode")).toBe("markdown");
});

it("nothing is published once the editor is gone", async () => {
  const { unmount } = await show(post.path);
  unmount();
  expect(getViewModes()).toBeNull();
});

it("Live, then back to Write, and Preview/HTML on a legacy entry", async () => {
  await show(post.path);
  await act(async () => {
    getViewModes()?.choose(2);
    await Promise.resolve();
  });
  expect(document.querySelector(".editor-doc")).toBeNull();
  await act(async () => {
    getViewModes()?.choose(0);
    await Promise.resolve();
  });
  expect(document.querySelector(".editor-doc")?.getAttribute("data-editor-mode")).toBe("write");
});

it("a legacy entry's HTML segment shows its source", async () => {
  await show(legacy.path);
  await act(async () => {
    getViewModes()?.choose(1);
    await Promise.resolve();
  });
  expect(document.querySelector(".editor-doc")?.getAttribute("data-editor-mode")).toBe("html");
});

it("an entry that can't be read offers no modes", async () => {
  const broken = {
    ...post,
    path: "content/blog/2026/2026-03-06-b.md",
    workingContent: "no fences",
  };
  const rendered = renderWithStore(<EditorScreen />, { seedEntries: [broken] });
  await act(async () => {
    await rendered.store.getState().refresh();
    rendered.store.getState().select(broken.path);
  });
  expect(getViewModes()?.segments.every((segment) => !segment.enabled)).toBe(true);
});

it("typing doesn't republish the modes (the menu stays untouched)", async () => {
  const { store } = await show(post.path);
  const published = getViewModes();
  await act(async () => {
    store.getState().edit(post.path, { kind: "body", body: "typing" });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(getViewModes()).toBe(published);
});
