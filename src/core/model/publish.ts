// ABOUTME: planPublish — computes the date fixup, target path (moving drafts,
// ABOUTME: fixing in place otherwise), and flag-removal edits for publishing.

import { pathFor, slugForPath, slugify } from "./paths";
import type { EntryKind, FieldEdit, ParsedEntry, PublishOptions, PublishPlan } from "./types";

const MD_EXTENSION = ".md";
const HTML_EXTENSION = ".html";

/**
 * pathFor() only ever builds a canonical .md path — it's for new/canonical
 * markdown writes. Publishing (or otherwise date/kind-moving) a legacy
 * .html entry must not silently rewrite it into a .md file just because its
 * path moved: the file's actual format hasn't changed, only where it lives.
 * So swap the extension back onto pathFor's result whenever the source was
 * .html — the one place in the whole rename computation that needs to know
 * about the source's original extension at all.
 */
function withSourceExtension(sourcePath: string, canonicalMdPath: string): string {
  if (sourcePath.endsWith(HTML_EXTENSION) && canonicalMdPath.endsWith(MD_EXTENSION)) {
    return `${canonicalMdPath.slice(0, -MD_EXTENSION.length)}${HTML_EXTENSION}`;
  }
  return canonicalMdPath;
}

export function planPublishImpl(entry: ParsedEntry, opts: PublishOptions): PublishPlan {
  const currentSlug = slugForPath(entry.path);
  // opts.slug is user-typed (the Publish sheet's editable slug field) — run
  // it back through slugify so a stray space or symbol can't land in the
  // path unescaped, same as any other slug this model produces.
  const slug = opts.slug === undefined ? currentSlug : slugify(opts.slug);

  // Drafts (content/drafts/) always become posts. Every other kind — most
  // notably a draft:true post already living under content/blog/ — keeps
  // its structural kind; only its date (and therefore its year directory)
  // gets fixed up in place.
  const targetKind: EntryKind = entry.kind === "draft" ? "post" : entry.kind;
  const newPath = withSourceExtension(entry.path, pathFor(targetKind, opts.date, slug));

  const edits: FieldEdit[] = [
    { field: "date", value: opts.date },
    { field: "draft", value: null },
  ];
  if (!opts.keepOpaqueId) {
    edits.push({ field: "opaqueId", value: null });
  }

  return { newPath, edits };
}
