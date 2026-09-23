// ABOUTME: Builds native menu items from menuModel item lists, and updates their
// ABOUTME: enabled state later. Thin Tauri wiring shared by popups and the menu bar.
import { MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import type { MenuCommandId, MenuItemModel } from "./menuModel";

interface NativeItems {
  items: Array<MenuItem | PredefinedMenuItem>;
  byId: Map<MenuCommandId, MenuItem>;
}

async function buildNativeItems(
  models: readonly MenuItemModel[],
  run: (id: MenuCommandId) => void,
): Promise<NativeItems> {
  const byId = new Map<MenuCommandId, MenuItem>();
  const items = await Promise.all(
    models.map(async (model) => {
      if (model.kind === "separator") {
        return PredefinedMenuItem.new({ item: "Separator" });
      }
      const item = await MenuItem.new({
        text: model.text,
        enabled: model.enabled,
        ...(model.accelerator === undefined ? {} : { accelerator: model.accelerator }),
        action: () => run(model.id),
      });
      byId.set(model.id, item);
      return item;
    }),
  );
  return { items, byId };
}

/** Brings each built item's enabled state up to `models`. Never rejects: a
 *  failed update leaves that item as it was. */
async function applyEnabled(
  byId: Map<MenuCommandId, MenuItem>,
  models: readonly MenuItemModel[],
): Promise<void> {
  await Promise.all(
    models.map((model) =>
      model.kind === "command"
        ? byId
            .get(model.id)
            ?.setEnabled(model.enabled)
            .catch(() => undefined)
        : undefined,
    ),
  );
}

export { applyEnabled, buildNativeItems, type NativeItems };
