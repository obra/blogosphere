// @vitest-environment jsdom
// ABOUTME: The mandated shortcode round-trip test — proves nunjucks shortcodes
// ABOUTME: ({% image %}, {% dotfile %}, ...) and raw HTML survive a WYSIWYG load->serialize
// ABOUTME: cycle as literal text, since commonmark has no idea what they are.
import process from "node:process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { headlessRoundTrip } from "./headless-milkdown";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;
const YMD_DIGITS = 8;
const HMS_DIGITS = 6;
const MIN_EXT_LENGTH = 1;
const MAX_EXT_LENGTH = 4;
const DIGIT_CHARS = [..."0123456789"];
// biome-ignore lint/security/noSecrets: the literal lowercase alphabet, not a secret.
const EXT_CHARS = [..."abcdefghijklmnopqrstuvwxyz"];

function digitString(length: number) {
  return fc.string({ unit: fc.constantFrom(...DIGIT_CHARS), minLength: length, maxLength: length });
}

describe("shortcode round-trip", () => {
  it.each([
    ["bare shortcode paragraph", '{% image "x.png" %}\n'],
    ["shortcode surrounded by prose", 'See {% image "x.png" %} above.\n'],
    ["dotfile shortcode", '{% dotfile "keyboardrc" %}\n'],
    [
      "multiline shortcode pair (highlight/endhighlight)",
      '{% highlight "js" %}\nvar x = 1;\n{% endhighlight %}\n',
    ],
    ["nunjucks variable interpolation", "Hello {{ name }}!\n"],
    // Matches this project's actual asset-naming convention (dashes, see the
    // Images spec section: pasted-image-YYYYMMDD-HHMMSS.png) — see below for
    // the underscore/asterisk caveat that convention happens to avoid.
    [
      "shortcode with a dashed filename argument",
      '{% image "pasted-image-20260715-093012.png" %}\n',
    ],
    ["shortcode between two other paragraphs", 'Before.\n\n{% image "x.png" %}\n\nAfter.\n'],
  ])("%s", async (_name, markdown) => {
    const out = await headlessRoundTrip(markdown);
    expect(out).toBe(markdown);
  });
});

describe("shortcode round-trip: known escaping limitations", () => {
  it("KNOWN LIMITATION: _ and * inside a shortcode argument get backslash-escaped", async () => {
    // Milkdown's serializer has no concept of nunjucks shortcodes — it sees
    // `{% image "a_b*c.png" %}` as a plain text run, and escapes any
    // character that could be re-parsed as markdown syntax (`_`/`*` read as
    // emphasis markers) wherever it appears, shortcode or not. So a real
    // filename containing an underscore would come back
    // `{% image "a\_b\*c.png" %}` after any edit that round-trips through
    // WYSIWYG mode — silently corrupting the shortcode's argument string
    // from nunjucks' point of view. This project's own asset filenames are
    // dash-based (see above) and don't hit this, but a pre-existing post
    // referencing an underscore-containing filename would. Flagged here
    // rather than silently passed; a real fix (a remark-stringify escape
    // override, or a corpus check for this pattern) is out of scope for
    // this component family and worth a follow-up.
    const markdown = '{% image "a_b*c.png" %}\n';
    const out = await headlessRoundTrip(markdown);
    expect(out).toBe('{% image "a\\_b\\*c.png" %}\n');
  });

  it("KNOWN LIMITATION: a letter-containing argument segment before a . can also get escaped", async () => {
    // A lone letter immediately followed by a period (`A.`, `W.a`) is
    // escaped wherever it starts a "word" — the serializer is guarding
    // against letter/roman-numeral ordered-list markers some markdown
    // flavors support, not just CommonMark's digit-only `1.`. This isn't
    // limited to single letters either (`aw.a` also escapes) — the exact
    // boundary is an internal mdast-util-to-markdown heuristic this file
    // doesn't try to fully characterize. What *is* confirmed safe: an
    // all-digit segment before the period, of any length (see the property
    // test below, which mirrors this project's real pasted-image-
    // YYYYMMDD-HHMMSS.ext convention) — so this is a real risk only for
    // hand-written or pre-existing filenames that mix letters with a
    // trailing period, not for anything the client itself generates.
    const markdown = '{% image "W.a" %}\n';
    const out = await headlessRoundTrip(markdown);
    expect(out).toBe('{% image "W\\.a" %}\n');
  });
});

describe("raw HTML round-trip", () => {
  it.each([
    ["inline raw HTML", "Some <b>bold html</b> text.\n"],
    ["block-level raw HTML", "<div>\n  raw html\n</div>\n"],
  ])("%s", async (_name, markdown) => {
    const out = await headlessRoundTrip(markdown);
    expect(out).toBe(markdown);
  });
});

describe("image reference round-trip (see Images spec section)", () => {
  it.each([
    ["basic image", "![alt text](/assets/2026/07/foo.png)\n"],
    ["image with title", '![alt text](/assets/2026/07/foo.png "a title")\n'],
    ["image with empty alt", "![](/assets/2026/07/foo.png)\n"],
  ])("%s", async (_name, markdown) => {
    const out = await headlessRoundTrip(markdown);
    expect(out).toBe(markdown);
  });
});

describe("shortcode round-trip: properties", () => {
  // Mirrors this project's actual asset-naming convention (see the Images
  // spec section): pasted-image-YYYYMMDD-HHMMSS.ext. Only the digit groups
  // and extension vary — see the "KNOWN LIMITATION" tests above for why a
  // letter-containing stem isn't reliably safe to fuzz here.
  it("property: a pasted-image-YYYYMMDD-HHMMSS.ext shortcode always survives verbatim", async () => {
    const filename = fc
      .tuple(
        digitString(YMD_DIGITS),
        digitString(HMS_DIGITS),
        fc.string({
          unit: fc.constantFrom(...EXT_CHARS),
          minLength: MIN_EXT_LENGTH,
          maxLength: MAX_EXT_LENGTH,
        }),
      )
      .map(([ymd, hms, ext]) => `pasted-image-${ymd}-${hms}.${ext}`);
    await fc.assert(
      fc.asyncProperty(filename, async (arg) => {
        const markdown = `{% image "${arg}" %}\n`;
        const out = await headlessRoundTrip(markdown);
        return out === markdown;
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
