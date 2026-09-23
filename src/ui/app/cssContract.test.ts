// ABOUTME: Structural checks on the stylesheets — invariants the native Mac
// ABOUTME: redesign depends on that no type checker sees (scoping, token coverage).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const NOT_MAC = /^html:not\(\[data-platform="macos"\]\)\s/;

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
