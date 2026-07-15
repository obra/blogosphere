// ABOUTME: Test-only side-effect import — jsdom has no layout engine, so it doesn't
// ABOUTME: implement Range.getClientRects/getBoundingClientRect, which CodeMirror's and
// ABOUTME: Milkdown's real (unmocked) layout measurement call on every mount/update.
// A no-op in any real browser/webview (the guard only patches a genuinely missing method),
// so it's safe to import from component tests without affecting production behavior.

function emptyDomRectList(): DOMRectList {
  return {
    length: 0,
    item: () => null,
    *[Symbol.iterator]() {
      /* empty */
    },
  } as unknown as DOMRectList;
}

function zeroDomRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // biome-ignore lint/style/useNamingConvention: DOMRect's own required method name, not ours to choose.
    toJSON: () => ({}),
  } as DOMRect;
}

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = emptyDomRectList;
  Range.prototype.getBoundingClientRect = zeroDomRect;
}
