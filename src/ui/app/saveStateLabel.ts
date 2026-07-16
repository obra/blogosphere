// ABOUTME: Save-state indicator copy for the editor chrome — one place deciding
// ABOUTME: how "your work is safe, and drafts aren't public" gets said.
import type { EntryRecord } from "../../core/store/types";
import type { SyncStatus } from "../../core/sync/types";

type SaveStateFields = Pick<EntryRecord, "dirty" | "draft">;

export interface SaveStateLabel {
  text: string;
  /** Tooltip: the longer explanation the one-liner can't carry. */
  title: string;
}

/**
 * Everything here must stay true to the actual pipeline (state.entryActions.ts
 * / push.ts): edits commit locally within the debounce window, background
 * sync pushes ALL dirty entries — drafts included, as drafts — and only the
 * Publish action makes a draft public.
 */
export function saveStateLabel(record: SaveStateFields, status: SyncStatus | null): SaveStateLabel {
  if (!status) {
    // No GitHub connection yet (first run) — nothing syncs anywhere.
    return {
      text: "Saved on this device",
      title: "Changes save automatically on this device. Connect GitHub in Settings to sync them.",
    };
  }
  if (record.dirty) {
    if (status.state === "syncing") {
      return { text: "Saving…", title: "Saving your changes to GitHub…" };
    }
    if (status.state === "offline") {
      return {
        text: "Saved on this device · offline",
        title: "Saved on this device. Your changes will sync to GitHub when you're back online.",
      };
    }
    return {
      text: "Saved on this device",
      title: "Saved on this device. Changes sync to GitHub automatically — ⌘S syncs now.",
    };
  }
  if (record.draft) {
    return {
      text: "Saved to GitHub · not public",
      title:
        "This draft is saved in your blog's repo but not published. Only Publish makes it public.",
    };
  }
  return {
    text: "Saved to GitHub",
    title: "Saved to your blog's repo. Edits to published posts go live with the next deploy.",
  };
}
