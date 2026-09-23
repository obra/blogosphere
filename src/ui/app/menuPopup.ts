// ABOUTME: Shows a menuModel item list as a native NSMenu at the pointer (Tauri
// ABOUTME: Menu.popup). Thin wiring only; the items and enable rules are tested in menuModel.
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import type { MenuCommandId, MenuItemModel } from "./menuModel";

/** Fire-and-forget: a menu that fails to appear leaves nothing to clean up. */
function popupMenu(items: readonly MenuItemModel[], run: (id: MenuCommandId) => void): void {
  Promise.all(
    items.map((item) =>
      item.kind === "separator"
        ? PredefinedMenuItem.new({ item: "Separator" })
        : MenuItem.new({ text: item.text, enabled: item.enabled, action: () => run(item.id) }),
    ),
  )
    .then((built) => Menu.new({ items: built }))
    .then((menu) => menu.popup())
    .catch(() => undefined);
}

export { popupMenu };
