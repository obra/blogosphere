// ABOUTME: Formatting toolbar shown above the editor in either mode — bold/italic/
// ABOUTME: link/inline-code/H2/image buttons. Deliberately small and dumb: it only ever
// ABOUTME: calls the six EditorHandle methods, never touching Milkdown/CodeMirror directly.
import type { ChangeEvent, MouseEvent, ReactNode, RefObject } from "react";
import { useCallback, useMemo, useRef } from "react";
import type { EditorHandle } from "./markdown-utils";
import { bytesFromFile, extensionForImageFile } from "./markdown-utils";

type OnImage = (bytes: Uint8Array, suggestedExt: string) => Promise<string | null>;

/** The buttons, in order. Only bold, italic and code have shortcuts, and both
 *  editors bind the same ones. */
const FORMAT_BUTTONS: ReadonlyArray<{
  icon: FormatIconName;
  label: string;
  title: string;
  shortcut?: { display: string; aria: string };
}> = [
  { icon: "bold", label: "B", title: "Bold", shortcut: { display: "⌘B", aria: "Meta+B" } },
  { icon: "italic", label: "I", title: "Italic", shortcut: { display: "⌘I", aria: "Meta+I" } },
  {
    icon: "code",
    label: "</>",
    title: "Inline code",
    shortcut: { display: "⌘E", aria: "Meta+E" },
  },
  { icon: "heading", label: "H2", title: "Heading 2" },
  { icon: "link", label: "Link", title: "Insert link" },
  { icon: "image", label: "Image", title: "Insert image" },
];

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

/** The formatting buttons' icon names; the app decides what each looks like. */
export type FormatIconName = "bold" | "italic" | "code" | "heading" | "link" | "image";

export interface ToolbarButtonProps {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
  icon?: ReactNode;
  /** Shown in the tooltip ("⌘B") and announced as aria-keyshortcuts. */
  shortcut?: { display: string; aria: string };
}

export function ToolbarButton(props: ToolbarButtonProps) {
  // With an icon, the tooltip also names the shortcut; the accessible name
  // stays plain either way.
  const title =
    props.icon && props.shortcut ? `${props.title} ${props.shortcut.display}` : props.title;
  return (
    <button
      type="button"
      className="format-toolbar-button"
      title={title}
      aria-label={props.title}
      aria-keyshortcuts={props.icon ? props.shortcut?.aria : undefined}
      disabled={props.disabled}
      onMouseDown={preventDefaultMouseDown}
      onClick={props.onClick}
    >
      {props.icon ?? props.label}
    </button>
  );
}

export interface ToolbarProps {
  handle: RefObject<EditorHandle | null>;
  onImage: OnImage;
  readOnly: boolean;
  /** The app's icons (macOS symbols); without it the buttons show text. */
  renderIcon?: (name: FormatIconName) => ReactNode;
}

export function Toolbar(props: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { handle } = props;

  const actions = useMemo<Record<FormatIconName, () => void>>(
    () => ({
      bold: () => handle.current?.toggleBold(),
      italic: () => handle.current?.toggleItalic(),
      code: () => handle.current?.toggleInlineCode(),
      heading: () => handle.current?.toggleHeading2(),
      link: () => handle.current?.insertLink(),
      image: () => fileInputRef.current?.click(),
    }),
    [handle],
  );

  const onFileSelected = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (file) {
        insertPickedImage(file, handle, props.onImage).catch(() => undefined);
      }
    },
    [handle, props.onImage],
  );

  return (
    <div className="format-toolbar" role="toolbar" aria-label="Formatting">
      {FORMAT_BUTTONS.map((button) => (
        <ToolbarButton
          key={button.icon}
          label={button.label}
          title={button.title}
          disabled={props.readOnly}
          onClick={actions[button.icon]}
          {...(props.renderIcon ? { icon: props.renderIcon(button.icon) } : {})}
          {...(button.shortcut ? { shortcut: button.shortcut } : {})}
        />
      ))}
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
