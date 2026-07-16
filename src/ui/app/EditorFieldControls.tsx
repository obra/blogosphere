// ABOUTME: Small controlled-field subcomponents used by EditorScreen: title
// ABOUTME: input, date field, draft-state chip, and the WYSIWYG/source toggle.
import type { EditorMode } from "../types";

interface TitleFieldProps {
  value: string;
  onChange: (value: string) => void;
}

function TitleField(props: TitleFieldProps) {
  return (
    <input
      className="editor-title-input"
      type="text"
      value={props.value}
      placeholder="Untitled"
      onChange={(event) => props.onChange(event.currentTarget.value)}
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

interface ModeToggleProps {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}

function ModeToggle(props: ModeToggleProps) {
  return (
    <fieldset className="mode-toggle" aria-label="Editor mode">
      <button
        type="button"
        aria-pressed={props.mode === "wysiwyg"}
        onClick={() => props.onChange("wysiwyg")}
      >
        Write
      </button>
      <button
        type="button"
        aria-pressed={props.mode === "source"}
        onClick={() => props.onChange("source")}
      >
        Markdown
      </button>
    </fieldset>
  );
}

/** Shown instead of ModeToggle for a legacy .html entry — there's no
 *  Write/Markdown choice to make (source editing only), so a static chip
 *  replaces the toggle rather than disabling it in place. */
function HtmlModeChip() {
  return (
    <span className="state-chip" data-kind="html" title="Legacy HTML post — source editing only">
      HTML
    </span>
  );
}

export { DateField, DraftStateChip, HtmlModeChip, ModeToggle, TitleField };
