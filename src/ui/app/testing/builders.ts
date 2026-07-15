// ABOUTME: Test-only builders for EntryRecord/raw-markdown fixtures shared
// ABOUTME: across app-store and component tests.
import type { EntryRecord } from "../../../core/store/types";

interface RawFields {
  title: string;
  date: string;
  draft?: boolean;
  opaqueId?: string;
  url?: string;
  type?: string;
}

function draftLine(fields: RawFields): string[] {
  return fields.draft ? ["draft: true"] : [];
}

function optionalLines(fields: RawFields): string[] {
  const lines: string[] = [];
  if (fields.opaqueId) {
    lines.push(`opaqueId: ${fields.opaqueId}`);
  }
  if (fields.url) {
    lines.push(`url: ${JSON.stringify(fields.url)}`);
  }
  if (fields.type) {
    lines.push(`type: ${JSON.stringify(fields.type)}`);
  }
  return lines;
}

/** A minimal valid raw markdown file matching fakeModel's front-matter shape. */
function makeRaw(fields: RawFields): string {
  const lines = [
    `title: ${JSON.stringify(fields.title)}`,
    `date: ${fields.date}`,
    ...draftLine(fields),
    ...optionalLines(fields),
  ];
  return `---\n${lines.join("\n")}\n---\nBody text.`;
}

/**
 * Builds an EntryRecord fixture. Unless `workingContent` is explicitly
 * overridden, the raw markdown is synthesized from the resolved
 * title/date/draft/opaqueId — so overriding just `opaqueId: "x"`, say,
 * produces a record whose front matter actually contains it.
 */
function makeEntry(
  overrides: Partial<EntryRecord> & Pick<EntryRecord, "path" | "kind">,
): EntryRecord {
  const title = overrides.title ?? "Test title";
  const date = overrides.date ?? "2026-01-01";
  const draft = overrides.draft ?? overrides.kind === "draft";
  const opaqueId = overrides.opaqueId ?? null;
  const base: EntryRecord = {
    path: overrides.path,
    kind: overrides.kind,
    baseSha: null,
    baseContent: null,
    workingContent: makeRaw({ title, date, draft, ...(opaqueId ? { opaqueId } : {}) }),
    dirty: false,
    deleted: false,
    renamedFrom: null,
    title,
    date,
    draft,
    opaqueId,
    updatedAt: 0,
  };
  return { ...base, ...overrides };
}

export { makeEntry, makeRaw };
