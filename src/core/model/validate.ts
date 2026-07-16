// ABOUTME: validateForCommit — the pre-push gate: filename shape, parseable front
// ABOUTME: matter, date/filename agreement, required fields per kind, round-trip integrity.

import { parseEntry } from "./entry";
import { replaceBodyImpl } from "./frontMatter";
import { kindForPath, pathParts } from "./paths";
import type { ValidationIssue } from "./types";

const DATED_FILENAME_RE = /^\d{4}-\d{2}-\d{2}-.+\.(?:md|html)$/;

// The real ~440 legacy .html imports carry a full LiveJournal export
// timestamp in their `date:` field (e.g. "2004-01-24 00:04:00.000000000
// -08:00"), not the bare YYYY-MM-DD every .md file uses — but the filename
// still only ever encodes the bare date. Comparing full strings would flag
// literally every one of those files as a date/filename mismatch the
// instant a legacy post is edited and re-validated for push. Extracting the
// leading YYYY-MM-DD (requiring it end at a space/T separator or the string
// end, so a plain bare date matches exactly as before) fixes that without
// loosening the check for anything else: a genuine mismatch still trips it.
const LEADING_ISO_DATE_RE = /^(\d{4}-\d{2}-\d{2})(?:[ T]|$)/;

function basenameOf(path: string): string {
  const segments = path.split("/");
  return segments.at(-1) ?? path;
}

function leadingIsoDate(value: string): string {
  const match = LEADING_ISO_DATE_RE.exec(value);
  return match?.[1] ?? value;
}

/** Per-kind required-field checks. Missing title is only a *warning* for
 *  drafts: drafts are work in progress by definition — a freshly created
 *  (⌘N) draft has no title yet, and refusing to sync it would leave the
 *  user's only copy on one device (it's harmless remotely; the drafts lane
 *  never reaches the production build). A titleless published-lane entry
 *  would render a broken page, so there it stays an error. */
function requiredFieldIssues(
  kind: ReturnType<typeof kindForPath>,
  entry: { title: string | null; date: string | null; url: string | null; draft: boolean },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!entry.title) {
    issues.push(
      kind === "draft"
        ? { severity: "warning", message: "draft has no title yet" }
        : { severity: "error", message: "missing required field: title" },
    );
  }
  if (!entry.date) {
    issues.push({ severity: "error", message: "missing required field: date" });
  }
  if (kind === "link" && !entry.url) {
    issues.push({ severity: "error", message: "link entries require a url field" });
  }
  if (kind === "draft" && !entry.draft) {
    issues.push({
      severity: "warning",
      message:
        "entries under content/drafts should set draft: true (belt and suspenders against accidental publish)",
    });
  }
  return issues;
}

export function validateForCommit(path: string, raw: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const filename = basenameOf(path);

  if (!DATED_FILENAME_RE.test(filename)) {
    issues.push({
      severity: "error",
      message: `filename "${filename}" does not match the required YYYY-MM-DD-slug.(md|html) pattern`,
    });
  }

  const kind = kindForPath(path);
  if (kind === null) {
    issues.push({
      severity: "error",
      message: `path "${path}" is not under a recognized content directory`,
    });
  }

  const parsed = parseEntry(path, raw);
  if (!parsed.ok) {
    issues.push({
      severity: "error",
      message: `front matter could not be parsed: ${parsed.error}`,
    });
    return issues;
  }
  const { entry } = parsed;

  const parts = pathParts(path);
  if (entry.date !== null && parts?.date && leadingIsoDate(entry.date) !== parts.date) {
    issues.push({
      severity: "error",
      message: `front matter date "${entry.date}" does not match filename date "${parts.date}"`,
    });
  }

  issues.push(...requiredFieldIssues(kind, entry));

  const roundTrip = replaceBodyImpl(raw, entry.body);
  if (!roundTrip.ok || roundTrip.raw !== raw) {
    issues.push({
      severity: "error",
      message: "internal round-trip integrity check failed; refusing to validate",
    });
  }

  return issues;
}
