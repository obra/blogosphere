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
  // Same co-located-debris category as the two above (nested two levels
  // below content/blog/, so kindForPath already excludes it structurally) —
  // a 71-byte leftover from a failed local "python3 -m markdown" render
  // ("No module named markdown"), not a real post. Only surfaced once this
  // module started walking .html files too (see the ~440 legacy imports).
  "content/blog/2025/using-graphviz-for-claudemd/process-dsl-experiment.html",
]);

/**
 * Real legacy .html imports whose front-matter `title` is YAML-folded
 * across two physical lines — either plain-scalar line folding
 * ("title: Foo Bar\n  Baz") or a double-quoted scalar that wraps before its
 * closing quote ("title: \"Foo\n  bar\""). scanValueShape.ts's
 * boundPlainScalar/boundQuoted deliberately decline to bound either shape
 * (see their doc comments) rather than guess at YAML line-folding rules —
 * matching the front-matter editor's documented policy of refusing a
 * surgical edit it can't apply with full confidence, rather than risking
 * corruption.
 *
 * These 3 files (out of all 440) are NOT parse failures: parseEntry reads
 * every field correctly (js-yaml folds the title exactly per spec), and
 * both byte-stability identities (applyEdits(raw, []) === raw,
 * replaceBody(raw, parsedBody) === raw) hold exactly as for every other
 * file. Only the *surgical title-edit probe* below is expected to refuse —
 * confirmed explicitly, not just skipped, so this document is proof the
 * refusal is real and intentional, not an accidental gap.
 */
const KNOWN_UNSCANNABLE_TITLE_EXCEPTIONS = new Set([
  "content/blog/2005/2005-02-10-party-the-software-isnt-old-enough-to-drink-but-that-doesnt-mean-you-cant.html",
  "content/blog/2006/2006-06-05-best-practical-solutions-announces-svk-acquisition-total-world-domination-plan-proceeding-apace.html",
  "content/blog/2007/2007-08-03-hey-were-having-a-party-cuz-we-got-married-on-august-11-in-somerville-ma.html",
]);

const MANAGED_CORPUS_EXTENSIONS = [".md", ".html"];

function walk(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (
      entry.isFile() &&
      MANAGED_CORPUS_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
    ) {
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

      // The byte-stability guarantee (applyEdits(raw, []) === raw and
      // replaceBody(raw, parsedBody) === raw) is unconditional on every file
      // that parses — required for every real file, no exceptions.
      const check = computeRoundTripCheck(logicalPath, raw);
      expect(check.parseOk).toBe(true);
      expect(check.noEditIdentical).toBe(true);
      expect(check.bodyReplaceIdentical).toBe(true);

      if (KNOWN_UNSCANNABLE_TITLE_EXCEPTIONS.has(logicalPath)) {
        // See the set's doc comment: confirmed, intentional refusal — not a
        // byte-stability gap.
        expect(check.editOk).toBe(false);
        return;
      }
      expect(check.editOk).toBe(true);
      expect(check.localityPreserved).toBe(true);
    });
  }
});
