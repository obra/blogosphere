// ABOUTME: Sidebar hide/show state: starts from the prefs read before render,
// ABOUTME: flips on toggleSidebar(), and persists for the next launch.
import { describe, expect, it } from "vitest";
import { META_SIDEBAR_HIDDEN } from "./layoutPrefs";
import { runMenuCommand } from "./menuModel";
import { createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("sidebar hidden state", () => {
  it("starts shown by default", () => {
    const store = createAppStore(buildFakeServices().services);
    expect(store.getState().sidebarHidden).toBe(false);
  });

  it("starts from the layout prefs it's given", () => {
    const store = createAppStore(buildFakeServices().services, {}, { sidebarHidden: true });
    expect(store.getState().sidebarHidden).toBe(true);
  });

  it("toggles and persists", async () => {
    const { services } = buildFakeServices();
    const store = createAppStore(services);
    store.getState().toggleSidebar();
    expect(store.getState().sidebarHidden).toBe(true);
    await settle();
    expect(await services.store.getMeta(META_SIDEBAR_HIDDEN)).toBe("true");

    store.getState().toggleSidebar();
    await settle();
    expect(await services.store.getMeta(META_SIDEBAR_HIDDEN)).toBe("false");
  });
});

describe("runMenuCommand", () => {
  it("runs the toggle-sidebar command", () => {
    const store = createAppStore(buildFakeServices().services);
    runMenuCommand("toggleSidebar", store);
    expect(store.getState().sidebarHidden).toBe(true);
  });

  it("opens Versions for the selected entry, and ignores entry commands with no selection", () => {
    const store = createAppStore(buildFakeServices().services);
    runMenuCommand("versions", store);
    expect(store.getState().versionsPath).toBeNull();
    store.setState({ selectedPath: "content/blog/2026/p.md" });
    runMenuCommand("versions", store);
    expect(store.getState().versionsPath).toBe("content/blog/2026/p.md");
  });

  it("opens the New Link dialog", () => {
    const store = createAppStore(buildFakeServices().services);
    runMenuCommand("newLink", store);
    expect(store.getState().newLinkDialogOpen).toBe(true);
  });
});
