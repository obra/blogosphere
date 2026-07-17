// @vitest-environment jsdom
// ABOUTME: The phone shell: library ↔ editor stacking driven by selectedPath,
// ABOUTME: section chips, and the compact editor bar's Back + actions sheet.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../editor/jsdom-layout-shim";
import { MobileShell } from "./MobileShell";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

beforeEach(() => {
  // jsdom has no matchMedia; the editor chrome branches on it and these are
  // phone-shell tests, so report "compact" everywhere.
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const DRAFTS_TAB = /Drafts/;
const POSTS_TAB = /Posts/;
const TOKEN_TEXT = /token/i;

const DRAFT = makeEntry({
  path: "content/drafts/2026-01-01-a.md",
  kind: "draft",
  draft: true,
  title: "Phone Draft",
});

async function renderShell(withSync = true) {
  const fake = buildFakeServices({ seedEntries: [DRAFT], withSync });
  const store = createAppStore(fake.services, { confirm: () => true });
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <MobileShell />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await store.getState().refresh();
  });
  return { store, ...fake };
}

it("shows the library (chips + list + create bar) when nothing is selected", async () => {
  await renderShell();

  expect(screen.getByRole("tab", { name: DRAFTS_TAB })).not.toBeNull();
  expect(screen.getByText("Phone Draft")).not.toBeNull();
  expect(screen.getByText("New Post")).not.toBeNull();
  expect(screen.getByLabelText("Settings")).not.toBeNull();
});

it("section chips switch the section", async () => {
  const { store } = await renderShell();

  fireEvent.click(screen.getByRole("tab", { name: POSTS_TAB }));

  expect(store.getState().section).toBe("posts");
  expect(screen.getByRole("tab", { name: POSTS_TAB }).getAttribute("aria-selected")).toBe("true");
});

it("selecting an entry stacks into the full-screen editor; Back pops to the library", async () => {
  const { store } = await renderShell();

  await act(async () => {
    store.getState().select(DRAFT.path);
    await Promise.resolve();
  });
  expect(screen.getByLabelText("Back to the list")).not.toBeNull();
  expect(screen.queryByText("New Post")).toBeNull();

  fireEvent.click(screen.getByLabelText("Back to the list"));
  expect(store.getState().selectedPath).toBeNull();
  expect(screen.getByText("New Post")).not.toBeNull();
});

it("the ⋯ sheet lists the entry actions and runs one", async () => {
  const { store } = await renderShell();
  await act(async () => {
    store.getState().select(DRAFT.path);
    await Promise.resolve();
  });

  fireEvent.click(screen.getByLabelText("Entry actions"));
  expect(screen.getByRole("dialog", { name: "Entry actions" })).not.toBeNull();
  expect(screen.getByText("Publish…")).not.toBeNull();
  expect(screen.getByText("Create secret link")).not.toBeNull();
  expect(screen.getByText("Delete…")).not.toBeNull();

  fireEvent.click(screen.getByText("Publish…"));
  expect(store.getState().publishDialogOpen).toBe(true);
  expect(screen.queryByRole("dialog", { name: "Entry actions" })).toBeNull();
});

it("without a sync connection, the library shows the connect card instead of the list", async () => {
  await renderShell(false);

  expect(screen.getAllByText(TOKEN_TEXT).length).toBeGreaterThan(0);
  expect(screen.queryByText("Phone Draft")).toBeNull();
});
