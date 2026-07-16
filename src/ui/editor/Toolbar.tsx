// ABOUTME: Formatting toolbar shown above the editor in either mode — bold/italic/
// ABOUTME: link/inline-code/H2/image buttons. Deliberately small and dumb: it only ever
// ABOUTME: calls the six EditorHandle methods, never touching Milkdown/CodeMirror directly.
import type { ChangeEvent, MouseEvent, RefObject } from "react";
import { useCallback, useRef } from "react";
import type { EditorHandle } from "./markdown-utils";
import { bytesFromFile, extensionForImageFile } from "./markdown-utils";

type OnImage = (bytes: Uint8Array, suggestedExt: string) => Promise<string | null>;

function preventDefaultMouseDown(event: MouseEvent<HTMLButtonElement>): void {
  // Keep focus (and the live selection) in the editor rather than the button.
  event.preventDefault();
}

async function insertPickedImage(
  file: File,
  handle: RefObject<EditorHandle | null>,
  onImage: OnImage,
): Promise<void> {
  const bytes = await bytesFromFile(file);
  const ext = extensionForImageFile(file);
  const ref = await onImage(bytes, ext);
  if (ref !== null) {
    handle.current?.insertImage(ref);
  }
}

export interface ToolbarButtonProps {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}

export function ToolbarButton(props: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="format-toolbar-button"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onMouseDown={preventDefaultMouseDown}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

export interface ToolbarProps {
  handle: RefObject<EditorHandle | null>;
  onImage: OnImage;
  readOnly: boolean;
}

export function Toolbar(props: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onBoldClick = useCallback(() => props.handle.current?.toggleBold(), [props.handle]);
  const onItalicClick = useCallback(() => props.handle.current?.toggleItalic(), [props.handle]);
  const onInlineCodeClick = useCallback(
    () => props.handle.current?.toggleInlineCode(),
    [props.handle],
  );
  const onHeading2Click = useCallback(() => props.handle.current?.toggleHeading2(), [props.handle]);
  const onLinkClick = useCallback(() => props.handle.current?.insertLink(), [props.handle]);
  const onImageButtonClick = useCallback(() => fileInputRef.current?.click(), []);

  const onFileSelected = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (file) {
        insertPickedImage(file, props.handle, props.onImage).catch(() => undefined);
      }
    },
    [props.handle, props.onImage],
  );

  return (
    <div className="format-toolbar" role="toolbar" aria-label="Formatting">
      <ToolbarButton label="B" title="Bold" disabled={props.readOnly} onClick={onBoldClick} />
      <ToolbarButton label="I" title="Italic" disabled={props.readOnly} onClick={onItalicClick} />
      <ToolbarButton
        label="</>"
        title="Inline code"
        disabled={props.readOnly}
        onClick={onInlineCodeClick}
      />
      <ToolbarButton
        label="H2"
        title="Heading 2"
        disabled={props.readOnly}
        onClick={onHeading2Click}
      />
      <ToolbarButton
        label="Link"
        title="Insert link"
        disabled={props.readOnly}
        onClick={onLinkClick}
      />
      <ToolbarButton
        label="Image"
        title="Insert image"
        disabled={props.readOnly}
        onClick={onImageButtonClick}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileSelected}
        style={{ display: "none" }}
      />
    </div>
  );
}
