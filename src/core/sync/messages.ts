// ABOUTME: Commit-message template application — a single change gets a
// ABOUTME: kind/newness-specific template; a batch gets "Sync: N changes".
import type { EntryKind } from "../model/types";
import type { EntryRecord } from "../store/types";
import type { CommitMessageTemplates } from "./types";

function fillTemplate(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}

/** New (never-synced) entries pick their template by kind. Edits and deletes
 *  use their own dedicated templates regardless of kind. */
const NEW_ENTRY_TEMPLATE_KEY: Record<EntryKind, keyof CommitMessageTemplates> = {
  post: "newPost",
  draft: "newDraft",
  link: "newLink",
  // The template contract has no dedicated "release" slot; the content model
  // describes releases as "like post" (spec, Content model table), so a new
  // release shares the post template.
  release: "newPost",
};

function templateKeyFor(entry: EntryRecord): keyof CommitMessageTemplates {
  if (entry.deleted) {
    return "delete";
  }
  if (entry.baseSha !== null) {
    return "edit";
  }
  return NEW_ENTRY_TEMPLATE_KEY[entry.kind];
}

/**
 * One entry's commit uses its kind/newness/delete template; several entries
 * in the same commit collapse to a generic batch summary.
 */
export function buildCommitMessage(
  entries: readonly EntryRecord[],
  templates: CommitMessageTemplates,
): string {
  if (entries.length === 0) {
    throw new Error("buildCommitMessage: at least one entry is required");
  }
  if (entries.length > 1) {
    return `Sync: ${entries.length} changes`;
  }

  const [entry] = entries;
  if (!entry) {
    throw new Error("buildCommitMessage: at least one entry is required");
  }
  const template = templates[templateKeyFor(entry)];
  return fillTemplate(template, { title: entry.title ?? entry.path, path: entry.path });
}
