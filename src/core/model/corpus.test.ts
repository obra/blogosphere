// ABOUTME: Corpus round-trip test — walks the synthetic fixtures (always) and,
// ABOUTME: when BLOG_CORPUS_DIR is set, a real blog checkout too. See docs/tooling.md.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyEditsImpl } from "./applyEdits";
import { parseEntry } from "./entry";
import { replaceBodyImpl } from "./frontMatter";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = join(CURRENT_DIR, "fixtures", "corpus-shapes");
const CONTENT_SUBDIRS = ["blog", "drafts", "_linkblog", "releases"];

/**
 * Files that are expected to fail parseEntry when walking a real checkout:
 * co-located reference material sitting beside an old post (no front matter
 * at all, and nested deeper than any managed root tolerates anyway). Keep
 * this list named and explained — anything landing here silently would be a
 * real regression, not an expected exception.
 */
const KNOWN_PARSE_EXCEPTIONS = new Set([
  "content/blog/2025/using-graphviz-for-claudemd/CLAUDE.md",
  "content/blog/2025/using-graphviz-for-claudemd/PROCESS-DSL-STYLE.md",
]);

function walk(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      acc.push(full);
    }
  }
}

function collectMarkdownFiles(root: string): string[] {
  const results: string[] = [];
  for (const dir of CONTENT_SUBDIRS) {
    const full = join(root, "content", dir);
    if (existsSync(full)) {
      walk(full, results);
    }
  }
  return results;
}

function logicalPathFor(root: string, absoluteFile: string): string {
  return relative(root, absoluteFile).split(sep).join("/");
}

/** Line-index of the closing "---" fence, found the dumbest possible way
 * (exact line match) — deliberately independent of the module's own scanner,
 * so this test can't be fooled by a bug the two would share. */
function closingFenceLineIndex(raw: string): number | null {
  const lines = raw.split("\n");
  if (lines[0] !== "---") {
    return null;
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      return i;
    }
  }
  return null;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

interface RoundTripCheck {
  parseOk: boolean;
  noEditIdentical: boolean;
  bodyReplaceIdentical: boolean;
  editOk: boolean;
  /** Everything after the closing fence (the body) is byte-identical before
   * and after a title edit — the edit never leaks outside the front matter. */
  localityPreserved: boolean;
}

const FAILED_CHECK: RoundTripCheck = {
  parseOk: false,
  noEditIdentical: false,
  bodyReplaceIdentical: false,
  editOk: false,
  localityPreserved: false,
};

function computeRoundTripCheck(logicalPath: string, raw: string): RoundTripCheck {
  const parsed = parseEntry(logicalPath, raw);
  if (!parsed.ok) {
    return FAILED_CHECK;
  }

  const noEditResult = applyEditsImpl(raw, []);
  const noEditIdentical = noEditResult.ok && noEditResult.raw === raw;

  const bodyReplaceResult = replaceBodyImpl(raw, parsed.entry.body);
  const bodyReplaceIdentical = bodyReplaceResult.ok && bodyReplaceResult.raw === raw;

  const editResult = applyEditsImpl(raw, [{ field: "title", value: "Locality Probe Title" }]);
  if (!editResult.ok) {
    return {
      parseOk: true,
      noEditIdentical,
      bodyReplaceIdentical,
      editOk: false,
      localityPreserved: false,
    };
  }

  const beforeClose = closingFenceLineIndex(raw);
  const afterClose = closingFenceLineIndex(editResult.raw);
  const localityPreserved =
    beforeClose !== null &&
    afterClose !== null &&
    arraysEqual(
      raw.split("\n").slice(beforeClose + 1),
      editResult.raw.split("\n").slice(afterClose + 1),
    );

  return { parseOk: true, noEditIdentical, bodyReplaceIdentical, editOk: true, localityPreserved };
}

describe("corpus round-trip — synthetic fixtures (always run)", () => {
  const files = collectMarkdownFiles(FIXTURES_ROOT);

  it("found at least one fixture covering every front-matter shape", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const logicalPath = logicalPathFor(FIXTURES_ROOT, file);
    it(`parses, round-trips, and edits locally: ${logicalPath}`, () => {
      const raw = readFileSync(file, "utf8");
      const check = computeRoundTripCheck(logicalPath, raw);
      expect(check.parseOk).toBe(true);
      expect(check.noEditIdentical).toBe(true);
      expect(check.bodyReplaceIdentical).toBe(true);
      expect(check.editOk).toBe(true);
      expect(check.localityPreserved).toBe(true);
    });
  }
});

const realCorpusDir = process.env.BLOG_CORPUS_DIR;

describe.skipIf(!realCorpusDir)("corpus round-trip — real blog checkout (BLOG_CORPUS_DIR)", () => {
  const root = realCorpusDir ?? "";
  const files = collectMarkdownFiles(root);

  for (const file of files) {
    const logicalPath = logicalPathFor(root, file);
    it(`parses, round-trips, and edits locally: ${logicalPath}`, () => {
      const raw = readFileSync(file, "utf8");
      if (KNOWN_PARSE_EXCEPTIONS.has(logicalPath)) {
        const parsed = parseEntry(logicalPath, raw);
        expect(parsed.ok).toBe(false);
        return;
      }
      const check = computeRoundTripCheck(logicalPath, raw);
      expect(check.parseOk).toBe(true);
      expect(check.noEditIdentical).toBe(true);
      expect(check.bodyReplaceIdentical).toBe(true);
      expect(check.editOk).toBe(true);
      expect(check.localityPreserved).toBe(true);
    });
  }
});
