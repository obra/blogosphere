// ABOUTME: validateForCommit — the pre-push gate: filename shape, parseable front
// ABOUTME: matter, date/filename agreement, required fields per kind, round-trip integrity.

import { parseEntry } from "./entry";
import { replaceBodyImpl } from "./frontMatter";
import { kindForPath, pathParts } from "./paths";
import type { ValidationIssue } from "./types";

const DATED_FILENAME_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/;

function basenameOf(path: string): string {
  const segments = path.split("/");
  return segments.at(-1) ?? path;
}

export function validateForCommit(path: string, raw: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const filename = basenameOf(path);

  if (!DATED_FILENAME_RE.test(filename)) {
    issues.push({
      severity: "error",
      message: `filename "${filename}" does not match the required YYYY-MM-DD-slug.md pattern`,
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
  if (entry.date !== null && parts?.date && entry.date !== parts.date) {
    issues.push({
      severity: "error",
      message: `front matter date "${entry.date}" does not match filename date "${parts.date}"`,
    });
  }

  if (!entry.title) {
    issues.push({ severity: "error", message: "missing required field: title" });
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

  const roundTrip = replaceBodyImpl(raw, entry.body);
  if (!roundTrip.ok || roundTrip.raw !== raw) {
    issues.push({
      severity: "error",
      message: "internal round-trip integrity check failed; refusing to validate",
    });
  }

  return issues;
}
