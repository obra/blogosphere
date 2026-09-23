// ABOUTME: The Format menu: its items, and running them against whichever body
// ABOUTME: editor has focus (activeEditor.ts), including picking an image to insert.
import { type FormatTarget, getActiveEditor } from "../editor/activeEditor";
import { extensionForImageFile } from "../editor/markdown-utils";
import type { MenuCommandId, MenuItemModel } from "./menuModel";
import type { BoundAppStore } from "./state";

type FormatCommandId = "bold" | "italic" | "code" | "heading" | "link" | "image";

/** The Format menu. Enabled only while a body editor has focus (see
 *  activeEditor.ts); Link gets no ⌘K, which Quick Open owns. */
function formatMenuItems(enabled: boolean): MenuItemModel[] {
  const item = (id: FormatCommandId, text: string, accelerator?: string): MenuItemModel => ({
    kind: "command",
    id,
    text,
    enabled,
    ...(accelerator === undefined ? {} : { accelerator }),
  });
  return [
    item("bold", "Bold", "CmdOrCtrl+B"),
    item("italic", "Italic", "CmdOrCtrl+I"),
    item("code", "Code", "CmdOrCtrl+E"),
    item("heading", "Heading"),
    { kind: "separator" },
    item("link", "Link…"),
    item("image", "Image…"),
  ];
}

/** Picks an image, stores it the way a pasted one is stored, and inserts it
 *  into the editor that was focused when the command ran (the open panel
 *  takes focus away while it's up). */
async function insertPickedImage(store: BoundAppStore, target: FormatTarget): Promise<void> {
  const picked = await store.getState().services.shell.pickImage();
  if (picked === null) {
    return;
  }
  const ref = await target.onImage(
    picked.bytes,
    extensionForImageFile({ type: "", name: picked.name }),
  );
  if (ref !== null) {
    target.handle()?.insertImage(ref);
  }
}

function runFormatCommand(id: FormatCommandId, store: BoundAppStore): void {
  const target = getActiveEditor();
  const handle = target?.handle();
  if (!(target && handle)) {
    return;
  }
  switch (id) {
    case "bold":
      handle.toggleBold();
      return;
    case "italic":
      handle.toggleItalic();
      return;
    case "code":
      handle.toggleInlineCode();
      return;
    case "heading":
      handle.toggleHeading2();
      return;
    case "link":
      handle.insertLink();
      return;
    case "image":
      insertPickedImage(store, target).catch(() => undefined);
      return;
    default:
      return;
  }
}

const FORMAT_COMMANDS: ReadonlySet<MenuCommandId> = new Set<FormatCommandId>([
  "bold",
  "italic",
  "code",
  "heading",
  "link",
  "image",
]);

function isFormatCommand(id: MenuCommandId): id is FormatCommandId {
  return FORMAT_COMMANDS.has(id);
}

export { type FormatCommandId, formatMenuItems, isFormatCommand, runFormatCommand };
