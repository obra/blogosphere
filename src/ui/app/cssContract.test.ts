// ABOUTME: Structural checks on the stylesheets — invariants the native Mac
// ABOUTME: redesign depends on that no type checker sees (scoping, token coverage).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const NOT_MAC = /^html:not\(\[data-platform="macos"\]\)\s/;
const MAC = /^html\[data-platform="macos"\]/;
const ROOT_TOKEN = /(--[a-z0-9-]+)\s*:/g;
const IMPORT = /@import "\.\/([^"]+)"/g;
const COLOR_SCHEME = /html\[data-platform="macos"\]\s*\{[^}]*color-scheme:\s*light dark/;
const TEXT_LABEL = /--text:\s*-apple-system-label/;
const BORDER_SEPARATOR = /--border:\s*-apple-system-separator/;
const ACCENT = /--accent:\s*AccentColor/;
const ACCENT_TEXT = /--accent-text:\s*#ffffff/;

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
    .filter((head) => head.length > 0 && !head.startsWith("@"));
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

  it("is loaded after the base tokens so it wins", () => {
    const imports = [...readCss("app.css").matchAll(IMPORT)].map((m) => m[1]);
    expect(imports.at(-1)).toBe("app-macos.css");
  });
});
