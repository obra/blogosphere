// ABOUTME: The Format menu (formatCommands.ts): items and shortcuts, enabled only while a body
// ABOUTME: editor has focus, and each command reaching that editor's handle.
import { afterEach, describe, expect, it, vi } from "vitest";
import { setActiveEditor } from "../editor/activeEditor";
import type { EditorHandle } from "../editor/markdown-utils";
import { formatMenuItems } from "./formatCommands";
import { runMenuCommand } from "./menuModel";
import { createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

function fakeHandle(): EditorHandle {
  return {
    toggleBold: vi.fn(),
    toggleItalic: vi.fn(),
    toggleInlineCode: vi.fn(),
    toggleHeading2: vi.fn(),
    insertLink: vi.fn(),
    insertImage: vi.fn(),
  };
}

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
});

describe("formatMenuItems", () => {
  it("lists Bold ⌘B, Italic ⌘I, Code ⌘E, Heading, then Link… and Image…", () => {
    expect(
      formatMenuItems(true).map((item) =>
        item.kind === "command" ? [item.text, item.accelerator ?? ""] : "—",
      ),
    ).toEqual([
      ["Bold", "CmdOrCtrl+B"],
      ["Italic", "CmdOrCtrl+I"],
      ["Code", "CmdOrCtrl+E"],
      ["Heading", ""],
      "—",
      ["Link…", ""],
      ["Image…", ""],
    ]);
  });

  it("enables every item only when an editor has focus", () => {
    for (const enabled of [true, false]) {
      expect(
        formatMenuItems(enabled).every(
          (item) => item.kind !== "command" || item.enabled === enabled,
        ),
      ).toBe(true);
    }
  });
});

describe("runMenuCommand for formatting", () => {
  const store = createAppStore(buildFakeServices().services);

  it.each([
    ["bold", "toggleBold"],
    ["italic", "toggleItalic"],
    ["code", "toggleInlineCode"],
    ["heading", "toggleHeading2"],
    ["link", "insertLink"],
  ] as const)("%s calls %s on the focused editor", (id, method) => {
    const handle = fakeHandle();
    unregister = setActiveEditor({ handle: () => handle, onImage: () => Promise.resolve(null) });
    runMenuCommand(id, store);
    expect(handle[method]).toHaveBeenCalledTimes(1);
  });

  it("does nothing with no focused editor", () => {
    expect(() => runMenuCommand("bold", store)).not.toThrow();
  });

  it("image: picks a file, stores it through the editor's onImage, inserts the reference", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { services } = buildFakeServices({
      shellOptions: { pickedImage: { bytes, name: "Photo.JPG" } },
    });
    const withPicker = createAppStore(services);
    const handle = fakeHandle();
    const onImage = vi.fn(() => Promise.resolve("/img/photo.jpg"));
    unregister = setActiveEditor({ handle: () => handle, onImage });
    runMenuCommand("image", withPicker);
    await vi.waitFor(() => expect(handle.insertImage).toHaveBeenCalledWith("/img/photo.jpg"));
    expect(onImage).toHaveBeenCalledWith(bytes, "jpg");
  });

  it("image: a cancelled picker inserts nothing", async () => {
    const handle = fakeHandle();
    const onImage = vi.fn(() => Promise.resolve("/img/x.png"));
    unregister = setActiveEditor({ handle: () => handle, onImage });
    runMenuCommand("image", store);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onImage).not.toHaveBeenCalled();
    expect(handle.insertImage).not.toHaveBeenCalled();
  });
});
