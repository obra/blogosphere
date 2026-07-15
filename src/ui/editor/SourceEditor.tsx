// ABOUTME: Raw-markdown editing mode: CodeMirror 6 with markdown language support,
// ABOUTME: line wrapping, a minimal theme, and the same paste/drop image behavior as Crepe.
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown as markdownLang } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { Compartment, EditorState } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { EditorView, keymap } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import type { Ref, RefObject } from "react";
import { useEffect, useImperativeHandle, useRef } from "react";
import type { EditorHandle } from "./markdown-utils";
import {
  buildImageMarkdown,
  buildLinkMarkdown,
  dispatchSpec,
  filterImageFiles,
  insertAtCursor,
  insertImagesAt,
  setLinePrefix,
  wrapSelection,
} from "./markdown-utils";

type OnImage = (bytes: Uint8Array, suggestedExt: string) => Promise<string | null>;

function boldCommand(view: EditorView): boolean {
  dispatchSpec(view, (state) => wrapSelection(state, "**"));
  return true;
}

function italicCommand(view: EditorView): boolean {
  dispatchSpec(view, (state) => wrapSelection(state, "_"));
  return true;
}

function inlineCodeCommand(view: EditorView): boolean {
  dispatchSpec(view, (state) => wrapSelection(state, "`"));
  return true;
}

// Mirrors Milkdown/Crepe's own shortcuts for the same marks (Mod-b/Mod-i/Mod-e).
const EDITING_KEYMAP: readonly KeyBinding[] = [
  { key: "Mod-b", run: boldCommand },
  { key: "Mod-i", run: italicCommand },
  { key: "Mod-e", run: inlineCodeCommand },
];

const EDITOR_THEME = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", color: "inherit", backgroundColor: "transparent" },
  ".cm-content": {
    fontFamily:
      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    padding: "8px 0",
  },
  ".cm-scroller": { overflow: "auto" },
  "&.cm-focused": { outline: "none" },
});

function handlePaste(event: ClipboardEvent, view: EditorView, onImage: OnImage): boolean {
  const files = filterImageFiles(event.clipboardData?.files);
  if (files.length === 0) {
    return false;
  }
  event.preventDefault();
  const pos = view.state.selection.main.from;
  insertImagesAt(view, files, pos, onImage).catch(() => undefined);
  return true;
}

function handleDrop(event: DragEvent, view: EditorView, onImage: OnImage): boolean {
  const files = filterImageFiles(event.dataTransfer?.files);
  if (files.length === 0) {
    return false;
  }
  event.preventDefault();
  const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
  const pos = coords ?? view.state.selection.main.from;
  insertImagesAt(view, files, pos, onImage).catch(() => undefined);
  return true;
}

interface BuildExtensionsConfig {
  initialReadOnly: boolean;
  readOnlyCompartment: Compartment;
  onDocChanged: (next: string) => void;
  getOnImage: () => OnImage;
}

function buildExtensions(config: BuildExtensionsConfig): Extension[] {
  return [
    minimalSetup,
    markdownLang(),
    EditorView.lineWrapping,
    EDITOR_THEME,
    keymap.of([...defaultKeymap, ...historyKeymap, ...EDITING_KEYMAP]),
    config.readOnlyCompartment.of([
      EditorState.readOnly.of(config.initialReadOnly),
      EditorView.editable.of(!config.initialReadOnly),
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        config.onDocChanged(update.state.doc.toString());
      }
    }),
    EditorView.domEventHandlers({
      paste: (event, view) => handlePaste(event, view, config.getOnImage()),
      drop: (event, view) => handleDrop(event, view, config.getOnImage()),
    }),
  ];
}

interface ViewRefs {
  lastKnownRef: RefObject<string>;
  onChangeRef: RefObject<(markdown: string) => void>;
  onImageRef: RefObject<OnImage>;
  readOnlyRef: RefObject<boolean>;
  readOnlyCompartment: Compartment;
}

function createView(container: HTMLElement, refs: ViewRefs): EditorView {
  return new EditorView({
    doc: refs.lastKnownRef.current,
    parent: container,
    extensions: buildExtensions({
      initialReadOnly: refs.readOnlyRef.current,
      readOnlyCompartment: refs.readOnlyCompartment,
      getOnImage: () => refs.onImageRef.current,
      onDocChanged: (next) => {
        if (next !== refs.lastKnownRef.current) {
          refs.lastKnownRef.current = next;
          refs.onChangeRef.current(next);
        }
      },
    }),
  });
}

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

function buildEditorHandle(viewRef: RefObject<EditorView | null>): EditorHandle {
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
        dispatchSpec(view, (s) => insertAtCursor(s, buildImageMarkdown(imageRef, alt)));
      }
    },
  };
}

export interface SourceEditorProps {
  value: string;
  onChange(markdown: string): void;
  onImage: OnImage;
  readOnly: boolean;
  ref?: Ref<EditorHandle>;
}

export function SourceEditor({ value, onChange, onImage, readOnly, ref }: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartmentRef = useRef(new Compartment());

  // "Latest" refs: the mount effect below runs exactly once (empty deps) and
  // must never see a stale onChange/onImage/readOnly from the render that
  // happened to be current when the view was constructed.
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
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useSyncValue(viewRef, lastKnownRef, value);
  useSyncReadOnly(viewRef, readOnlyCompartmentRef, readOnly);

  useImperativeHandle(ref, () => buildEditorHandle(viewRef), []);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
