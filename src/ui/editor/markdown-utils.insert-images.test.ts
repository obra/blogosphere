// ABOUTME: Unit tests for dispatchSpec and insertImagesAt in markdown-utils.ts —
// ABOUTME: the CM-view-dispatching orchestration behind paste/drop image handling.
import type { Transaction } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import type { DispatchableView } from "./markdown-utils";
import { dispatchSpec, insertAtCursor, insertImagesAt } from "./markdown-utils";

function createFakeView(doc: string): DispatchableView {
  let current = EditorState.create({ doc });
  return {
    get state() {
      return current;
    },
    dispatch: ((tr: Transaction) => {
      current = tr.state;
    }) as DispatchableView["dispatch"],
  };
}

function imageFile(name: string, content: string, type = "image/png"): File {
  return new File([content], name, { type });
}

/** `b` resolves before `a`, so a test using this proves insertion order
 * follows file order, not resolution order. */
function resolveOutOfOrder(bytes: Uint8Array): Promise<string | null> {
  const text = new TextDecoder().decode(bytes);
  const delay = text === "b" ? 0 : 1;
  return new Promise((resolve) => {
    setTimeout(() => resolve(`/r-${text}`), delay);
  });
}

function nullForSkip(bytes: Uint8Array): Promise<string | null> {
  const text = new TextDecoder().decode(bytes);
  return Promise.resolve(text === "skip" ? null : `/r-${text}`);
}

describe("dispatchSpec", () => {
  it("computes a TransactionSpec from the current state and dispatches it", () => {
    const view = createFakeView("hello");
    dispatchSpec(view, (state) => insertAtCursor(state, "!"));
    expect(view.state.doc.toString()).toBe("!hello");
  });
});

describe("insertImagesAt", () => {
  it("inserts a single image's markdown ref at the given position", async () => {
    const before = "before ";
    const view = createFakeView(`${before}after`);
    await insertImagesAt(view, [imageFile("a.png", "a")], {
      pos: before.length,
      onImage: (bytes) => Promise.resolve(`/assets/${new TextDecoder().decode(bytes)}.png`),
    });
    expect(view.state.doc.toString()).toBe("before ![](/assets/a.png)after");
  });

  it("inserts multiple images in file order, none overlapping, regardless of resolve order", async () => {
    const view = createFakeView("");
    const files = [imageFile("a.png", "a"), imageFile("b.png", "b")];
    await insertImagesAt(view, files, { pos: 0, onImage: resolveOutOfOrder });
    expect(view.state.doc.toString()).toBe("![](/r-a)![](/r-b)");
  });

  it("skips a file whose onImage returns null, still inserting the rest", async () => {
    const view = createFakeView("");
    const files = [imageFile("skip.png", "skip"), imageFile("keep.png", "keep")];
    await insertImagesAt(view, files, { pos: 0, onImage: nullForSkip });
    expect(view.state.doc.toString()).toBe("![](/r-keep)");
  });

  it("does nothing when there are no files", async () => {
    const view = createFakeView("unchanged");
    const onImage = vi.fn<(bytes: Uint8Array, ext: string) => Promise<string | null>>();
    await insertImagesAt(view, [], { pos: 0, onImage });
    expect(view.state.doc.toString()).toBe("unchanged");
    expect(onImage).not.toHaveBeenCalled();
  });

  it("calls onImage with the file's bytes and inferred extension", async () => {
    const view = createFakeView("");
    const onImage = vi.fn<(bytes: Uint8Array, ext: string) => Promise<string | null>>(() =>
      Promise.resolve("/assets/x.jpg"),
    );
    await insertImagesAt(view, [imageFile("photo.jpg", "content", "image/jpeg")], {
      pos: 0,
      onImage,
    });
    expect(onImage).toHaveBeenCalledTimes(1);
    const [bytes, ext] = onImage.mock.calls[0] ?? [];
    expect(ext).toBe("jpg");
    expect(bytes && new TextDecoder().decode(bytes)).toBe("content");
  });

  it("defaults to the markdown image template when sourceLanguage is omitted", async () => {
    const view = createFakeView("");
    await insertImagesAt(view, [imageFile("a.png", "a")], {
      pos: 0,
      onImage: (bytes) => Promise.resolve(`/assets/${new TextDecoder().decode(bytes)}.png`),
    });
    expect(view.state.doc.toString()).toBe("![](/assets/a.png)");
  });

  it("inserts an <img> tag instead of markdown when sourceLanguage is 'html'", async () => {
    const view = createFakeView("");
    await insertImagesAt(view, [imageFile("a.png", "a")], {
      pos: 0,
      onImage: (bytes) => Promise.resolve(`/assets/${new TextDecoder().decode(bytes)}.png`),
      sourceLanguage: "html",
    });
    expect(view.state.doc.toString()).toBe('<img src="/assets/a.png" alt="">');
  });

  it("inserts multiple <img> tags in file order when sourceLanguage is 'html'", async () => {
    const view = createFakeView("");
    const files = [imageFile("a.png", "a"), imageFile("b.png", "b")];
    await insertImagesAt(view, files, {
      pos: 0,
      onImage: resolveOutOfOrder,
      sourceLanguage: "html",
    });
    expect(view.state.doc.toString()).toBe('<img src="/r-a" alt=""><img src="/r-b" alt="">');
  });
});
