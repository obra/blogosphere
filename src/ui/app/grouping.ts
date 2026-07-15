// ABOUTME: Pure list-shaping helpers — which sidebar section an entry belongs to,
// ABOUTME: section counts, and year/month grouping for the entry list. No React.
import type { EntryKind } from "../../core/model/types";
import type { EntryRecord } from "../../core/store/types";
import type { Section } from "../types";
import { monthName, splitIsoDate } from "./format";

const UNDATED_KEY = "Undated";

const SECTION_FOR_KIND: Record<EntryKind, Section> = {
  post: "posts",
  draft: "drafts",
  link: "links",
  release: "releases",
};

interface MonthGroup {
  /** "01".."12", or the UNDATED_KEY sentinel for entries with no date. */
  key: string;
  entries: EntryRecord[];
}

interface YearGroup {
  key: string;
  months: MonthGroup[];
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = create();
  map.set(key, created);
  return created;
}

function compareKeysDescending(a: string, b: string): number {
  if (a === UNDATED_KEY) {
    return 1;
  }
  if (b === UNDATED_KEY) {
    return -1;
  }
  return b.localeCompare(a);
}

function sortKeyForEntry(entry: EntryRecord): string {
  // YYYY-MM-DD sorts lexicographically the same as chronologically; undated
  // entries sort by their last local edit instead, newest first.
  if (entry.date) {
    return entry.date;
  }
  return new Date(entry.updatedAt).toISOString();
}

function sortEntriesNewestFirst(entries: EntryRecord[]): EntryRecord[] {
  return [...entries].sort((a, b) => sortKeyForEntry(b).localeCompare(sortKeyForEntry(a)));
}

function buildMonthGroups(months: Map<string, EntryRecord[]>): MonthGroup[] {
  const monthKeys = [...months.keys()].sort(compareKeysDescending);
  return monthKeys.map((key) => ({ key, entries: sortEntriesNewestFirst(months.get(key) ?? []) }));
}

/**
 * Which sidebar section an entry lives in. A `draft: true` post outside
 * content/drafts/ is still a draft for display purposes (spec: "Drafts lifecycle").
 */
function sectionForEntry(entry: Pick<EntryRecord, "kind" | "draft">): Section {
  if (entry.kind === "draft" || (entry.kind === "post" && entry.draft)) {
    return "drafts";
  }
  return SECTION_FOR_KIND[entry.kind];
}

/** Same rule, usable when only a bare EntryKind (no draft flag) is on hand. */
function sectionForKind(kind: EntryKind): Section {
  return SECTION_FOR_KIND[kind];
}

function visibleEntries(entries: EntryRecord[]): EntryRecord[] {
  return entries.filter((entry) => !entry.deleted);
}

function filterBySection(entries: EntryRecord[], section: Section): EntryRecord[] {
  return visibleEntries(entries).filter((entry) => sectionForEntry(entry) === section);
}

function countsBySection(entries: EntryRecord[]): Record<Section, number> {
  const counts: Record<Section, number> = { drafts: 0, posts: 0, links: 0, releases: 0 };
  for (const entry of visibleEntries(entries)) {
    const section = sectionForEntry(entry);
    counts[section] += 1;
  }
  return counts;
}

/** Newest first, grouped by year then month; entries without a date land in "Undated". */
function groupByYearMonth(entries: EntryRecord[]): YearGroup[] {
  const byYear = new Map<string, Map<string, EntryRecord[]>>();
  for (const entry of entries) {
    const parts = entry.date ? splitIsoDate(entry.date) : null;
    const yearKey = parts === null ? UNDATED_KEY : parts.year;
    const monthKey = parts === null ? UNDATED_KEY : parts.month;
    const months = getOrCreate(byYear, yearKey, () => new Map<string, EntryRecord[]>());
    getOrCreate(months, monthKey, () => []).push(entry);
  }
  const yearKeys = [...byYear.keys()].sort(compareKeysDescending);
  return yearKeys.map((key) => ({ key, months: buildMonthGroups(byYear.get(key) ?? new Map()) }));
}

/** Human label for a MonthGroup.key, e.g. "07" -> "July"; passes "Undated" through. */
function monthGroupLabel(key: string): string {
  if (key === UNDATED_KEY) {
    return UNDATED_KEY;
  }
  return monthName(key);
}

export type { MonthGroup, YearGroup };
export {
  countsBySection,
  filterBySection,
  groupByYearMonth,
  monthGroupLabel,
  sectionForEntry,
  sectionForKind,
  visibleEntries,
};
