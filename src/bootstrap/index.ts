// ABOUTME: App boot orchestrator — detects Tauri vs browser/dev, builds the
// ABOUTME: right Services, and runs the initial bootstrap-or-sync flow
// ABOUTME: before the app tree ever renders with them.
import { isTauri } from "@tauri-apps/api/core";
import type { Services } from "../core/services";
import { META_LAST_ROOT_TREE_SHA } from "../core/sync/meta";
import { createDemoServices } from "./demo";
import { createTauriServices } from "./tauri";

/**
 * First-ever sync (nothing in the store yet) is awaited: there's no cached
 * data to show in the meantime, so a brief startup wait is preferable to an
 * empty three-pane app. Every later app start already has cached entries to
 * show immediately, so a routine refresh runs fire-and-forget instead of
 * blocking first paint — see state.miscActions.ts's attachSync, which
 * refreshes the entries cache once this (or any later) sync round settles.
 *
 * Both paths are read-only against the repo (bootstrap reads; pull merges
 * remote into local): launching the app must never push — unpushed work
 * from the last session stays pending until the user syncs, rather than
 * deploying half-finished edits the moment the app opens.
 */
export async function runInitialSync(services: Services): Promise<void> {
  if (!services.sync) {
    return;
  }
  const lastRootTreeSha = await services.store.getMeta(META_LAST_ROOT_TREE_SHA);
  if (lastRootTreeSha === null) {
    await services.sync.bootstrap();
  } else {
    services.sync.pull().catch(() => undefined);
  }
}

/** Builds Services for whichever runtime this is, then runs the boot-time
 *  sync flow. Never throws: a failed initial sync leaves Services usable
 *  (the sync-status pill and toasts surface the failure; the user can still
 *  read/edit everything already local). */
export async function boot(): Promise<Services> {
  const services = isTauri() ? await createTauriServices() : createDemoServices();
  try {
    await runInitialSync(services);
  } catch {
    // Swallowed on purpose: an offline/erroring first sync shouldn't block
    // the app from rendering at all. The sync engine's own status/toast
    // plumbing (already wired by the time this resolves) is what tells the
    // user something went wrong, not a crashed boot.
  }
  return services;
}
