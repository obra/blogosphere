// @vitest-environment jsdom
// ABOUTME: menuModel — the pure item lists behind the compose menu, the entry
// ABOUTME: "…" menu, and View › Hide/Show Sidebar, including every enable rule.
import { afterEach, describe, expect, it, vi } from "vitest";
import { composeMenuItems, entryActionItems, runMenuCommand, sidebarToggleItem } from "./menuModel";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

function commands(items: ReturnType<typeof entryActionItems>) {
  return items.flatMap((item) => (item.kind === "command" ? [item] : []));
}

function byId(items: ReturnType<typeof entryActionItems>, id: string) {
  const found = commands(items).find((item) => item.id === id);
  if (!found) {
    throw new Error(`no item ${id}`);
  }
  return found;
}

describe("entryActionItems", () => {
  const published = makeEntry({ path: "content/blog/2026/p.md", kind: "post" });

  it("lists the entry commands in the spec's order, separated before the destructive pair", () => {
    const items = entryActionItems(published, null);
    expect(items.map((item) => (item.kind === "command" ? item.id : "—"))).toEqual([
      "openOnSite",
      "versions",
      "copySecretLink",
      "—",
      "discard",
      "delete",
    ]);
  });

  it("enables Open on Site only with a live URL", () => {
    expect(byId(entryActionItems(published, null), "openOnSite").enabled).toBe(false);
    expect(byId(entryActionItems(published, "https://blog.fsck.com/x"), "openOnSite").enabled).toBe(
      true,
    );
  });

  it("enables Copy Secret Link for drafts, or entries that already have an opaque id", () => {
    expect(byId(entryActionItems(published, null), "copySecretLink").enabled).toBe(false);
    const draft = makeEntry({ path: "content/drafts/d.md", kind: "draft", draft: true });
    expect(byId(entryActionItems(draft, null), "copySecretLink").enabled).toBe(true);
    const secret = { ...published, opaqueId: "abc123" };
    expect(byId(entryActionItems(secret, null), "copySecretLink").enabled).toBe(true);
  });

  it("enables Discard only for local changes over a synced base", () => {
    expect(byId(entryActionItems(published, null), "discard").enabled).toBe(false);
    const dirty = { ...published, dirty: true, baseContent: "old" };
    expect(byId(entryActionItems(dirty, null), "discard").enabled).toBe(true);
    const neverSynced = { ...published, dirty: true, baseContent: null };
    expect(byId(entryActionItems(neverSynced, null), "discard").enabled).toBe(false);
  });

  it("always enables Versions and Delete", () => {
    expect(byId(entryActionItems(published, null), "versions").enabled).toBe(true);
    expect(byId(entryActionItems(published, null), "delete").enabled).toBe(true);
  });
});

describe("composeMenuItems", () => {
  it("offers New Post and New Link", () => {
    expect(composeMenuItems().map((item) => (item.kind === "command" ? item.text : "—"))).toEqual([
      "New Post",
      "New Link…",
    ]);
  });
});

describe("sidebarToggleItem", () => {
  it("names the action the item will take, with ⌃⌘S", () => {
    expect(sidebarToggleItem(false)).toMatchObject({
      id: "toggleSidebar",
      text: "Hide Sidebar",
      accelerator: "Ctrl+Cmd+S",
    });
    expect(sidebarToggleItem(true).text).toBe("Show Sidebar");
  });
});

describe("runMenuCommand on a given entry", () => {
  const first = makeEntry({
    path: "content/blog/2026/2026-03-04-first.md",
    kind: "post",
    date: "2026-03-04",
  });
  const second = makeEntry({
    path: "content/blog/2026/2026-03-05-second.md",
    kind: "post",
    date: "2026-03-05",
  });

  async function storeWithBoth() {
    const { services } = buildFakeServices({ seedEntries: [first, second] });
    const store = createAppStore(services, { confirm: () => true });
    await store.getState().refresh();
    store.getState().select(first.path);
    return store;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes the entry it was given, not the selected one", async () => {
    const store = await storeWithBoth();
    runMenuCommand("delete", store, second.path);
    await vi.waitFor(() => {
      expect(store.getState().entries.map((entry) => entry.path)).toEqual([first.path]);
    });
  });

  it("opens the given entry's page on the live site", async () => {
    const store = await storeWithBoth();
    const open = vi.spyOn(globalThis.window, "open").mockReturnValue(null);
    runMenuCommand("openOnSite", store, second.path);
    expect(open).toHaveBeenCalledWith(
      "https://blog.fsck.com/2026/03/05/second/",
      "_blank",
      "noopener",
    );
  });

  it("acts on the selection when no entry is given", async () => {
    const store = await storeWithBoth();
    const open = vi.spyOn(globalThis.window, "open").mockReturnValue(null);
    runMenuCommand("openOnSite", store);
    expect(open).toHaveBeenCalledWith(
      "https://blog.fsck.com/2026/03/04/first/",
      "_blank",
      "noopener",
    );
  });
});
