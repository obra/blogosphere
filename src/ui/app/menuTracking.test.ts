// ABOUTME: trackViewModes — View's editor-mode items follow the editor showing,
// ABOUTME: touching the native menu only for real changes, once per switch.
import type { MenuItem } from "@tauri-apps/api/menu";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuCommandId } from "./menuModel";
import { trackViewModes, type ViewMenu } from "./menuTracking";
import { setViewModes, type ViewModeTarget } from "./viewModes";

function fakeItem() {
  return {
    setText: vi.fn(() => Promise.resolve()),
    setEnabled: vi.fn(() => Promise.resolve()),
  };
}

function setup() {
  const items = { mode1: fakeItem(), mode2: fakeItem(), mode3: fakeItem() };
  const byId = new Map(Object.entries(items)) as unknown as Map<MenuCommandId, MenuItem>;
  const view = { submenu: null, sidebarItem: null, modeItems: byId } as unknown as ViewMenu;
  const stop = trackViewModes(view);
  const calls = () =>
    Object.values(items).reduce(
      (sum, item) => sum + item.setText.mock.calls.length + item.setEnabled.mock.calls.length,
      0,
    );
  return { items, stop, calls };
}

function markdownEntry(live = true): ViewModeTarget {
  return {
    segments: [
      { title: "Write", enabled: true },
      { title: "Markdown", enabled: true },
      { title: "Live", enabled: live },
    ],
    choose: () => undefined,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup) {
    fn();
  }
  cleanup = [];
});

describe("trackViewModes", () => {
  it("switching between two entries that show the same items touches nothing", async () => {
    const { stop, calls } = setup();
    cleanup.push(stop);
    const unregisterFirst = setViewModes(markdownEntry());
    await settle();
    const before = calls();
    // What an entry switch does: the old screen unmounts, the new one mounts.
    unregisterFirst();
    cleanup.push(setViewModes(markdownEntry()));
    await settle();
    expect(calls()).toBe(before);
  });

  it("only Live's availability changed: enabled states, no retitling", async () => {
    const { items, stop } = setup();
    cleanup.push(stop);
    const unregister = setViewModes(markdownEntry(true));
    await settle();
    const texts = items.mode1.setText.mock.calls.length;
    unregister();
    cleanup.push(setViewModes(markdownEntry(false)));
    await settle();
    expect(items.mode1.setText.mock.calls.length).toBe(texts);
    expect(items.mode3.setEnabled).toHaveBeenLastCalledWith(false);
  });

  it("a legacy HTML entry retitles the items", async () => {
    const { items, stop } = setup();
    cleanup.push(stop);
    cleanup.push(
      setViewModes({
        segments: [
          { title: "Preview", enabled: true },
          { title: "HTML", enabled: true },
          { title: "Live", enabled: true },
        ],
        choose: () => undefined,
      }),
    );
    await settle();
    expect(items.mode1.setText).toHaveBeenLastCalledWith("Preview");
    expect(items.mode2.setText).toHaveBeenLastCalledWith("HTML");
  });
});
