// ABOUTME: planPublish — computes the date fixup, target path (moving drafts,
// ABOUTME: fixing in place otherwise), and flag-removal edits for publishing.

import { pathFor, pathParts } from "./paths";
import type { EntryKind, FieldEdit, ParsedEntry, PublishOptions, PublishPlan } from "./types";

const MD_EXTENSION = ".md";

function basenameOf(path: string): string {
  const segments = path.split("/");
  return segments.at(-1) ?? path;
}

function fallbackSlug(path: string): string {
  const base = basenameOf(path);
  return base.endsWith(MD_EXTENSION) ? base.slice(0, -MD_EXTENSION.length) : base;
}

export function planPublishImpl(entry: ParsedEntry, opts: PublishOptions): PublishPlan {
  const parts = pathParts(entry.path);
  const slug = parts === null ? fallbackSlug(entry.path) : parts.slug;

  // Drafts (content/drafts/) always become posts. Every other kind — most
  // notably a draft:true post already living under content/blog/ — keeps
  // its structural kind; only its date (and therefore its year directory)
  // gets fixed up in place.
  const targetKind: EntryKind = entry.kind === "draft" ? "post" : entry.kind;
  const newPath = pathFor(targetKind, opts.date, slug);

  const edits: FieldEdit[] = [
    { field: "date", value: opts.date },
    { field: "draft", value: null },
  ];
  if (!opts.keepOpaqueId) {
    edits.push({ field: "opaqueId", value: null });
  }

  return { newPath, edits };
}
