// ABOUTME: "Pick up where you left off" — persists the sidebar section and
// ABOUTME: selected entry to store meta on every select()/setSection() (see
// ABOUTME: state.entryActions.ts), and restores them once at init time.
import type { Section } from "../types";
import { SECTIONS } from "../types";
import type { ActionCtx } from "./state.types";
import { INITIAL_SECTION } from "./state.types";

const META_LAST_SECTION_KEY = "ui:lastSection";
const META_LAST_SELECTED_PATH_KEY = "ui:lastSelectedPath";

/** Fire-and-forget: a failed write here just costs the next launch's restore, never a toast. */
function persistMeta(ctx: ActionCtx, key: string, value: string | null): void {
  ctx
    .get()
    .services.store.setMeta(key, value)
    .catch(() => undefined);
}

function persistSection(ctx: ActionCtx, section: Section): void {
  persistMeta(ctx, META_LAST_SECTION_KEY, section);
}

function persistSelectedPath(ctx: ActionCtx, path: string | null): void {
  persistMeta(ctx, META_LAST_SELECTED_PATH_KEY, path);
}

function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

/** True once the section or selection has moved off the launch defaults —
 *  i.e. the user (whose input isn't gated on init() finishing) already
 *  navigated somewhere while the restore reads were still in flight. */
function hasLiveNavigation(ctx: ActionCtx): boolean {
  const { section, selectedPath } = ctx.get();
  return selectedPath !== null || section !== INITIAL_SECTION;
}

/**
 * Called once from init(), after refresh() has populated `entries` so the
 * existence check below has something to check against. Reuses the ordinary
 * setSection()/select() actions — rather than poking state directly — so a
 * restored pick hydrates its editor mode and re-persists exactly like a
 * manual one. Drops a selectedPath whose entry is gone and any section
 * value that isn't real; never throws — corrupt, missing, or unreadable
 * meta all just leave the startup defaults already in state. And because
 * the app is interactive the whole time the meta reads resolve, a live
 * selection the user made in the meantime always wins: restoring over it
 * would silently snap the editor to last session's entry mid-keystroke.
 */
async function restoreLastPosition(ctx: ActionCtx): Promise<void> {
  try {
    const { store } = ctx.get().services;
    const [sectionMeta, pathMeta] = await Promise.all([
      store.getMeta(META_LAST_SECTION_KEY),
      store.getMeta(META_LAST_SELECTED_PATH_KEY),
    ]);
    if (hasLiveNavigation(ctx)) {
      return;
    }
    if (sectionMeta !== null && isSection(sectionMeta)) {
      ctx.get().setSection(sectionMeta);
    }
    if (pathMeta !== null && ctx.get().entries.some((entry) => entry.path === pathMeta)) {
      ctx.get().select(pathMeta);
    }
  } catch {
    // Missing/corrupt meta keeps the defaults already in state.
  }
}

export { persistSection, persistSelectedPath, restoreLastPosition };
