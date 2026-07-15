// ABOUTME: Unit + property tests for the CodeMirror transaction builders in
// ABOUTME: markdown-utils.ts: insertAtCursor, insertTextAt, wrapSelection, setLinePrefix.
import process from "node:process";
import { EditorSelection, EditorState } from "@codemirror/state";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { insertAtCursor, insertTextAt, setLinePrefix, wrapSelection } from "./markdown-utils";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;
const MAX_FUZZ_STRING_LENGTH = 40;
const OUT_OF_BOUNDS_OFFSET = 5;

function stateWithCursor(doc: string, pos: number): EditorState {
  return EditorState.create({ doc, selection: EditorSelection.cursor(pos) });
}

function stateWithSelection(doc: string, from: number, to: number): EditorState {
  return EditorState.create({ doc, selection: EditorSelection.range(from, to) });
}

/** An arbitrary string plus two positions within it, for range-based properties. */
function stringWithRange(maxLength: number) {
  return fc.string({ maxLength }).chain((doc) =>
    fc.record({
      doc: fc.constant(doc),
      a: fc.nat(doc.length),
      b: fc.nat(doc.length),
    }),
  );
}

describe("insertAtCursor", () => {
  it("inserts at a collapsed cursor and places the cursor after the text", () => {
    const before = "hello";
    const state = stateWithCursor(`${before} world`, before.length);
    const insert = ",";
    const next = state.update(insertAtCursor(state, insert)).state;
    expect(next.doc.toString()).toBe("hello, world");
    expect(next.selection.main.from).toBe(before.length + insert.length);
    expect(next.selection.main.to).toBe(before.length + insert.length);
  });

  it("replaces a non-empty selection", () => {
    const prefix = "hello ";
    const target = "world";
    const state = stateWithSelection(prefix + target, prefix.length, prefix.length + target.length);
    const insert = "there";
    const next = state.update(insertAtCursor(state, insert)).state;
    expect(next.doc.toString()).toBe("hello there");
    expect(next.selection.main.from).toBe(prefix.length + insert.length);
  });

  it("inserts at every range when there are multiple selections", () => {
    const firstLine = "a\n";
    const state = EditorState.create({
      doc: "a\nb\nc",
      selection: EditorSelection.create(
        [EditorSelection.cursor(0), EditorSelection.cursor(firstLine.length)],
        0,
      ),
      extensions: [EditorState.allowMultipleSelections.of(true)],
    });
    const next = state.update(insertAtCursor(state, "X")).state;
    expect(next.doc.toString()).toBe("Xa\nXb\nc");
  });

  it("can select a sub-range of the inserted text instead of placing the cursor after it", () => {
    const state = stateWithCursor("", 0);
    const template = "[text](https://)";
    const placeholder = "https://";
    const urlFrom = template.indexOf(placeholder);
    const urlTo = urlFrom + placeholder.length;
    const next = state.update(insertAtCursor(state, template, { from: urlFrom, to: urlTo })).state;
    expect(next.doc.toString()).toBe(template);
    expect(next.selection.main.from).toBe(urlFrom);
    expect(next.selection.main.to).toBe(urlTo);
    expect(next.sliceDoc(next.selection.main.from, next.selection.main.to)).toBe(placeholder);
  });
});

describe("insertAtCursor: properties", () => {
  it("property: inserting at a collapsed cursor at the start always prepends the text", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (doc, insert) => {
        const state = stateWithCursor(doc, 0);
        const next = state.update(insertAtCursor(state, insert)).state;
        return next.doc.toString() === insert + doc;
      }),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("property: replacing any selection removes exactly the selected slice", () => {
    fc.assert(
      fc.property(stringWithRange(MAX_FUZZ_STRING_LENGTH), fc.string(), ({ doc, a, b }, insert) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const state = stateWithSelection(doc, lo, hi);
        const next = state.update(insertAtCursor(state, insert)).state;
        return next.doc.toString() === doc.slice(0, lo) + insert + doc.slice(hi);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("insertTextAt", () => {
  it("inserts at the given absolute position regardless of live selection", () => {
    const before = "hello";
    const state = stateWithCursor(`${before} world`, 0);
    const mark = "!";
    const next = state.update(insertTextAt(state, before.length, mark)).state;
    expect(next.doc.toString()).toBe("hello! world");
    expect(next.selection.main.from).toBe(before.length + mark.length);
  });

  it("clamps a negative position to the start", () => {
    const state = stateWithCursor("abc", 0);
    const next = state.update(insertTextAt(state, -OUT_OF_BOUNDS_OFFSET, "X")).state;
    expect(next.doc.toString()).toBe("Xabc");
  });

  it("clamps an overlong position to the end", () => {
    const doc = "abc";
    const state = stateWithCursor(doc, 0);
    const next = state.update(insertTextAt(state, doc.length + OUT_OF_BOUNDS_OFFSET, "X")).state;
    expect(next.doc.toString()).toBe("abcX");
  });

  it("property: always equals doc.slice(0,pos) + text + doc.slice(pos) for an in-range pos", () => {
    fc.assert(
      fc.property(stringWithRange(MAX_FUZZ_STRING_LENGTH), fc.string(), ({ doc, a }, text) => {
        const state = stateWithCursor(doc, 0);
        const next = state.update(insertTextAt(state, a, text)).state;
        return next.doc.toString() === doc.slice(0, a) + text + doc.slice(a);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("wrapSelection", () => {
  it("wraps an empty selection and leaves the cursor between the markers", () => {
    const before = "hello ";
    const state = stateWithCursor(`${before} world`, before.length);
    const marker = "**";
    const next = state.update(wrapSelection(state, marker)).state;
    expect(next.doc.toString()).toBe("hello **** world");
    expect(next.selection.main.from).toBe(before.length + marker.length);
    expect(next.selection.main.to).toBe(before.length + marker.length);
  });

  it("wraps a non-empty selection and keeps the original text selected", () => {
    const target = "hello";
    const state = stateWithSelection(`${target} world`, 0, target.length);
    const next = state.update(wrapSelection(state, "**")).state;
    expect(next.doc.toString()).toBe("**hello** world");
    expect(next.sliceDoc(next.selection.main.from, next.selection.main.to)).toBe(target);
  });

  it("supports asymmetric before/after markers", () => {
    const target = "hello";
    const state = stateWithSelection(`${target} world`, 0, target.length);
    const next = state.update(wrapSelection(state, "<<", ">>")).state;
    expect(next.doc.toString()).toBe("<<hello>> world");
  });

  it("defaults `after` to `before`", () => {
    const target = "hi";
    const state = stateWithSelection(target, 0, target.length);
    const next = state.update(wrapSelection(state, "`")).state;
    expect(next.doc.toString()).toBe("`hi`");
  });
});

describe("wrapSelection: properties", () => {
  it("property: wrapping a full-document selection preserves the text inside the markers", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: MAX_FUZZ_STRING_LENGTH }),
        fc.constantFrom("**", "_", "`", "~~"),
        (doc, marker) => {
          const state = stateWithSelection(doc, 0, doc.length);
          const next = state.update(wrapSelection(state, marker)).state;
          const wrapped = next.sliceDoc(next.selection.main.from, next.selection.main.to);
          return next.doc.toString() === marker + doc + marker && wrapped === doc;
        },
      ),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("property: wrapping an empty selection inserts exactly before+after with the cursor in between", () => {
    fc.assert(
      fc.property(fc.constantFrom("**", "_", "`"), (marker) => {
        const before = "x";
        const state = stateWithCursor(`${before}y`, before.length);
        const next = state.update(wrapSelection(state, marker)).state;
        const cursor = before.length + marker.length;
        return (
          next.doc.toString() === `${before}${marker}${marker}y` &&
          next.selection.main.from === cursor &&
          next.selection.main.to === cursor
        );
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("setLinePrefix", () => {
  it("prepends the prefix to the line containing the cursor", () => {
    const doc = "hello world";
    const state = stateWithCursor(doc, "hel".length);
    const next = state.update(setLinePrefix(state, "## ")).state;
    expect(next.doc.toString()).toBe("## hello world");
  });

  it("is a no-op when the line already has the prefix", () => {
    const doc = "## hello world";
    const state = stateWithCursor(doc, "## hel".length);
    const next = state.update(setLinePrefix(state, "## ")).state;
    expect(next.doc.toString()).toBe(doc);
  });

  it("only affects the line the range starts on, for a multi-line document", () => {
    const state = stateWithCursor("first\nsecond\nthird", "first\nsec".length);
    const next = state.update(setLinePrefix(state, "## ")).state;
    expect(next.doc.toString()).toBe("first\n## second\nthird");
  });

  it("property: applying twice is the same as applying once (idempotent)", () => {
    const singleLine = fc
      .string({ maxLength: MAX_FUZZ_STRING_LENGTH })
      .filter((s) => !s.includes("\n"));
    fc.assert(
      fc.property(singleLine, (line) => {
        const state = stateWithCursor(line, 0);
        const once = state.update(setLinePrefix(state, "## ")).state;
        const twice = once.update(setLinePrefix(once, "## ")).state;
        return once.doc.toString() === twice.doc.toString();
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
