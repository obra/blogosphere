// ABOUTME: Pure(ish) helpers shared by CrepeEditor, SourceEditor and Toolbar —
// ABOUTME: CodeMirror transaction builders, markdown templates, and image-file utilities.

import type { EditorState, TransactionSpec } from "@codemirror/state";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// A Map, not a plain object: a plain-object lookup keyed on an attacker- or
// fuzzer-controlled string (`file.type`) is vulnerable to keys like
// `"__proto__"`, which don't do a normal property lookup on a `{}` literal —
// they return the prototype object itself, silently breaking the `string`
// return contract below. Map has no such special-cased keys.
const EXTENSION_BY_MIME: ReadonlyMap<string, string> = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  ["image/svg+xml", "svg"],
  ["image/bmp", "bmp"],
  ["image/tiff", "tiff"],
  ["image/avif", "avif"],
]);

const DEFAULT_IMAGE_EXTENSION = "png";

const FILENAME_EXTENSION_PATTERN = /\.([a-z0-9]+)$/i;

// ---------------------------------------------------------------------------
// CodeMirror transaction builders
//
// These take an `EditorState` (not a `View`) and return a `TransactionSpec`,
// so they can be unit-tested without mounting a real view/DOM — the caller
// (SourceEditor, Toolbar) is responsible for `view.dispatch(view.state.update(spec))`.
// ---------------------------------------------------------------------------

/**
 * Insert `text` at every selection range, replacing any selected text.
 * By default the cursor lands right after the inserted text in each range;
 * pass `select` to instead select a sub-range of the inserted text itself
 * (offsets relative to the start of `text`), e.g. to highlight a placeholder
 * the user should type over.
 */
export function insertAtCursor(
  state: EditorState,
  text: string,
  select?: { from: number; to: number },
): TransactionSpec {
  const result = state.changeByRange((range) => {
    const insertFrom = range.from;
    const selection = select
      ? EditorSelection.range(insertFrom + select.from, insertFrom + select.to)
      : EditorSelection.cursor(insertFrom + text.length);
    return {
      changes: { from: range.from, to: range.to, insert: text },
      range: selection,
    };
  });
  return { ...result, scrollIntoView: true, userEvent: "input" };
}

/**
 * Insert `text` at one fixed document position, ignoring the live selection.
 * Used to complete an async paste/drop image insertion: the drop/cursor
 * position is captured synchronously when the event fires, and the insert
 * happens later once `onImage` resolves — by which point the live selection
 * may have moved on. (If the document itself was edited in the meantime the
 * captured position can drift; same trade-off Milkdown's own upload plugin
 * makes internally.)
 */
export function insertTextAt(state: EditorState, pos: number, text: string): TransactionSpec {
  const clamped = Math.max(0, Math.min(pos, state.doc.length));
  return {
    changes: { from: clamped, insert: text },
    selection: EditorSelection.cursor(clamped + text.length),
    scrollIntoView: true,
    userEvent: "input",
  };
}

/**
 * Wrap each selection range in `before`/`after` markers (bold/italic/inline
 * code). An empty range gets an empty pair inserted with the cursor left
 * between the markers, ready to type into. A non-empty range keeps the
 * original text selected, now wrapped.
 */
export function wrapSelection(
  state: EditorState,
  before: string,
  after: string = before,
): TransactionSpec {
  const result = state.changeByRange((range) => {
    if (range.empty) {
      return {
        changes: { from: range.from, insert: before + after },
        range: EditorSelection.cursor(range.from + before.length),
      };
    }
    const selected = state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: before + selected + after },
      range: EditorSelection.range(range.from + before.length, range.to + before.length),
    };
  });
  return { ...result, scrollIntoView: true, userEvent: "input" };
}

/**
 * Prepend `prefix` (e.g. `"## "`) to the start of the line containing each
 * selection range, unless it's already there. Mirrors Milkdown's
 * `wrapInHeadingCommand`, which likewise only sets the block type — neither
 * side "toggles off" on a second click, so both modes agree.
 */
export function setLinePrefix(state: EditorState, prefix: string): TransactionSpec {
  const result = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    if (line.text.startsWith(prefix)) {
      return { range };
    }
    return {
      changes: { from: line.from, insert: prefix },
      range: EditorSelection.range(range.anchor + prefix.length, range.head + prefix.length),
    };
  });
  return { ...result, scrollIntoView: true, userEvent: "input" };
}

/** The bit of `EditorView` transaction dispatch needs — narrowed so callers
 * can build/test against a plain fake object instead of a real, DOM-backed view. */
export type DispatchableView = Pick<EditorView, "state" | "dispatch">;

/** Compute a `TransactionSpec` from the view's current state and dispatch it
 * in one step — the common pattern behind every `EditorHandle` method. */
export function dispatchSpec(
  view: DispatchableView,
  specFor: (state: EditorState) => TransactionSpec,
): void {
  view.dispatch(view.state.update(specFor(view.state)));
}

// ---------------------------------------------------------------------------
// Markdown templates
// ---------------------------------------------------------------------------

/**
 * Build a markdown image reference. `ref` is trusted (it's whatever
 * `onImage`/`resolveImage` handed back — a `/assets/...` path from the
 * model layer) and is not escaped; `alt` defaults to empty since this
 * component family's contract has no separate alt-text prompt.
 */
export function buildImageMarkdown(ref: string, alt = ""): string {
  return `![${alt}](${ref})`;
}

/** A markdown link template, plus the offsets (within `markdown`) of the
 * `https://` placeholder so the caller can select it for the user to type
 * or paste over. */
export interface LinkTemplate {
  markdown: string;
  urlFrom: number;
  urlTo: number;
}

/** Build a `[label](https://)` template. Uses `selectedText` as the label
 * when non-empty, else a generic placeholder. */
export function buildLinkMarkdown(selectedText: string): LinkTemplate {
  const label = selectedText.length > 0 ? selectedText : "link text";
  const url = "https://";
  const prefix = `[${label}](`;
  return {
    markdown: `${prefix}${url})`,
    urlFrom: prefix.length,
    urlTo: prefix.length + url.length,
  };
}

// ---------------------------------------------------------------------------
// Image file handling (paste/drop)
// ---------------------------------------------------------------------------

/** Satisfied by a real DOM `FileList` (`ClipboardEvent.clipboardData.files`
 * / `DragEvent.dataTransfer.files`) and, in tests, by a plain `File[]` —
 * `DataTransfer`/`FileList` aren't constructible under jsdom, so keeping
 * this to "iterable of File" is what makes the filter below testable. */
export type FileListLike = Iterable<File>;

/** Keep only image files from a paste/drop file list, in order. */
export function filterImageFiles(files: FileListLike | null | undefined): File[] {
  if (!files) {
    return [];
  }
  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}

/** Infer a lowercase, dot-free extension for a pasted/dropped image:
 * MIME type first, then the filename's own extension, then a fallback. */
export function extensionForImageFile(file: { type: string; name: string }): string {
  const byMime = EXTENSION_BY_MIME.get(file.type.toLowerCase());
  if (byMime) {
    return byMime;
  }
  const fromName = FILENAME_EXTENSION_PATTERN.exec(file.name)?.[1];
  if (fromName) {
    return fromName.toLowerCase();
  }
  return DEFAULT_IMAGE_EXTENSION;
}

/** Read a File/Blob's raw bytes. */
export async function bytesFromFile(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Read each file's bytes, hand them to `onImage`, and insert the returned
 * markdown ref starting at `pos` in a CodeMirror doc — advancing past each
 * insertion so multiple pasted/dropped images land in order rather than
 * overlapping. Files whose `onImage` call returns `null` are skipped
 * (cancelled); the rest still insert. `onImage` calls run concurrently
 * (their order doesn't matter); the resulting inserts are applied in the
 * original file order, sequentially.
 *
 * Exported standalone — rather than inlined in SourceEditor's `paste`/`drop`
 * DOM handlers — so it can be unit-tested directly: jsdom can't construct a
 * real `DataTransfer`, so there's no way to fire a realistic paste/drop
 * event in a component test. The handlers that extract `files`/`pos` from a
 * real event and call this are thin, untested wiring around it.
 */
export async function insertImagesAt(
  view: DispatchableView,
  files: readonly File[],
  pos: number,
  onImage: (bytes: Uint8Array, suggestedExt: string) => Promise<string | null>,
): Promise<void> {
  const refs = await Promise.all(
    files.map(async (file) => onImage(await bytesFromFile(file), extensionForImageFile(file))),
  );
  let at = pos;
  for (const ref of refs) {
    if (ref !== null) {
      const text = buildImageMarkdown(ref);
      dispatchSpec(view, (state) => insertTextAt(state, at, text));
      at += text.length;
    }
  }
}

// ---------------------------------------------------------------------------
// Image display resolution (WYSIWYG rendering only — see CrepeEditor)
// ---------------------------------------------------------------------------

/** A tiny neutral placeholder shown in place of an image whose display URL
 * hasn't resolved yet (or can't be resolved offline) — see `EditorProps.resolveImage`. */
export const PLACEHOLDER_IMAGE_SRC = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>" +
    "<rect width='64' height='64' fill='#e2e2e2'/>" +
    "<circle cx='22' cy='24' r='6' fill='#b0b0b0'/>" +
    "<path d='M8 52l16-18 12 12 10-10 10 16z' fill='#b0b0b0'/>" +
    "</svg>",
)}`;

/**
 * Adapt `EditorProps.resolveImage` (which returns `null` for "not
 * resolvable yet") to Milkdown's `proxyDomURL` shape (which always wants a
 * string). Never rejects — a thrown/rejected resolve falls back to the
 * placeholder too, since this runs inside a Milkdown node view with no
 * error UI of its own to report through.
 */
export async function resolveDisplaySrc(
  resolveImage: (src: string) => Promise<string | null>,
  ref: string,
): Promise<string> {
  try {
    const resolved = await resolveImage(ref);
    return resolved ?? PLACEHOLDER_IMAGE_SRC;
  } catch {
    return PLACEHOLDER_IMAGE_SRC;
  }
}

// ---------------------------------------------------------------------------
// Shared imperative handle
//
// Toolbar is mode-agnostic: it calls these six methods and doesn't know or
// care whether they're backed by Milkdown commands or CodeMirror
// transactions. CrepeEditor and SourceEditor each implement this via
// `useImperativeHandle`, which is where the actual "Milkdown commands vs
// CodeMirror transactions" branch lives.
// ---------------------------------------------------------------------------

export interface EditorHandle {
  toggleBold(): void;
  toggleItalic(): void;
  toggleInlineCode(): void;
  toggleHeading2(): void;
  insertLink(): void;
  insertImage(ref: string, alt?: string): void;
}
