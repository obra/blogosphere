// ABOUTME: Default AppStoreDeps implementations (confirm dialog, clipboard,
// ABOUTME: clock, id generation) and commit-template (de)serialization.
import { v4 as uuidv4 } from "uuid";
import type { CommitMessageTemplates } from "../../core/sync/types";
import type { AppStoreDeps } from "./state.types";
import {
  DEFAULT_EDIT_DEBOUNCE_MS,
  DEFAULT_EDIT_MAX_UNCOMMITTED_MS,
  DEFAULT_SEARCH_DEBOUNCE_MS,
} from "./state.types";

function browserConfirm(message: string): boolean {
  if (globalThis.window === undefined || typeof globalThis.window.confirm !== "function") {
    return true;
  }
  // biome-ignore lint/suspicious/noAlert: blocking native confirm is the intended UX for destructive actions; tests inject AppStoreDeps.confirm instead.
  return globalThis.window.confirm(message);
}

async function browserWriteClipboardText(text: string): Promise<void> {
  if (globalThis.navigator?.clipboard) {
    await globalThis.navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard is not available in this environment");
}

function buildDeps(overrides: Partial<AppStoreDeps>): AppStoreDeps {
  return {
    confirm: overrides.confirm ?? browserConfirm,
    now: overrides.now ?? Date.now,
    writeClipboardText: overrides.writeClipboardText ?? browserWriteClipboardText,
    createId: overrides.createId ?? (() => uuidv4()),
    editDebounceMs: overrides.editDebounceMs ?? DEFAULT_EDIT_DEBOUNCE_MS,
    editMaxUncommittedMs: overrides.editMaxUncommittedMs ?? DEFAULT_EDIT_MAX_UNCOMMITTED_MS,
    searchDebounceMs: overrides.searchDebounceMs ?? DEFAULT_SEARCH_DEBOUNCE_MS,
  };
}

function hasTemplateStrings(
  record: Record<string, unknown>,
): record is Record<keyof CommitMessageTemplates, string> {
  const { newPost, edit, newDraft, newLink, delete: del } = record;
  return (
    typeof newPost === "string" &&
    typeof edit === "string" &&
    typeof newDraft === "string" &&
    typeof newLink === "string" &&
    typeof del === "string"
  );
}

/** Parse persisted commit templates from store meta; null on any shape mismatch. */
function parseCommitTemplates(raw: string): CommitMessageTemplates | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (!hasTemplateStrings(record)) {
      return null;
    }
    return {
      newPost: record.newPost,
      edit: record.edit,
      newDraft: record.newDraft,
      newLink: record.newLink,
      delete: record.delete,
    };
  } catch {
    return null;
  }
}

export { buildDeps, parseCommitTemplates };
