// ABOUTME: restoreVersion — replace an entry's working copy with a past
// ABOUTME: version fetched from git history (the Versions panel's Restore).
import type { EntryRecord } from "../../core/store/types";
import { findEntryInCache, replaceEntryInCache, withParsedFields } from "./state.cache";
import type { ActionCtx } from "./state.types";

async function restoreVersion(ctx: ActionCtx, path: string, raw: string): Promise<void> {
  // Cancel (never flush) any still-debounced keystrokes — the user chose an
  // older version over whatever they were mid-typing.
  ctx.cancel(path);
  const svc = ctx.get().services;
  const record = findEntryInCache(ctx.get, path) ?? (await svc.store.getEntry(path));
  if (!record) {
    ctx.get().addToast({ tone: "error", message: "That entry isn't around anymore." });
    return;
  }
  try {
    const restored: EntryRecord = {
      ...record,
      ...withParsedFields(svc, path, raw, record),
      workingContent: raw,
      dirty: true,
      deleted: false,
      updatedAt: ctx.deps.now(),
    };
    await svc.store.upsertEntry(restored);
    replaceEntryInCache(ctx.set, restored);
    ctx.get().addToast({ tone: "info", message: "Restored — sync (⌘S) to make it live." });
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't restore that version.",
      retry: () => restoreVersion(ctx, path, raw),
    });
  }
}

export { restoreVersion };
