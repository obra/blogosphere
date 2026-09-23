// @vitest-environment jsdom
// ABOUTME: The macOS editor side of the toolbar row: present in every detail
// ABOUTME: state (with the sync symbol), and trimmed to mode/status/Publish/"…".
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import type { EntryRecord } from "../../core/store/types";
import type { Platform } from "../../shell/types";
import { AppShell } from "./AppShell";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

afterEach(() => {
  cleanup();
});

async function renderShell(
  platform: Platform,
  options: { entries?: EntryRecord[]; select?: string; withSync?: boolean } = {},
) {
  const { services } = buildFakeServices({
    shellOptions: { platform },
    seedEntries: options.entries ?? [],
    ...(options.withSync === false ? { withSync: false } : {}),
  });
  const store = createAppStore(services);
  render(
    <ServicesProvider services={services}>
      <AppStoreProvider store={store}>
        <AppShell />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await store.getState().refresh();
    if (options.select) {
      store.getState().select(options.select);
    }
  });
  return store;
}

function detailRow(): HTMLElement {
  const row = document.querySelector<HTMLElement>(".detail-pane .toolbar-row");
  if (!row) {
    throw new Error("no detail toolbar row");
  }
  return row;
}

const draft = makeEntry({
  path: "content/drafts/d.md",
  kind: "draft",
  draft: true,
  title: "A draft",
});
const post = makeEntry({ path: "content/blog/2026/p.md", kind: "post", title: "A post" });
const broken = { ...post, path: "content/blog/2026/broken.md", workingContent: "no front matter" };

describe("macOS detail toolbar row", () => {
  it("exists with the sync symbol when nothing is selected", async () => {
    await renderShell("macos");
    expect(detailRow().querySelector(".sync-status-button")).not.toBeNull();
    expect(document.querySelectorAll(".sync-status-button")).toHaveLength(1);
  });

  it("exists on the first-run connect screen", async () => {
    await renderShell("macos", { withSync: false });
    expect(detailRow().querySelector(".sync-status-button")).not.toBeNull();
  });

  it("exists when an entry can't be parsed", async () => {
    await renderShell("macos", { entries: [broken], select: broken.path });
    expect(detailRow().querySelector(".sync-status-button")).not.toBeNull();
    expect(document.body.textContent).toContain("Couldn't read this entry's front matter.");
  });

  it("shows mode, status, Publish, and the … menu for a draft — nothing else", async () => {
    await renderShell("macos", { entries: [draft], select: draft.path });
    const row = detailRow();
    expect(row.getAttribute("data-tauri-drag-region")).toBe("deep");
    expect(row.querySelector(".mode-toggle")).not.toBeNull();
    expect(row.querySelector(".doc-status")).not.toBeNull();
    expect(row.querySelector('button[aria-label="More"]')).not.toBeNull();
    expect([...row.querySelectorAll("button")].map((b) => b.textContent)).toContain("Publish");
    expect(row.textContent).not.toContain("Delete");
    expect(row.textContent).not.toContain("Discard");
    expect(row.querySelector(".sync-status-button")).not.toBeNull();
  });

  it("has no Publish button for an already-published post", async () => {
    await renderShell("macos", { entries: [post], select: post.path });
    const buttons = [...detailRow().querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).not.toContain("Publish");
    expect(detailRow().querySelector(".doc-status")?.textContent).toContain("Published");
  });
});

describe("other platforms", () => {
  it("keep today's editor toolbar", async () => {
    await renderShell("web", { entries: [post], select: post.path });
    expect(document.querySelector(".detail-pane .toolbar-row")).toBeNull();
    expect(document.querySelector(".editor-toolbar")?.textContent).toContain("Delete");
  });
});
