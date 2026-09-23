// ABOUTME: Shows a menuModel item list as a native NSMenu under its button (Tauri
// ABOUTME: Menu.popup). Thin wiring only; the items and enable rules are tested in menuModel.
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, type MenuItem } from "@tauri-apps/api/menu";
import type { MenuCommandId, MenuItemModel } from "./menuModel";
import { applyEnabled, buildNativeItems } from "./nativeMenu";

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
  const handler: CachedMenu["handler"] = { run: () => undefined };
  const { items, byId } = await buildNativeItems(models, (id) => handler.run(id));
  return { menu: await Menu.new({ items }), items: byId, handler };
}

/** Pops the menu: under an anchor element's bottom-left corner, like a
 *  pull-down button, or at a point (a context menu at the pointer). Resolves
 *  once the menu is dismissed (macOS runs popup menus modally); never rejects. */
async function popupMenu(
  key: string,
  models: readonly MenuItemModel[],
  run: (id: MenuCommandId) => void,
  at: Element | { x: number; y: number },
): Promise<void> {
  let pending = cache.get(key);
  if (!pending) {
    pending = build(models);
    cache.set(key, pending);
  }
  const point =
    at instanceof Element
      ? { x: at.getBoundingClientRect().left, y: at.getBoundingClientRect().bottom }
      : at;
  try {
    const cached = await pending;
    cached.handler.run = run;
    // Enabled states must land before the menu shows.
    await applyEnabled(cached.items, models);
    await cached.menu.popup(new LogicalPosition(point.x, point.y));
  } catch {
    // A menu that can't be shown has nothing to report; the click does nothing.
  }
}

export { popupMenu };
