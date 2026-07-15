// ABOUTME: Local stand-in for the real Editor (src/ui/editor) while that
// ABOUTME: module is still in flight. Satisfies EditorProps exactly; the
// ABOUTME: integration agent should delete this and import from "../editor".
import type { ChangeEvent } from "react";
import type { EditorProps } from "../types";

function makeChangeHandler(props: EditorProps) {
  return (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (!props.readOnly) {
      props.onChange(event.currentTarget.value);
    }
  };
}

/**
 * A plain textarea that behaves like a controlled markdown editor: it
 * satisfies EditorProps so EditorScreen can be built and tested against the
 * real contract now. It does not attempt WYSIWYG rendering, image drop, or
 * mode-specific behavior — see the integration note in EditorScreen.tsx.
 */
function EditorPlaceholder(props: EditorProps) {
  return (
    <textarea
      className="editor-placeholder"
      data-mode={props.mode}
      value={props.value}
      readOnly={props.readOnly ?? false}
      onChange={makeChangeHandler(props)}
      aria-label="Post body"
    />
  );
}

export { EditorPlaceholder };
