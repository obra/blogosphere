// ABOUTME: View › editor modes (⌃⌘1–3): the editor screen publishes its three
// ABOUTME: mode segments here, and the menu bar shows and switches them.
import { createRegistry } from "../registry";
import type { MenuCommandId, MenuItemModel } from "./menuModel";

interface ModeSegment {
  /** Write / Markdown / Live, or Preview / HTML / Live for legacy HTML. */
  title: string;
  enabled: boolean;
}

interface ViewModeTarget {
  segments: readonly [ModeSegment, ModeSegment, ModeSegment];
  choose(index: number): void;
}

type ViewModeCommandId = "mode1" | "mode2" | "mode3";

const VIEW_MODE_COMMANDS: readonly ViewModeCommandId[] = ["mode1", "mode2", "mode3"];
const DEFAULT_TITLES = ["Write", "Markdown", "Live"] as const;

const viewModes = createRegistry<ViewModeTarget>();
const setViewModes = (target: ViewModeTarget) => viewModes.set(target);
const getViewModes = () => viewModes.get();
const subscribeViewModes = (listener: () => void) => viewModes.subscribe(listener);

/** ⌃⌘1–3, not ⌥⌘1–3: Milkdown binds those to H1–H3 in Write mode. */
function viewModeItems(target: ViewModeTarget | null): MenuItemModel[] {
  return VIEW_MODE_COMMANDS.map((id, index) => ({
    kind: "command",
    id,
    text: target?.segments[index]?.title ?? DEFAULT_TITLES[index] ?? "",
    enabled: target?.segments[index]?.enabled === true,
    accelerator: `Ctrl+Cmd+${index + 1}`,
  }));
}

function isViewModeCommand(id: MenuCommandId): id is ViewModeCommandId {
  return (VIEW_MODE_COMMANDS as readonly string[]).includes(id);
}

function runViewModeCommand(id: ViewModeCommandId): void {
  const target = getViewModes();
  const index = VIEW_MODE_COMMANDS.indexOf(id);
  if (target?.segments[index]?.enabled) {
    target.choose(index);
  }
}

export {
  getViewModes,
  isViewModeCommand,
  type ModeSegment,
  runViewModeCommand,
  setViewModes,
  subscribeViewModes,
  type ViewModeCommandId,
  type ViewModeTarget,
  viewModeItems,
};
