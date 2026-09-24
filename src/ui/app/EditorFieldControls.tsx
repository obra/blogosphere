// ABOUTME: Small controlled-field subcomponents used by EditorScreen: title
// ABOUTME: input, date field, draft-state chip, and the WYSIWYG/source toggle.
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { EditorMode, HtmlViewMode } from "../types";
import { focusEditorSurface } from "./editorFocus";

interface TitleFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Changes when the title's typography does (the editor mode), so its
   *  height is measured again. */
  layoutKey?: string;
}

const LINE_BREAKS = /\r?\n/g;

/** Keeps a one-row text area exactly as tall as its wrapped text: when the
 *  text changes, the width changes (window, sidebar), the typography
 *  changes (layoutKey), or a web font finishes loading. */
function useFitHeight(value: string, layoutKey: string | undefined) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const measure = useCallback(() => {
    const field = ref.current;
    if (field) {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
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
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => observer?.disconnect();
  }, [measure]);
  return ref;
}

/** The post title: wraps instead of truncating, but stays one line of text.
 *  Return moves to the body, as in Notes and Mail's subject field. */
function TitleField(props: TitleFieldProps) {
  const ref = useFitHeight(props.value, props.layoutKey);
  return (
    <textarea
      ref={ref}
      className="editor-title-input"
      rows={1}
      value={props.value}
      placeholder="Untitled"
      onChange={(event) => props.onChange(event.currentTarget.value.replace(LINE_BREAKS, " "))}
      onKeyDown={(event) => {
        // A Return that confirms an IME candidate belongs to the IME.
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          focusEditorSurface();
        }
      }}
      aria-label="Title"
    />
  );
}

interface DateFieldProps {
  value: string | null;
  onChange: (date: string) => void;
}

function DateField(props: DateFieldProps) {
  return (
    <input
      className="editor-date-input"
      type="date"
      value={props.value ?? ""}
      onChange={(event) => {
        if (event.currentTarget.value) {
          props.onChange(event.currentTarget.value);
        }
      }}
      aria-label="Date"
    />
  );
}

function DraftStateChip(props: { draft: boolean }) {
  if (!props.draft) {
    return <span className="state-chip">Published</span>;
  }
  return (
    <span className="state-chip" data-kind="draft">
      Draft
    </span>
  );
}

/** The Live segment: the entry as the real site serves it. Rendered inside
 *  both toggles whenever the entry has a reachable URL. */
interface LiveSegmentProps {
  /** null = no live URL (unpushed draft without a secret link, some legacy). */
  liveAvailable: boolean;
  live: boolean;
  onLive: () => void;
}

interface ModeToggleProps extends LiveSegmentProps {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}

function ModeToggle(props: ModeToggleProps) {
  return (
    <fieldset className="mode-toggle" aria-label="Editor mode">
      <button
        type="button"
        aria-pressed={!props.live && props.mode === "wysiwyg"}
        onClick={() => props.onChange("wysiwyg")}
      >
        Write
      </button>
      <button
        type="button"
        aria-pressed={!props.live && props.mode === "source"}
        onClick={() => props.onChange("source")}
      >
        Markdown
      </button>
      {props.liveAvailable ? (
        <button type="button" aria-pressed={props.live} onClick={props.onLive}>
          Live
        </button>
      ) : null}
    </fieldset>
  );
}

interface HtmlModeToggleProps extends LiveSegmentProps {
  mode: HtmlViewMode;
  onChange: (mode: HtmlViewMode) => void;
}

/** Legacy .html entries: rendered preview or raw-HTML source (no WYSIWYG). */
function HtmlModeToggle(props: HtmlModeToggleProps) {
  return (
    <fieldset className="mode-toggle" aria-label="View mode">
      <button
        type="button"
        aria-pressed={!props.live && props.mode === "preview"}
        onClick={() => props.onChange("preview")}
      >
        Preview
      </button>
      <button
        type="button"
        aria-pressed={!props.live && props.mode === "source"}
        onClick={() => props.onChange("source")}
      >
        HTML
      </button>
      {props.liveAvailable ? (
        <button type="button" aria-pressed={props.live} onClick={props.onLive}>
          Live
        </button>
      ) : null}
    </fieldset>
  );
}

export { DateField, DraftStateChip, HtmlModeToggle, ModeToggle, TitleField };
