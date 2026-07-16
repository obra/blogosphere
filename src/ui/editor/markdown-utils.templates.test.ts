// ABOUTME: Unit + property tests for the markdown/html template builders in
// ABOUTME: markdown-utils.ts: buildImageMarkdown, buildImageHtml, buildImageRef, and buildLinkMarkdown.
import process from "node:process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildImageHtml,
  buildImageMarkdown,
  buildImageRef,
  buildLinkMarkdown,
} from "./markdown-utils";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;
const MAX_FUZZ_STRING_LENGTH = 40;
const URL_PLACEHOLDER = "https://";

describe("buildImageMarkdown", () => {
  const ref = "/assets/2026/07/foo.png";

  it("builds an image ref with empty alt by default", () => {
    expect(buildImageMarkdown(ref)).toBe(`![](${ref})`);
  });

  it("includes alt text when given", () => {
    const alt = "a keyboard";
    expect(buildImageMarkdown(ref, alt)).toBe(`![${alt}](${ref})`);
  });

  it("property: always matches the literal ![alt](ref) shape", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (anyRef, alt) => buildImageMarkdown(anyRef, alt) === `![${alt}](${anyRef})`,
      ),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("buildImageHtml", () => {
  const ref = "/assets/2026/07/foo.png";

  it("builds an <img> tag with an empty alt attribute by default", () => {
    expect(buildImageHtml(ref)).toBe(`<img src="${ref}" alt="">`);
  });

  it("includes alt text when given", () => {
    const alt = "a keyboard";
    expect(buildImageHtml(ref, alt)).toBe(`<img src="${ref}" alt="${alt}">`);
  });

  it('property: always matches the literal <img src="ref" alt="alt"> shape', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (anyRef, alt) => buildImageHtml(anyRef, alt) === `<img src="${anyRef}" alt="${alt}">`,
      ),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("buildImageRef", () => {
  const ref = "/assets/2026/07/foo.png";
  const alt = "a keyboard";

  it("defaults to the markdown template", () => {
    expect(buildImageRef("markdown", ref, alt)).toBe(buildImageMarkdown(ref, alt));
  });

  it("uses the markdown template explicitly", () => {
    expect(buildImageRef("markdown", ref, alt)).toBe(buildImageMarkdown(ref, alt));
  });

  it("uses the html template for sourceLanguage 'html'", () => {
    expect(buildImageRef("html", ref, alt)).toBe(buildImageHtml(ref, alt));
  });

  it("property: always delegates to exactly one of the two templates, by language", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("markdown", "html"),
        fc.string(),
        fc.string(),
        (sourceLanguage, anyRef, anyAlt) => {
          const expected =
            sourceLanguage === "html"
              ? buildImageHtml(anyRef, anyAlt)
              : buildImageMarkdown(anyRef, anyAlt);
          return buildImageRef(sourceLanguage, anyRef, anyAlt) === expected;
        },
      ),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("buildLinkMarkdown", () => {
  it("uses a placeholder label when there is no selection", () => {
    const { markdown } = buildLinkMarkdown("");
    expect(markdown).toBe(`[link text](${URL_PLACEHOLDER})`);
  });

  it("uses the selected text as the label", () => {
    const label = "the docs";
    const { markdown } = buildLinkMarkdown(label);
    expect(markdown).toBe(`[${label}](${URL_PLACEHOLDER})`);
  });

  it("returns offsets that select exactly the https:// placeholder", () => {
    const { markdown, urlFrom, urlTo } = buildLinkMarkdown("here");
    expect(markdown.slice(urlFrom, urlTo)).toBe(URL_PLACEHOLDER);
  });

  it("property: urlFrom/urlTo always bracket exactly the https:// placeholder", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: MAX_FUZZ_STRING_LENGTH }), (selectedText) => {
        const { markdown, urlFrom, urlTo } = buildLinkMarkdown(selectedText);
        return (
          urlFrom >= 0 &&
          urlTo <= markdown.length &&
          urlFrom <= urlTo &&
          markdown.slice(urlFrom, urlTo) === URL_PLACEHOLDER
        );
      }),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("property: a non-empty label always appears verbatim right after the opening bracket", () => {
    const nonEmpty = fc.string({ maxLength: MAX_FUZZ_STRING_LENGTH }).filter((s) => s.length > 0);
    fc.assert(
      fc.property(nonEmpty, (selectedText) => {
        const { markdown } = buildLinkMarkdown(selectedText);
        return markdown === `[${selectedText}](${URL_PLACEHOLDER})`;
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
