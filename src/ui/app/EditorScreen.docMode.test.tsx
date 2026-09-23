// @vitest-environment jsdom
// ABOUTME: The editor document says which mode it shows (write, markdown, html),
// ABOUTME: so the Write-mode typography can't leak into the others.
import { act, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import { EditorScreen } from "./EditorScreen";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

const post = makeEntry({ path: "content/blog/2026/2026-03-04-a.md", kind: "post", title: "A" });
const legacy = makeEntry({
  path: "content/blog/2004/2004-03-04-old.html",
  kind: "post",
  title: "Old",
});

async function renderSelected(path: string) {
  const rendered = renderWithStore(<EditorScreen />, { seedEntries: [post, legacy] });
  await act(async () => {
    await rendered.store.getState().refresh();
    rendered.store.getState().select(path);
  });
  return rendered;
}

function docMode(): string | null {
  return document.querySelector(".editor-doc")?.getAttribute("data-editor-mode") ?? null;
}

it("write, then markdown when switched", async () => {
  const { store } = await renderSelected(post.path);
  expect(docMode()).toBe("write");
  await act(async () => {
    await store.getState().setEditorMode(post.path, "source");
  });
  expect(docMode()).toBe("markdown");
});

it("html for a legacy entry's source", async () => {
  await renderSelected(legacy.path);
  // Legacy entries open in Preview; the doc (and its mode) shows in HTML view.
  const html = [...document.querySelectorAll("button")].find((b) => b.textContent === "HTML");
  act(() => html?.click());
  expect(docMode()).toBe("html");
});
