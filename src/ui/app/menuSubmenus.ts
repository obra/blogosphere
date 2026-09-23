// ABOUTME: The menu bar's self-contained submenus: Edit (with Find), Format,
// ABOUTME: Window and Help. menu.ts assembles them with the store-driven ones.
import { MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getActiveEditor } from "../editor/activeEditor";
import { focusEntrySearch } from "./entrySearchFocus";
import { formatMenuItems, runMenuCommand } from "./menuModel";
import { buildNativeItems, type NativeItems } from "./nativeMenu";
import { openExternal } from "./openExternal";
import type { BoundAppStore } from "./state";

function separator(): Promise<PredefinedMenuItem> {
  return PredefinedMenuItem.new({ item: "Separator" });
}

/** Standard Edit bindings — without these, replacing the default app menu
 *  would silently break ⌘C/⌘V/⌘Z inside the webview — plus Find. */
async function buildEditSubmenu(): Promise<Submenu> {
  const find = await Submenu.new({
    text: "Find",
    items: [
      await MenuItem.new({
        text: "Search Entries",
        // biome-ignore lint/security/noSecrets: a keyboard accelerator, not a credential.
        accelerator: "Alt+CmdOrCtrl+F",
        action: focusEntrySearch,
      }),
    ],
  });
  return Submenu.new({
    text: "Edit",
    items: [
      ...(await Promise.all([
        PredefinedMenuItem.new({ item: "Undo" }),
        PredefinedMenuItem.new({ item: "Redo" }),
        separator(),
        PredefinedMenuItem.new({ item: "Cut" }),
        PredefinedMenuItem.new({ item: "Copy" }),
        PredefinedMenuItem.new({ item: "Paste" }),
        PredefinedMenuItem.new({ item: "SelectAll" }),
        separator(),
      ])),
      find,
    ],
  });
}

interface FormatMenu {
  submenu: Submenu;
  byId: NativeItems["byId"];
}

/** Bold, Italic, Code, Heading, Link…, Image… for the focused body editor. */
async function buildFormatSubmenu(store: BoundAppStore): Promise<FormatMenu> {
  const { items, byId } = await buildNativeItems(
    formatMenuItems(getActiveEditor() !== null),
    (id) => runMenuCommand(id, store),
  );
  return { submenu: await Submenu.new({ text: "Format", items }), byId };
}

async function buildWindowSubmenu(): Promise<Submenu> {
  return Submenu.new({
    text: "Window",
    items: await Promise.all([
      PredefinedMenuItem.new({ item: "Minimize" }),
      PredefinedMenuItem.new({ item: "Maximize", text: "Zoom" }),
      separator(),
      PredefinedMenuItem.new({ item: "CloseWindow" }),
    ]),
  });
}

const HELP_URL = "https://github.com/obra/blogosphere#readme";

/** macOS puts its menu-search field in whichever menu is marked as Help. */
async function buildHelpSubmenu(): Promise<Submenu> {
  const help = await Submenu.new({
    text: "Help",
    items: [await MenuItem.new({ text: "Blogosphere Help", action: () => openExternal(HELP_URL) })],
  });
  await help.setAsHelpMenuForNSApp().catch(() => undefined);
  return help;
}

export {
  buildEditSubmenu,
  buildFormatSubmenu,
  buildHelpSubmenu,
  buildWindowSubmenu,
  type FormatMenu,
  separator,
};
