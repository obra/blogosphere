// @vitest-environment jsdom
// ABOUTME: menuModel — the pure item lists behind the compose menu, the entry
// ABOUTME: "…" menu, and View › Hide/Show Sidebar, including every enable rule.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composeMenuItems,
  createItemTracker,
  entryActionItems,
  entryMenuItems,
  entryRowItems,
  FILE_MENU_COMMANDS,
  runMenuCommand,
  sectionMenuItems,
  sidebarToggleItem,
} from "./menuModel";
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

function ids(items: ReturnType<typeof entryActionItems>): string[] {
  return items.map((item) => (item.kind === "command" ? item.id : "—"));
}

describe("entryMenuItems (the Entry menu)", () => {
  const post = makeEntry({ path: "content/blog/2026/p.md", kind: "post" });
  const draft = makeEntry({ path: "content/drafts/d.md", kind: "draft", draft: true });

  it("puts Publish… with ⇧⌘P first, then the entry commands", () => {
    const items = entryMenuItems(post, null);
    expect(ids(items)).toEqual([
      "publish",
      "—",
      "openOnSite",
      "versions",
      "copySecretLink",
      "—",
      "discard",
      "delete",
    ]);
    expect(byId(items, "publish")).toMatchObject({
      text: "Publish…",
      accelerator: "CmdOrCtrl+Shift+P",
    });
  });

  it("enables Publish… only for drafts", () => {
    expect(byId(entryMenuItems(post, null), "publish").enabled).toBe(false);
    expect(byId(entryMenuItems(draft, null), "publish").enabled).toBe(true);
  });

  it("keeps the ellipsis menu's enable rules", () => {
    expect(byId(entryMenuItems(post, "https://blog.fsck.com/x"), "openOnSite").enabled).toBe(true);
    expect(byId(entryMenuItems(post, null), "copySecretLink").enabled).toBe(false);
  });

  it("disables everything with nothing selected", () => {
    const items = entryMenuItems(null, null);
    expect(ids(items)).toEqual(ids(entryMenuItems(post, null)));
    expect(commands(items).every((item) => !item.enabled)).toBe(true);
  });
});

describe("entryRowItems (a row's context menu)", () => {
  const post = makeEntry({ path: "content/blog/2026/p.md", kind: "post" });
  const draft = makeEntry({ path: "content/drafts/d.md", kind: "draft", draft: true });

  it("offers Open on Site, Copy Secret Link, Publish… and Delete…", () => {
    expect(ids(entryRowItems(draft, null))).toEqual([
      "openOnSite",
      "copySecretLink",
      "—",
      "publish",
      "delete",
    ]);
  });

  it("has the same items for every entry, since popup menus are cached per key", () => {
    expect(ids(entryRowItems(post, null))).toEqual(ids(entryRowItems(draft, null)));
    expect(byId(entryRowItems(post, null), "publish").enabled).toBe(false);
    expect(byId(entryRowItems(draft, null), "publish").enabled).toBe(true);
  });
});

describe("sectionMenuItems", () => {
  it("offers New Post for drafts and posts, New Link… for links, nothing for releases", () => {
    expect(ids(sectionMenuItems("drafts"))).toEqual(["newPost"]);
    expect(ids(sectionMenuItems("posts"))).toEqual(["newPost"]);
    expect(ids(sectionMenuItems("links"))).toEqual(["newLink"]);
    expect(sectionMenuItems("releases")).toEqual([]);
  });
});

describe("every toolbar, ellipsis and context-menu command has a menu-bar twin", () => {
  const draft = makeEntry({ path: "content/drafts/d.md", kind: "draft", draft: true });
  const menuBar = new Set<string>([...ids(entryMenuItems(draft, null)), ...FILE_MENU_COMMANDS]);
  const elsewhere = [
    ...ids(entryActionItems(draft, null)),
    ...ids(entryRowItems(draft, null)),
    ...ids(composeMenuItems()),
    ...ids(sectionMenuItems("drafts")),
    ...ids(sectionMenuItems("links")),
    "publish", // the toolbar's Publish button
  ].filter((id) => id !== "—");

  it.each(elsewhere)("%s", (id) => {
    expect(menuBar.has(id)).toBe(true);
  });
});

describe("runMenuCommand publish", () => {
  it("selects the entry it was given, then opens the Publish sheet", async () => {
    const one = makeEntry({ path: "content/drafts/2026-03-04-one.md", kind: "draft" });
    const two = makeEntry({ path: "content/drafts/2026-03-05-two.md", kind: "draft" });
    const { services } = buildFakeServices({ seedEntries: [one, two] });
    const store = createAppStore(services);
    await store.getState().refresh();
    store.getState().select(one.path);
    runMenuCommand("publish", store, two.path);
    expect(store.getState().selectedPath).toBe(two.path);
    expect(store.getState().publishDialogOpen).toBe(true);
  });
});

describe("createItemTracker", () => {
  const draft = makeEntry({ path: "content/drafts/d.md", kind: "draft", draft: true });
  const post = makeEntry({ path: "content/blog/2026/p.md", kind: "post" });

  it("always applies the first state it sees (the menu may have been built from an older one)", () => {
    const apply = vi.fn();
    const update = createItemTracker(apply);
    update(entryMenuItems(null, null));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("applies again when an item's title changes (View's editor modes follow the entry)", () => {
    const apply = vi.fn();
    const update = createItemTracker(apply);
    update(sectionMenuItems("drafts"));
    update(sectionMenuItems("links"));
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("applies again only when an enabled flag changes", () => {
    const apply = vi.fn();
    const update = createItemTracker(apply);
    update(entryMenuItems(draft, null));
    update(entryMenuItems({ ...draft, title: "Retitled" }, null));
    expect(apply).toHaveBeenCalledTimes(1);
    update(entryMenuItems(post, null));
    expect(apply).toHaveBeenCalledTimes(2);
  });
});

describe("runMenuCommand publish on a published entry", () => {
  it("does nothing: Publish… is for drafts only", async () => {
    const post = makeEntry({ path: "content/blog/2026/2026-03-04-p.md", kind: "post" });
    const { services } = buildFakeServices({ seedEntries: [post] });
    const store = createAppStore(services);
    await store.getState().refresh();
    runMenuCommand("publish", store, post.path);
    expect(store.getState().publishDialogOpen).toBe(false);
  });
});
