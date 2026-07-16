// ABOUTME: Raw-source editing mode: the React wrapper around CodeMirror 6 (see
// ABOUTME: sourceEditorSetup.ts) — value/readOnly sync, and the EditorHandle imperative API.
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Ref, RefObject } from "react";
import { useEffect, useImperativeHandle, useRef } from "react";
import type { EditorHandle, SourceLanguage } from "./markdown-utils";
import {
  buildImageRef,
  buildLinkMarkdown,
  dispatchSpec,
  insertAtCursor,
  setLinePrefix,
  wrapSelection,
} from "./markdown-utils";
import { createView, type OnImage } from "./sourceEditorSetup";

/** Push external `value` changes into the view — guarded so an echo of our
 * own just-emitted onChange (parent re-renders with the same string back as
 * `value`) doesn't reset the document and jump the cursor. */
function useSyncValue(
  viewRef: RefObject<EditorView | null>,
  lastKnownRef: RefObject<string>,
  value: string,
) {
  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== lastKnownRef.current) {
      lastKnownRef.current = value;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [viewRef, lastKnownRef, value]);
}

function useSyncReadOnly(
  viewRef: RefObject<EditorView | null>,
  compartmentRef: RefObject<Compartment>,
  readOnly: boolean,
) {
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        effects: compartmentRef.current.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      });
    }
  }, [viewRef, compartmentRef, readOnly]);
}

function insertLinkAtSelection(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const { markdown, urlFrom, urlTo } = buildLinkMarkdown(selected);
  dispatchSpec(view, (s) => insertAtCursor(s, markdown, { from: urlFrom, to: urlTo }));
}

function buildEditorHandle(
  viewRef: RefObject<EditorView | null>,
  sourceLanguage: SourceLanguage,
): EditorHandle {
  return {
    toggleBold: () => {
      const view = viewRef.current;
      if (view) {
        dispatchSpec(view, (s) => wrapSelection(s, "**"));
      }
    },
    toggleItalic: () => {
      const view = viewRef.current;
      if (view) {
        dispatchSpec(view, (s) => wrapSelection(s, "_"));
      }
    },
    toggleInlineCode: () => {
      const view = viewRef.current;
      if (view) {
        dispatchSpec(view, (s) => wrapSelection(s, "`"));
      }
    },
    toggleHeading2: () => {
      const view = viewRef.current;
      if (view) {
        dispatchSpec(view, (s) => setLinePrefix(s, "## "));
      }
    },
    insertLink: () => {
      const view = viewRef.current;
      if (view) {
        insertLinkAtSelection(view);
      }
    },
    insertImage: (imageRef, alt) => {
      const view = viewRef.current;
      if (view) {
        dispatchSpec(view, (s) => insertAtCursor(s, buildImageRef(sourceLanguage, imageRef, alt)));
      }
    },
  };
}

export interface SourceEditorProps {
  value: string;
  onChange(markdown: string): void;
  onImage: OnImage;
  readOnly: boolean;
  /** Default "markdown". Legacy .html entries pass "html" — see EditorProps
   *  in ui/types.ts — which switches CodeMirror's language mode and the
   *  paste/drop/insertImage image template. */
  sourceLanguage?: SourceLanguage;
  ref?: Ref<EditorHandle>;
}

export function SourceEditor({
  value,
  onChange,
  onImage,
  readOnly,
  sourceLanguage = "markdown",
  ref,
}: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartmentRef = useRef(new Compartment());

  // "Latest" refs: the mount effect below runs exactly once (empty deps) and
  // must never see a stale onChange/onImage/readOnly from the render that
  // happened to be current when the view was constructed. sourceLanguage
  // isn't captured this way — it's derived from the entry's path (see
  // EditorScreen's isLegacyHtml), which can't change without the entry
  // itself changing, and EditorScreenBody remounts (key={record.path}) on
  // every entry switch, so a fresh mount always sees the current value.
  const lastKnownRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onImageRef = useRef(onImage);
  const readOnlyRef = useRef(readOnly);
  onChangeRef.current = onChange;
  onImageRef.current = onImage;
  readOnlyRef.current = readOnly;

  // Mount once. `value`/`readOnly` changes after mount are pushed in by
  // useSyncValue/useSyncReadOnly below (reconfiguring in place, rather than
  // tearing down and rebuilding the view — which would lose history/scroll).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const view = createView(container, {
      lastKnownRef,
      onChangeRef,
      onImageRef,
      readOnlyRef,
      readOnlyCompartment: readOnlyCompartmentRef.current,
      sourceLanguage,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useSyncValue(viewRef, lastKnownRef, value);
  useSyncReadOnly(viewRef, readOnlyCompartmentRef, readOnly);

  useImperativeHandle(ref, () => buildEditorHandle(viewRef, sourceLanguage), [sourceLanguage]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
