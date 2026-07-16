// ABOUTME: WYSIWYG editing mode: wraps @milkdown/crepe. Feeds `value` in as the initial
// ABOUTME: doc, listens for markdown changes via the listener plugin, and wires paste/drop/
// ABOUTME: upload plus image display resolution through onImage/resolveImage.
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/classic.css";
import type { CmdKey } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import {
  insertImageCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInHeadingCommand,
} from "@milkdown/kit/preset/commonmark";
import type { Node, Schema } from "@milkdown/kit/prose/model";
import { callCommand, insert, replaceAll } from "@milkdown/kit/utils";
import type { Ref, RefObject } from "react";
import { useEffect, useImperativeHandle, useRef } from "react";
import type { EditorHandle } from "./markdown-utils";
import {
  buildLinkMarkdown,
  bytesFromFile,
  extensionForImageFile,
  filterImageFiles,
  resolveDisplaySrc,
} from "./markdown-utils";

type OnImage = (bytes: Uint8Array, suggestedExt: string) => Promise<string | null>;
type ResolveImage = (src: string) => Promise<string | null>;

// ---------------------------------------------------------------------------
// Image upload wiring
//
// Two separate integration points, both driven by onImage:
//  - `uploadConfig.uploader` is Milkdown's *generic* paste/drop-anywhere
//    interceptor (see @milkdown/plugin-upload) — this is the primary path
//    the spec calls out. It's overridden (rather than left as Crepe's
//    default) so a cancelled onImage (`null`) drops just that file instead
//    of leaving a stuck "Upload in progress..." placeholder: the default
//    uploader's Promise.all would reject on a thrown error, but ours never
//    throws — it just omits null results.
//  - `ImageBlockFeatureConfig.onUpload` backs Crepe's own "upload file"
//    button inside its image-insert widgets (a single explicit file pick,
//    not a paste/drop event). It can't signal "cancelled" as cleanly (it
//    must return a string), so a cancelled upload here becomes an empty src
//    — a minor, documented gap in an already-secondary interaction path.
// ---------------------------------------------------------------------------

function widgetOnUpload(getOnImage: () => OnImage) {
  return async (file: File): Promise<string> => {
    const bytes = await bytesFromFile(file);
    const ext = extensionForImageFile(file);
    const ref = await getOnImage()(bytes, ext);
    return ref ?? "";
  };
}

async function uploadOneFile(file: File, schema: Schema, onImage: OnImage): Promise<Node | null> {
  const nodeType = schema.nodes["image-block"] ?? schema.nodes.image;
  if (!nodeType) {
    return null;
  }
  const bytes = await bytesFromFile(file);
  const ext = extensionForImageFile(file);
  const ref = await onImage(bytes, ext);
  if (ref === null) {
    return null;
  }
  return nodeType.createAndFill({ src: ref });
}

function createUploader(getOnImage: () => OnImage) {
  return async (files: FileList, schema: Schema): Promise<Node[]> => {
    const onImage = getOnImage();
    const imageFiles = filterImageFiles(files);
    const nodes = await Promise.all(imageFiles.map((file) => uploadOneFile(file, schema, onImage)));
    return nodes.filter((node): node is Node => node !== null);
  };
}

// ---------------------------------------------------------------------------
// Mount / lifecycle
// ---------------------------------------------------------------------------

interface CrepeRefs {
  crepeRef: RefObject<Crepe | null>;
  lastKnownRef: RefObject<string>;
  valueRef: RefObject<string>;
  onChangeRef: RefObject<(markdown: string) => void>;
  onImageRef: RefObject<OnImage>;
  resolveImageRef: RefObject<ResolveImage>;
  readOnlyRef: RefObject<boolean>;
}

function createCrepe(container: HTMLElement, refs: CrepeRefs): Crepe {
  const crepe = new Crepe({
    root: container,
    defaultValue: refs.lastKnownRef.current,
    features: {
      // The left-gutter drag-handle/plus block tools read as alien on a Mac
      // writing surface; markdown input rules + the selection toolbar cover
      // everything they did. (This also removes the slash menu.)
      [CrepeFeature.BlockEdit]: false,
    },
    featureConfigs: {
      [CrepeFeature.Placeholder]: {
        text: "Start writing…",
      },
      [CrepeFeature.ImageBlock]: {
        onUpload: widgetOnUpload(() => refs.onImageRef.current),
        // biome-ignore lint/style/useNamingConvention: Milkdown's own required config field name, not ours to choose.
        proxyDomURL: (src) => resolveDisplaySrc(refs.resolveImageRef.current, src),
      },
    },
  });
  crepe.editor.config((ctx) => {
    ctx.update(uploadConfig.key, (prev) => ({
      ...prev,
      enableHtmlFileUploader: true,
      uploader: createUploader(() => refs.onImageRef.current),
    }));
  });
  crepe.on((api) => {
    api.markdownUpdated((_ctx, markdown) => {
      if (markdown !== refs.lastKnownRef.current) {
        refs.lastKnownRef.current = markdown;
        refs.onChangeRef.current(markdown);
      }
    });
  });
  crepe.setReadonly(refs.readOnlyRef.current);
  return crepe;
}

function mountCrepe(crepe: Crepe, refs: CrepeRefs, isCancelled: () => boolean): void {
  crepe
    .create()
    .then(() => {
      if (isCancelled()) {
        return;
      }
      refs.crepeRef.current = crepe;
      // Pick up a value change that happened while (async) creation was in flight.
      // flush=true rebuilds editor state from scratch: observed (once, timing-
      // dependent) that a non-flushed replace racing creation can leave a stale
      // copy of the document rendered alongside the new one.
      if (refs.valueRef.current !== refs.lastKnownRef.current) {
        refs.lastKnownRef.current = refs.valueRef.current;
        crepe.editor.action(replaceAll(refs.valueRef.current, true));
      }
    })
    .catch(() => undefined);
}

function useSyncCrepeValue(
  crepeRef: RefObject<Crepe | null>,
  lastKnownRef: RefObject<string>,
  value: string,
) {
  useEffect(() => {
    const crepe = crepeRef.current;
    if (crepe && value !== lastKnownRef.current) {
      lastKnownRef.current = value;
      // flush=true: see mountCrepe — full state rebuild, never a partial splice.
      crepe.editor.action(replaceAll(value, true));
    }
  }, [crepeRef, lastKnownRef, value]);
}

function useSyncCrepeReadOnly(crepeRef: RefObject<Crepe | null>, readOnly: boolean) {
  useEffect(() => {
    crepeRef.current?.setReadonly(readOnly);
  }, [crepeRef, readOnly]);
}

// ---------------------------------------------------------------------------
// EditorHandle — Milkdown commands (the other half of "Milkdown commands vs
// CodeMirror transactions"; see SourceEditor for the CM side).
// ---------------------------------------------------------------------------

function runCommand<T>(crepeRef: RefObject<Crepe | null>, key: CmdKey<T>, payload?: T): void {
  crepeRef.current?.editor.action(callCommand(key, payload));
}

function insertMarkdown(crepeRef: RefObject<Crepe | null>, markdown: string): void {
  crepeRef.current?.editor.action(insert(markdown, true));
}

function selectedText(crepe: Crepe): string {
  return crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { from, to } = view.state.selection;
    return view.state.doc.textBetween(from, to, " ");
  });
}

function insertLinkAtSelection(crepeRef: RefObject<Crepe | null>): void {
  const crepe = crepeRef.current;
  if (!crepe) {
    return;
  }
  const { markdown } = buildLinkMarkdown(selectedText(crepe));
  insertMarkdown(crepeRef, markdown);
}

function buildEditorHandle(crepeRef: RefObject<Crepe | null>): EditorHandle {
  return {
    toggleBold: () => runCommand(crepeRef, toggleStrongCommand.key),
    toggleItalic: () => runCommand(crepeRef, toggleEmphasisCommand.key),
    toggleInlineCode: () => runCommand(crepeRef, toggleInlineCodeCommand.key),
    toggleHeading2: () => runCommand(crepeRef, wrapInHeadingCommand.key, 2),
    insertLink: () => insertLinkAtSelection(crepeRef),
    // Uses the image node command directly (src/alt set on the node) rather
    // than `insert(buildImageMarkdown(...), true)`: round-tripping a
    // standalone image through markdown-text -> DOM -> reparse loses alt
    // text once Crepe's image-block promotion (a bare image on its own line
    // becomes a captioned block widget, not a plain inline image node) is in
    // play. Setting the attrs directly sidesteps that reparse entirely.
    insertImage: (ref, alt) =>
      runCommand(crepeRef, insertImageCommand.key, { src: ref, alt: alt ?? "" }),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CrepeEditorProps {
  value: string;
  onChange(markdown: string): void;
  resolveImage: ResolveImage;
  onImage: OnImage;
  readOnly: boolean;
  ref?: Ref<EditorHandle>;
}

export function CrepeEditor(props: CrepeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const crepeRef = useRef<Crepe | null>(null);

  const lastKnownRef = useRef(props.value);
  const valueRef = useRef(props.value);
  const onChangeRef = useRef(props.onChange);
  const onImageRef = useRef(props.onImage);
  const resolveImageRef = useRef(props.resolveImage);
  const readOnlyRef = useRef(props.readOnly);
  valueRef.current = props.value;
  onChangeRef.current = props.onChange;
  onImageRef.current = props.onImage;
  resolveImageRef.current = props.resolveImage;
  readOnlyRef.current = props.readOnly;

  // Mount once — see SourceEditor for why (reconfigure in place afterwards
  // rather than tearing down and rebuilding on every value/readOnly change).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let cancelled = false;
    const refs: CrepeRefs = {
      crepeRef,
      lastKnownRef,
      valueRef,
      onChangeRef,
      onImageRef,
      resolveImageRef,
      readOnlyRef,
    };
    const crepe = createCrepe(container, refs);
    mountCrepe(crepe, refs, () => cancelled);
    return () => {
      cancelled = true;
      crepeRef.current = null;
      crepe.destroy().catch(() => undefined);
    };
  }, []);

  useSyncCrepeValue(crepeRef, lastKnownRef, props.value);
  useSyncCrepeReadOnly(crepeRef, props.readOnly);

  useImperativeHandle(props.ref, () => buildEditorHandle(crepeRef), []);

  // Natural height: the document column (ui/app's .editor-scroll) is the one
  // scroll container, so title/meta/body scroll together like a real document.
  return <div ref={containerRef} style={{ width: "100%" }} />;
}
