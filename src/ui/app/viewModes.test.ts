// ABOUTME: View › editor modes: the three items (titles following the entry,
// ABOUTME: ⌃⌘1–3), and choosing one through the registered editor screen.
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMenuCommand } from "./menuModel";
import { createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";
import { setViewModes, type ViewModeTarget, viewModeItems } from "./viewModes";

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
});

function target(titles: [string, string, string], liveEnabled = true): ViewModeTarget {
  return {
    segments: [
      { title: titles[0], enabled: true },
      { title: titles[1], enabled: true },
      { title: titles[2], enabled: liveEnabled },
    ],
    choose: vi.fn(),
  };
}

function summary(items: ReturnType<typeof viewModeItems>) {
  return items.map((item) =>
    item.kind === "command" ? [item.id, item.text, item.enabled, item.accelerator] : "—",
  );
}

describe("viewModeItems", () => {
  it("follows a Markdown entry, with ⌃⌘1–3", () => {
    expect(summary(viewModeItems(target(["Write", "Markdown", "Live"])))).toEqual([
      ["mode1", "Write", true, "Ctrl+Cmd+1"],
      ["mode2", "Markdown", true, "Ctrl+Cmd+2"],
      ["mode3", "Live", true, "Ctrl+Cmd+3"],
    ]);
  });

  it("follows a legacy HTML entry, and disables Live without a live URL", () => {
    expect(summary(viewModeItems(target(["Preview", "HTML", "Live"], false)))).toEqual([
      ["mode1", "Preview", true, "Ctrl+Cmd+1"],
      ["mode2", "HTML", true, "Ctrl+Cmd+2"],
      ["mode3", "Live", false, "Ctrl+Cmd+3"],
    ]);
  });

  it("with no editor showing: the usual titles, all disabled", () => {
    expect(summary(viewModeItems(null))).toEqual([
      ["mode1", "Write", false, "Ctrl+Cmd+1"],
      ["mode2", "Markdown", false, "Ctrl+Cmd+2"],
      ["mode3", "Live", false, "Ctrl+Cmd+3"],
    ]);
  });
});

describe("runMenuCommand for editor modes", () => {
  it("chooses the segment on the editor that's showing", () => {
    const store = createAppStore(buildFakeServices().services);
    const screen = target(["Write", "Markdown", "Live"]);
    unregister = setViewModes(screen);
    runMenuCommand("mode3", store);
    expect(screen.choose).toHaveBeenCalledWith(2);
  });

  it("does nothing for a disabled segment, or with a sheet open", () => {
    const store = createAppStore(buildFakeServices().services);
    const screen = target(["Write", "Markdown", "Live"], false);
    unregister = setViewModes(screen);
    runMenuCommand("mode3", store);
    store.getState().openNewLinkDialog();
    runMenuCommand("mode1", store);
    expect(screen.choose).not.toHaveBeenCalled();
  });
});
