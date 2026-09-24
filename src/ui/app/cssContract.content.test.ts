// ABOUTME: macOS Write mode and controls CSS: the blog's values, on the elements
// ABOUTME: that actually render them, and never outside a Write-mode document.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const RULE = /([^{}]+)\{([^{}]*)\}/g;
const WHITESPACE = /\s+/g;
const SERIF_FAMILY = /font-family:[^;]*(Crimson|DM Serif)/;
const CREPE_FONT_VAR = /--crepe-font-/;
const REDUCED_MOTION_SHEET =
  /@media \(prefers-reduced-motion: reduce\)\s*\{\s*html\[data-platform="macos"\] \.dialog:not\(\.quick-open\)\s*\{\s*animation: none;/;
const WRITE_DOC = 'html[data-platform="macos"] .editor-doc[data-editor-mode="write"]';

interface Rule {
  selectors: string[];
  body: string;
}

function rules(): Rule[] {
  const css = [
    "./app-macos-writing.css",
    "./app-macos-controls.css",
    "./app-macos-chrome.css",
    "./app-macos-surfaces.css",
  ]
    .map((file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"))
    .join("\n")
    .replace(CSS_COMMENT, "");
  return [...css.matchAll(RULE)].map((match) => ({
    selectors: (match[1] ?? "").split(",").map((s) => s.replace(WHITESPACE, " ").trim()),
    body: match[2] ?? "",
  }));
}

/** The declarations applied to `selector` (a rule may list several), by property. */
function declarationsFor(selector: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const rule of rules().filter((r) => r.selectors.includes(selector))) {
    for (const declaration of rule.body.split(";")) {
      const [property, ...value] = declaration.split(":");
      if (property?.trim() && value.length > 0) {
        declarations[property.trim()] = value.join(":").trim();
      }
    }
  }
  return declarations;
}

describe("Write mode typography (macOS)", () => {
  it("sets paragraphs themselves in Crimson Pro 19px/1.7, clearing Crepe's padding", () => {
    const p = declarationsFor(`${WRITE_DOC} .ProseMirror p`);
    expect(p["font-family"]).toContain('"Crimson Pro Variable"');
    expect(p).toMatchObject({
      "font-size": "19px",
      "line-height": "1.7",
      padding: "0",
      margin: "0 0 1.4em",
    });
  });

  it("sets h2 in DM Serif Display 32px at the one weight that ships", () => {
    const h2 = declarationsFor(`${WRITE_DOC} .ProseMirror h2`);
    expect(h2["font-family"]).toContain('"DM Serif Display"');
    expect(h2).toMatchObject({ "font-size": "32px", "font-weight": "400", margin: "2em 0 0.6em" });
  });

  it("sets h3 in JetBrains Mono 12px, weight 500, with a sane line height", () => {
    const h3 = declarationsFor(`${WRITE_DOC} .ProseMirror h3`);
    expect(h3["font-family"]).toContain('"JetBrains Mono"');
    expect(h3).toMatchObject({ "font-size": "12px", "font-weight": "500", "line-height": "1.4" });
  });

  it("sets code blocks through CodeMirror's scroller", () => {
    const code = declarationsFor(`${WRITE_DOC} .milkdown-code-block .cm-scroller`);
    expect(code["font-family"]).toContain('"JetBrains Mono"');
    expect(code).toMatchObject({ "font-size": "14px", "line-height": "1.5" });
  });

  it("sets the title in DM Serif Display 40px", () => {
    const title = declarationsFor(`${WRITE_DOC} .editor-title-input`);
    expect(title["font-family"]).toContain('"DM Serif Display"');
    expect(title).toMatchObject({ "font-size": "40px", "letter-spacing": "-0.025em" });
  });

  it("names a serif only inside a Write-mode document", () => {
    for (const rule of rules().filter((r) => SERIF_FAMILY.test(r.body))) {
      for (const selector of rule.selectors) {
        expect(selector.startsWith(WRITE_DOC)).toBe(true);
      }
    }
  });
});

describe("entry rows (macOS)", () => {
  it("turns the conflict symbol white on a focused selection", () => {
    const symbol = declarationsFor(
      'html[data-platform="macos"] .entry-list-scroll:focus-within .entry-row-item[data-selected="true"] .entry-row-conflict',
    );
    expect(symbol.color).toBe("#ffffff");
  });

  it("leaves room for the symbol on conflicted rows", () => {
    const conflictedRow = declarationsFor(
      'html[data-platform="macos"] .entry-row-item[data-conflicted="true"] .entry-row',
    );
    expect(conflictedRow["padding-right"]).toBe("32px");
  });
});

it("keeps the unsaved-changes dot in a fixed gutter so titles line up", () => {
  expect(declarationsFor('html[data-platform="macos"] .entry-row-badges').width).toBe("6px");
});

describe("Write mode leaves Crepe's own controls alone", () => {
  it("never overrides Crepe's font variables (its link, code-language and image controls use them)", () => {
    for (const rule of rules()) {
      expect(rule.body).not.toMatch(CREPE_FONT_VAR);
    }
  });

  it("sets every heading at DM Serif Display's one shipped weight, except the mono h3", () => {
    for (const level of ["h1", "h2", "h4", "h5", "h6"]) {
      const heading = declarationsFor(`${WRITE_DOC} .ProseMirror ${level}`);
      expect(heading["font-family"]).toContain('"DM Serif Display"');
      expect(heading["font-weight"]).toBe("400");
    }
  });

  it("puts the body face on the document itself, for any other block text", () => {
    expect(declarationsFor(`${WRITE_DOC} .ProseMirror`)["font-family"]).toContain(
      '"Crimson Pro Variable"',
    );
  });
});

describe("audit fixes: contrast and motion (macOS)", () => {
  it("year headers use secondary label, not tertiary (bold 11px needs 3:1)", () => {
    expect(declarationsFor('html[data-platform="macos"] .entry-list-year').color).toBe(
      "var(--text-muted)",
    );
  });

  it("the conflict badge's digits are black on orange (white is 2.2:1)", () => {
    expect(
      declarationsFor(
        'html[data-platform="macos"] .sync-status-button[data-kind="conflict"] .sync-status-badge',
      ).color,
    ).toBe("#000000");
  });

  it("Reduce Motion stops the macOS sheet's slide", () => {
    const surfaces = readFileSync(
      fileURLToPath(new URL("./app-macos-surfaces.css", import.meta.url)),
      "utf8",
    );
    expect(surfaces).toMatch(REDUCED_MOTION_SHEET);
  });
});

describe("audit fixes: native lists and buttons (macOS)", () => {
  it("insets rows with a rounded selection", () => {
    expect(declarationsFor('html[data-platform="macos"] .entry-row')).toMatchObject({
      margin: "0 8px",
      "border-radius": "6px",
    });
  });

  it("drops hover fills without touching the selection or the primary button", () => {
    const hoverSelectors = rules()
      .flatMap((rule) => rule.selectors)
      .filter((selector) => selector.includes(":hover") && selector.includes("macos"));
    for (const selector of hoverSelectors.filter((s) => s.includes(".entry-row"))) {
      expect(selector).toContain(':not([aria-current="true"])');
    }
    for (const selector of hoverSelectors.filter((s) => s.includes(".btn"))) {
      expect(selector).toContain(":not(.btn-primary)");
    }
  });
});
