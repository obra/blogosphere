// ABOUTME: CodeMirror 6 view/extension construction for SourceEditor — language
// ABOUTME: selection (markdown/html), keymap, theme, and paste/drop image handling.
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { html as htmlLang } from "@codemirror/lang-html";
import { markdown as markdownLang } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { type Compartment, EditorState } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { EditorView, keymap } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import type { RefObject } from "react";
import type { SourceLanguage } from "./markdown-utils";
import { dispatchSpec, filterImageFiles, insertImagesAt, wrapSelection } from "./markdown-utils";

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
  "&": { minHeight: "40vh", fontSize: "14px", color: "inherit", backgroundColor: "transparent" },
  ".cm-content": {
    fontFamily:
      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    padding: "8px 0",
  },
  ".cm-scroller": { overflow: "auto" },
  "&.cm-focused": { outline: "none" },
});

function handlePaste(
  event: ClipboardEvent,
  view: EditorView,
  onImage: OnImage,
  sourceLanguage: SourceLanguage,
): boolean {
  const files = filterImageFiles(event.clipboardData?.files);
  if (files.length === 0) {
    return false;
  }
  event.preventDefault();
  const pos = view.state.selection.main.from;
  insertImagesAt(view, files, { pos, onImage, sourceLanguage }).catch(() => undefined);
  return true;
}

function handleDrop(
  event: DragEvent,
  view: EditorView,
  onImage: OnImage,
  sourceLanguage: SourceLanguage,
): boolean {
  const files = filterImageFiles(event.dataTransfer?.files);
  if (files.length === 0) {
    return false;
  }
  event.preventDefault();
  const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
  const pos = coords ?? view.state.selection.main.from;
  insertImagesAt(view, files, { pos, onImage, sourceLanguage }).catch(() => undefined);
  return true;
}

interface BuildExtensionsConfig {
  initialReadOnly: boolean;
  readOnlyCompartment: Compartment;
  onDocChanged: (next: string) => void;
  getOnImage: () => OnImage;
  sourceLanguage: SourceLanguage;
}

function buildExtensions(config: BuildExtensionsConfig): Extension[] {
  return [
    minimalSetup,
    config.sourceLanguage === "html" ? htmlLang() : markdownLang(),
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
      paste: (event, view) => handlePaste(event, view, config.getOnImage(), config.sourceLanguage),
      drop: (event, view) => handleDrop(event, view, config.getOnImage(), config.sourceLanguage),
    }),
  ];
}

interface ViewRefs {
  lastKnownRef: RefObject<string>;
  onChangeRef: RefObject<(markdown: string) => void>;
  onImageRef: RefObject<OnImage>;
  readOnlyRef: RefObject<boolean>;
  readOnlyCompartment: Compartment;
  sourceLanguage: SourceLanguage;
}

function createView(container: HTMLElement, refs: ViewRefs): EditorView {
  return new EditorView({
    doc: refs.lastKnownRef.current,
    parent: container,
    extensions: buildExtensions({
      initialReadOnly: refs.readOnlyRef.current,
      readOnlyCompartment: refs.readOnlyCompartment,
      getOnImage: () => refs.onImageRef.current,
      sourceLanguage: refs.sourceLanguage,
      onDocChanged: (next) => {
        if (next !== refs.lastKnownRef.current) {
          refs.lastKnownRef.current = next;
          refs.onChangeRef.current(next);
        }
      },
    }),
  });
}

export type { OnImage, ViewRefs };
export { createView };
