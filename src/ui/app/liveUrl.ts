// ABOUTME: Where the live site serves an entry: its dated permalink, or its
// ABOUTME: secret link; null for drafts nobody can reach yet.
import type { ModelApi } from "../../core/model/types";
import type { EntryRecord } from "../../core/store/types";
import { SITE_ORIGIN } from "./state.types";

/** The full URL where the live site serves this entry, or null when nothing
 *  is (or will be) reachable: drafts without an opaqueId never render in the
 *  production build, and some legacy entries have no derivable permalink. */
function liveUrlFor(
  record: EntryRecord,
  parsed: { permalink: string | null } | null,
): string | null {
  if (!parsed?.permalink) {
    return null;
  }
  if (record.draft && !record.opaqueId) {
    return null;
  }
  return `${SITE_ORIGIN}${parsed.permalink}`;
}

/** liveUrlFor straight from a record, for callers without a parsed view. */
function entryLiveUrl(model: ModelApi, record: EntryRecord): string | null {
  const parsed = model.parseEntry(record.path, record.workingContent);
  return parsed.ok ? liveUrlFor(record, { permalink: model.permalinkFor(parsed.entry) }) : null;
}

export { entryLiveUrl, liveUrlFor };
