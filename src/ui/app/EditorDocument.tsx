// ABOUTME: The document in the editor pane: title, date and tags, the conflict
// ABOUTME: note, and the body Editor — marked with the mode it's shown in.
import type { EntryRecord } from "../../core/store/types";
import { Editor } from "../editor";
import type { FormatIconName } from "../editor/Toolbar";
import { Icon } from "../icons/Icon";
import type { EditorMode } from "../types";
import { DateField, TitleField } from "./EditorFieldControls";
import { useServices } from "./ServicesContext";
import { useAppStoreApi } from "./state";
import { TagChipsEditor } from "./TagChipsEditor";
import type { useEditorScreenState } from "./useEditorScreenState";

/** Why the body is read-only. On macOS the conflict sheet never opens by
 *  itself, so the note carries the way in: Resolve…. */
function ConflictNote(props: { path: string }) {
  const store = useAppStoreApi();
  const mac = useServices().shell.platform() === "macos";
  if (!mac) {
    return (
      <p className="editor-conflict-note">
        This entry has a conflicting change — resolve it to keep editing.
      </p>
    );
  }
  return (
    <div className="editor-conflict-note editor-conflict-bar">
      <span>This entry has a conflict.</span>
      <button
        type="button"
        className="btn"
        onClick={() => store.getState().openConflict(props.path)}
      >
        Resolve…
      </button>
    </div>
  );
}

/** Which editor the document shows; the Write-mode typography keys off it. */
function docMode(isLegacyHtml: boolean, mode: EditorMode): string {
  if (isLegacyHtml) {
    return "html";
  }
  return mode === "wysiwyg" ? "write" : "markdown";
}

/** macOS formatting-bar symbols (the editor itself knows no app icons). */
function formatSymbol(name: FormatIconName) {
  return <Icon name={name} size={14} />;
}

function EditorDocument(props: {
  record: EntryRecord;
  state: ReturnType<typeof useEditorScreenState>;
}) {
  const s = props.state;
  const mac = useServices().shell.platform() === "macos";
  const mode = docMode(s.isLegacyHtml, s.editorMode);
  return (
    <div className="editor-doc" data-editor-mode={mode}>
      <TitleField value={s.title} onChange={s.setTitle} layoutKey={mode} />
      <div className="editor-meta-row">
        <DateField value={props.record.date} onChange={s.commitDate} />
        <TagChipsEditor tags={s.tags} onChange={s.setTags} />
      </div>
      {s.isConflicted ? <ConflictNote path={props.record.path} /> : null}
      <Editor
        value={s.body}
        onChange={s.setBody}
        mode={s.editorMode}
        sourceLanguage={s.sourceLanguage}
        resolveImage={s.resolveImage}
        onImage={s.onImage}
        readOnly={s.isConflicted}
        {...(mac ? { renderFormatIcon: formatSymbol } : {})}
      />
    </div>
  );
}

export { EditorDocument };
