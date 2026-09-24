// ABOUTME: The post title: a one-row text area that wraps and grows instead of
// ABOUTME: truncating, but stays one line of text (Return moves to the body).
import { type ClipboardEvent, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { focusEditorSurface } from "./editorFocus";

interface TitleFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Changes when the title's typography does (the editor mode), so its
   *  height is measured again. */
  layoutKey?: string;
}

const LINE_BREAKS = /\r?\n/g;
/** Not global: a global regex's test() remembers where it last matched. */
const HAS_LINE_BREAK = /\r?\n/;
/** The keyCode WebKit gives keydowns an IME is handling. */
const IME_PROCESSING_KEY_CODE = 229;
/** WebKit ends an IME composition just before the keydown of the Return that
 *  confirmed it; a Return this soon after is still the IME's (CodeMirror
 *  uses the same window). */
const COMPOSITION_TAIL_MS = 100;

/** Sets the height to the wrapped text's, keeping the scroll position (the
 *  momentary "auto" height would otherwise pull a scrolled document up). */
function fitHeight(field: HTMLTextAreaElement): void {
  const scroller = field.closest<HTMLElement>(".editor-scroll");
  const scrollTop = scroller?.scrollTop ?? 0;
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
  if (scroller) {
    scroller.scrollTop = scrollTop;
  }
}

/** Measures again when the text changes, the width changes (window,
 *  sidebar), the typography changes (layoutKey), or a web font loads. */
function useFitHeight(value: string, layoutKey: string | undefined) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const measure = useCallback(() => {
    if (ref.current) {
      fitHeight(ref.current);
    }
  }, []);
  // value and layoutKey aren't read here; they're why the height changes.
  useLayoutEffect(() => {
    measure();
  }, [measure, value, layoutKey]);
  useEffect(() => {
    const field = ref.current;
    if (!field) {
      return;
    }
    let lastWidth = field.clientWidth;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (field.clientWidth !== lastWidth) {
              lastWidth = field.clientWidth;
              measure();
            }
          });
    observer?.observe(field);
    // A face used for the first time (DM Serif on switching to Write) loads
    // after the switch was measured with its fallback.
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [measure]);
  return ref;
}

function TitleField(props: TitleFieldProps) {
  const ref = useFitHeight(props.value, props.layoutKey);
  const compositionEndedAt = useRef(0);
  // A pasted multi-line title becomes one line, inserted where the caret is
  // (normalizing in onChange would rewrite the value and move the caret).
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!HAS_LINE_BREAK.test(text)) {
      return;
    }
    event.preventDefault();
    const field = event.currentTarget;
    field.setRangeText(
      text.replace(LINE_BREAKS, " "),
      field.selectionStart,
      field.selectionEnd,
      "end",
    );
    props.onChange(field.value);
  };
  return (
    <textarea
      ref={ref}
      className="editor-title-input"
      rows={1}
      value={props.value}
      placeholder="Untitled"
      onChange={(event) => props.onChange(event.currentTarget.value.replace(LINE_BREAKS, " "))}
      onPaste={onPaste}
      onCompositionEnd={() => {
        compositionEndedAt.current = Date.now();
      }}
      onKeyDown={(event) => {
        const imeReturn =
          event.nativeEvent.isComposing ||
          event.keyCode === IME_PROCESSING_KEY_CODE ||
          Date.now() - compositionEndedAt.current < COMPOSITION_TAIL_MS;
        if (event.key === "Enter" && !imeReturn) {
          event.preventDefault();
          focusEditorSurface();
        }
      }}
      aria-label="Title"
    />
  );
}

export { TitleField };
