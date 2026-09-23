// ABOUTME: Structural checks on the stylesheets — invariants the native Mac
// ABOUTME: redesign depends on that no type checker sees (scoping, token coverage).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Keyframe steps (`from`, `to`, `50%`) look like rule heads but aren't selectors. */
const KEYFRAME_STEP = /^(from|to|[\d.]+%)$/;
const NOT_MAC = /^html:not\(\[data-platform="macos"\]\)\s/;
const MAC = /^html\[data-platform="macos"\]/;
const ROOT_TOKEN = /(--[a-z0-9-]+)\s*:/g;
const IMPORT = /@import "\.\/([^"]+)"/g;
const COLOR_SCHEME = /html\[data-platform="macos"\]\s*\{[^}]*color-scheme:\s*light dark/;
const TEXT_LABEL = /--text:\s*-apple-system-label/;
const BORDER_SEPARATOR = /--border:\s*-apple-system-separator/;
const ACCENT = /--accent:\s*AccentColor/;
const ACCENT_TEXT = /--accent-text:\s*#ffffff/;
const FOCUSED_SELECTION =
  /:focus-within\s[^{]*\[aria-current="true"\][^{]*\{[^}]*background:\s*var\(--bg-selected\)[^}]*color:\s*#ffffff/;
const UNFOCUSED_SELECTION =
  /\[aria-current="true"\][^{]*\{[^}]*background:\s*var\(--bg-selected-inactive\)[^}]*color:\s*var\(--text\)/;
const SELECTED_META =
  /:focus-within\s[^{]*\[aria-current="true"\]\s+\.entry-row-meta[^{]*\{[^}]*color:\s*rgba\(255, 255, 255, 0\.8\)/;
const BASE_FOCUS_RULE =
  /(^|\n):focus-visible\s*\{[^}]*outline:\s*var\(--focus-ring-width\) solid var\(--focus-ring-color\)/;
const MAC_FOCUS_WIDTH = /--focus-ring-width:\s*3px/;
const MAC_FOCUS_COLOR = /--focus-ring-color:\s*color-mix\(in srgb, AccentColor 50%, transparent\)/;
const LIST_ROWS_NO_RING =
  /:is\(\.sidebar-section-button, \.entry-row\)\[aria-current="true"\]\s*\{[^}]*--focus-ring-width:\s*0/;
const FOCUS_SCOPE_TOO_WIDE = /\.(sidebar|entry-list-pane):focus-within/;
const SELECTED_BADGES =
  /:focus-within\s[^{]*\[aria-current="true"\]\s+\.pill-badge[^{]*\{[^}]*color:\s*#ffffff/;
const SELECTED_DOT =
  /:focus-within\s[^{]*\[aria-current="true"\]\s+\.dot-badge[^{]*\{[^}]*background:\s*#ffffff/;
const SCROLLBAR_RULE = /::-webkit-scrollbar/;
const CURSOR_DEFAULT = /cursor:\s*default/;
const CHROME_UNSELECTABLE =
  /:is\(\.sidebar, \.entry-list-pane, \.editor-toolbar\)\s*\{[^}]*-webkit-user-select:\s*none;[^}]*\buser-select:\s*none/;
const FIELDS_SELECTABLE =
  /:is\(input, textarea\)\s*\{[^}]*-webkit-user-select:\s*text;[^}]*\buser-select:\s*text/;
const BODY_UNSELECTABLE = /body\s*\{[^}]*user-select/;

const APP_DIR = new URL("./", import.meta.url);

function readCss(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, APP_DIR)), "utf8");
}

/** Comma-separated selectors of a rule head, ignoring commas inside
 *  parentheses (`:is(a, b)` is one selector, not two). */
function splitSelectors(head: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of head) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
}

/** Every style rule's selector head in `css` (at-rule wrappers skipped). */
function ruleHeads(css: string): string[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((chunk) => chunk.split("{").at(-2)?.trim() ?? "")
    .filter((head) => head.length > 0 && !head.startsWith("@") && !KEYFRAME_STEP.test(head));
}

/** Body of the first block opened by `prelude` (e.g. an @media query). */
function blockBody(css: string, prelude: string): string {
  const start = css.indexOf(prelude);
  if (start < 0) {
    throw new Error(`no block starting with ${prelude}`);
  }
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") {
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, i);
      }
    }
  }
  throw new Error(`unterminated block: ${prelude}`);
}

/** Custom property names declared in app.css's first :root block. */
function rootTokens(): string[] {
  const css = readCss("app.css");
  return [...blockBody(css, ":root {").matchAll(ROOT_TOKEN)].map((m) => m[1] ?? "");
}

describe("compact (phone) CSS never applies on macOS", () => {
  it("scopes every selector in app-mobile.css's 760px block to non-Mac", () => {
    const block = blockBody(readCss("app-mobile.css"), "@media (max-width: 760px)");
    const selectors = ruleHeads(block).flatMap(splitSelectors);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toMatch(NOT_MAC);
    }
  });
});

describe("macOS token block (app-macos.css)", () => {
  const mac = readCss("app-macos.css");

  it("overrides every token app.css defines", () => {
    const tokens = rootTokens();
    expect(tokens.length).toBeGreaterThan(10);
    for (const token of tokens) {
      expect(mac.includes(`${token}:`), `missing ${token}`).toBe(true);
    }
  });

  it("declares color-scheme and never uses light-dark()", () => {
    expect(mac).toMatch(COLOR_SCHEME);
    expect(mac).not.toContain("light-dark(");
  });

  it("uses system colors for text, separators, and the accent", () => {
    expect(mac).toMatch(TEXT_LABEL);
    expect(mac).toMatch(BORDER_SEPARATOR);
    expect(mac).toMatch(ACCENT);
    expect(mac).toMatch(ACCENT_TEXT);
  });

  it("scopes every rule to the Mac platform", () => {
    const selectors = ruleHeads(mac).flatMap(splitSelectors);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toMatch(MAC);
    }
  });

  it("is loaded after every base partial so it wins", () => {
    const imports = [...readCss("app.css").matchAll(IMPORT)].map((m) => m[1] ?? "");
    const firstMac = imports.findIndex((name) => name.startsWith("app-macos"));
    expect(imports[firstMac]).toBe("app-macos.css");
    expect(imports.slice(firstMac).every((name) => name.startsWith("app-macos"))).toBe(true);
  });

  it("scopes every rule in the macOS chrome stylesheet to the Mac platform", () => {
    const selectors = ruleHeads(readCss("app-macos-chrome.css")).flatMap(splitSelectors);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toMatch(MAC);
    }
  });
});

describe("macOS selection and focus", () => {
  const mac = readCss("app-macos.css");

  it("draws the focused list's selection as white text on the selection color", () => {
    expect(mac).toMatch(FOCUSED_SELECTION);
  });

  it("counts only focus on the rows themselves, not the search field or sidebar buttons", () => {
    expect(mac).toContain(".entry-list-scroll:focus-within");
    expect(mac).toContain(".sidebar-sections:focus-within");
    expect(mac).not.toMatch(FOCUS_SCOPE_TOO_WIDE);
  });

  it("keeps badges readable on a focused selection", () => {
    expect(mac).toMatch(SELECTED_BADGES);
    expect(mac).toMatch(SELECTED_DOT);
  });

  it("draws an unfocused selection in unemphasized gray with label text", () => {
    expect(mac).toMatch(UNFOCUSED_SELECTION);
  });

  it("keeps the date inside a focused selection readable", () => {
    expect(mac).toMatch(SELECTED_META);
  });

  it("draws no ring on the selected row only: its selection color shows focus", () => {
    expect(mac).toMatch(LIST_ROWS_NO_RING);
  });

  it("widens the focus ring through variables, so outline:none opt-outs still win", () => {
    expect(readCss("app.css")).toMatch(BASE_FOCUS_RULE);
    expect(mac).toMatch(MAC_FOCUS_WIDTH);
    expect(mac).toMatch(MAC_FOCUS_COLOR);
    // No Mac-specific :focus-visible rule: one would outrank the opt-outs.
    expect(ruleHeads(mac).some((head) => head.includes(":focus-visible"))).toBe(false);
  });
});

describe("macOS chrome behavior", () => {
  it("never styles scrollbars on macOS (native overlay scrollbars return)", () => {
    const heads = ruleHeads(readCss("app.css")).filter((head) => SCROLLBAR_RULE.test(head));
    expect(heads.length).toBeGreaterThan(0);
    for (const selector of heads.flatMap(splitSelectors)) {
      expect(selector).toMatch(NOT_MAC);
    }
  });

  it("uses the arrow cursor for controls", () => {
    expect(readCss("app-macos.css")).toMatch(CURSOR_DEFAULT);
  });

  it("makes chrome unselectable (prefixed: WKWebView ignores the bare property)", () => {
    expect(readCss("app-macos.css")).toMatch(CHROME_UNSELECTABLE);
  });

  it("keeps fields inside chrome, and all content, selectable", () => {
    const mac = readCss("app-macos.css");
    expect(mac).toMatch(FIELDS_SELECTABLE);
    // Content (versions, sync-log detail, dialogs) must stay copyable, so the
    // rule may not cover the whole page.
    expect(mac).not.toMatch(BODY_UNSELECTABLE);
  });
});
