// ABOUTME: Shows a menuModel item list as a native NSMenu under its button (Tauri
// ABOUTME: Menu.popup). Thin wiring only; the items and enable rules are tested in menuModel.
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import type { MenuCommandId, MenuItemModel } from "./menuModel";

interface CachedMenu {
  menu: Menu;
  items: Map<MenuCommandId, MenuItem>;
  /** What choosing an item does for the current showing; the items' actions
   *  call through this, so each showing can bring its own context. */
  handler: { run: (id: MenuCommandId) => void };
}

/**
 * Each popup menu is built once and reused: Tauri frees native menus only on
 * an explicit close(), so a fresh menu per click would grow forever, and
 * closing right after popup() could drop the chosen item's action (its event
 * can arrive after the menu is dismissed). A given `key` must always get the
 * same items in the same order; only their enabled state changes.
 */
const cache = new Map<string, Promise<CachedMenu>>();

async function build(models: readonly MenuItemModel[]): Promise<CachedMenu> {
  const items = new Map<MenuCommandId, MenuItem>();
  const handler: CachedMenu["handler"] = { run: () => undefined };
  const built = await Promise.all(
    models.map(async (model) => {
      if (model.kind === "separator") {
        return PredefinedMenuItem.new({ item: "Separator" });
      }
      const item = await MenuItem.new({
        text: model.text,
        enabled: model.enabled,
        action: () => handler.run(model.id),
      });
      items.set(model.id, item);
      return item;
    }),
  );
  return { menu: await Menu.new({ items: built }), items, handler };
}

/** Fire-and-forget: pops the menu with its top-left at the anchor's
 *  bottom-left corner, like a pull-down button. */
function popupMenu(
  key: string,
  models: readonly MenuItemModel[],
  run: (id: MenuCommandId) => void,
  anchor: Element,
): void {
  let pending = cache.get(key);
  if (!pending) {
    pending = build(models);
    cache.set(key, pending);
  }
  const rect = anchor.getBoundingClientRect();
  pending
    .then(async (cached) => {
      cached.handler.run = run;
      await Promise.all(
        models.flatMap((model) =>
          model.kind === "command" ? [cached.items.get(model.id)?.setEnabled(model.enabled)] : [],
        ),
      );
      await cached.menu.popup(new LogicalPosition(rect.left, rect.bottom));
    })
    .catch(() => undefined);
}

export { popupMenu };
