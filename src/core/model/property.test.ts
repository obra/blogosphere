// ABOUTME: fast-check property tests — parse totality, applyEdits locality
// ABOUTME: under randomized front matter, slugify totality, path round-trips.

import process from "node:process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyEditsImpl } from "./applyEdits";
import { parseEntry } from "./entry";
import { pathFor, pathParts, slugify } from "./paths";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS ?? DEFAULT_FUZZ_RUNS);

const FIXED_PATH = "content/blog/2026/2026-01-01-fuzz.md";
const SLUG_SAFE_CHARS_RE = /^[A-Za-z0-9._-]+$/;
const SLUG_ARB_RE = /^[A-Za-z0-9._-]{1,20}$/;
const ISO_YEAR_LENGTH = 4;

describe("property: parseEntry never throws", () => {
  it("property: parseEntry(path, raw) never throws for arbitrary raw text", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (path, raw) => {
        const result = parseEntry(path, raw);
        expect(typeof result.ok).toBe("boolean");
      }),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("property: parseEntry never throws on arbitrary raw fed through a fixed valid path", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const result = parseEntry(FIXED_PATH, raw);
        expect(typeof result.ok).toBe("boolean");
      }),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("property: applyEdits never throws for arbitrary raw text and a title edit", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (raw, title) => {
        const result = applyEditsImpl(raw, [{ field: "title", value: title }]);
        expect(typeof result.ok).toBe("boolean");
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

// --- applyEdits: reflects the edit, preserves untouched keys' raw lines ---

type DecoyStyle = "plain" | "double" | "single" | "array" | "block";
type TitleStyle = "plain" | "double" | "block";

interface DecoyField {
  key: string;
  style: DecoyStyle;
  words: string[];
}

const DECOY_KEY_POOL = [
  "parent_id",
  "password",
  "status",
  "categories",
  "author",
  "weight",
  "note",
  "customA",
  "customB",
  "customC",
  "misc",
];

const wordArb = fc.constantFrom(
  "alpha",
  "beta",
  "gamma",
  "delta",
  "word",
  "value",
  "item",
  "thing",
);

function decoyLines(field: DecoyField): string[] {
  const content = field.words.join(" ");
  switch (field.style) {
    case "plain":
      return [`${field.key}: ${content}`];
    case "double":
      return [`${field.key}: "${content}"`];
    case "single":
      return [`${field.key}: '${content}'`];
    case "array":
      return [`${field.key}: [${field.words.join(", ")}]`];
    case "block":
      return [`${field.key}: |`, `  ${content}`];
    default:
      return [`${field.key}: ${content}`];
  }
}

function fieldsText(fields: DecoyField[]): string {
  return fields.flatMap((f) => decoyLines(f)).reduce((acc, line) => `${acc}${line}\n`, "");
}

function titleLines(style: TitleStyle, content: string): string[] {
  if (style === "double") {
    return [`title: "${content}"`];
  }
  if (style === "block") {
    return ["title: |", `  ${content}`];
  }
  return [`title: ${content}`];
}

const decoyFieldArb = fc.record({
  key: fc.constantFrom(...DECOY_KEY_POOL),
  style: fc.constantFrom<DecoyStyle>("plain", "double", "single", "array", "block"),
  words: fc.array(wordArb, { minLength: 1, maxLength: 3 }),
});

const decoysArb = fc.uniqueArray(decoyFieldArb, {
  selector: (f) => f.key,
  minLength: 0,
  maxLength: DECOY_KEY_POOL.length,
});

const documentArb = fc.record({
  before: decoysArb,
  after: decoysArb,
  titlePresent: fc.boolean(),
  titleStyle: fc.constantFrom<TitleStyle>("plain", "double", "block"),
  titleWords: fc.array(wordArb, { minLength: 1, maxLength: 3 }),
  newTitleWords: fc.array(wordArb, { minLength: 1, maxLength: 3 }),
});

describe("property: applyEdits reflects the edit and preserves untouched lines", () => {
  it("property: editing title never disturbs decoy fields before or after it", () => {
    fc.assert(
      fc.property(documentArb, (doc) => {
        // Keep "before" and "after" key sets disjoint so the doc has no
        // duplicate top-level keys (which would make it unscannable, a
        // different — separately tested — code path).
        fc.pre(doc.before.every((b) => !doc.after.some((a) => a.key === b.key)));

        const beforeText = fieldsText(doc.before);
        const afterText = fieldsText(doc.after);
        const newTitleValue = doc.newTitleWords.join(" ");

        const existingTitleText = doc.titlePresent
          ? titleLines(doc.titleStyle, doc.titleWords.join(" "))
              .map((l) => `${l}\n`)
              .join("")
          : "";
        const frontMatterText = `${beforeText}${existingTitleText}${afterText}`;
        const raw = `---\n${frontMatterText}---\n\nBody.\n`;

        const result = applyEditsImpl(raw, [{ field: "title", value: newTitleValue }]);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }

        const newTitleLine = `title: ${newTitleValue}\n`;
        const expectedFrontMatterText = doc.titlePresent
          ? `${beforeText}${newTitleLine}${afterText}`
          : `${beforeText}${afterText}${newTitleLine}`;
        const expectedRaw = `---\n${expectedFrontMatterText}---\n\nBody.\n`;
        expect(result.raw).toBe(expectedRaw);

        const reparsed = parseEntry(FIXED_PATH, result.raw);
        expect(reparsed.ok).toBe(true);
        if (reparsed.ok) {
          expect(reparsed.entry.title).toBe(newTitleValue);
        }
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

// --- slugify: total and idempotent ---

describe("property: slugify", () => {
  it("property: slugify is total (never throws, never empty) for any string", () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const result = slugify(title);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("property: slugify(slugify(x)) === slugify(x)", () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const once = slugify(title);
        expect(slugify(once)).toBe(once);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("property: slugify never introduces a character outside [A-Za-z0-9._-]", () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        expect(slugify(title)).toMatch(SLUG_SAFE_CHARS_RE);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

// --- pathFor / pathParts round-trip ---

describe("property: pathFor/pathParts round-trip", () => {
  it("property: pathParts(pathFor(kind, date, slug)) recovers date and slug", () => {
    const ymdArb = fc.tuple(
      fc.integer({ min: 1000, max: 9999 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 }),
    );
    fc.assert(
      fc.property(
        fc.constantFrom("post", "draft", "link", "release") as fc.Arbitrary<
          "post" | "draft" | "link" | "release"
        >,
        ymdArb,
        fc.stringMatching(SLUG_ARB_RE),
        (kind, [year, month, day], slug) => {
          const yearStr = String(year).padStart(ISO_YEAR_LENGTH, "0");
          const date = `${yearStr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const path = pathFor(kind, date, slug);
          const parts = pathParts(path);
          expect(parts).not.toBeNull();
          if (parts) {
            expect(parts.date).toBe(date);
            expect(parts.slug).toBe(slug);
            expect(parts.year).toBe(yearStr);
          }
        },
      ),
      { numRuns: FUZZ_RUNS },
    );
  });
});
