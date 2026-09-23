// ABOUTME: The editor screen — its toolbar (EditorBar), the document (title, date,
// ABOUTME: tags, body Editor), or the Live/HTML preview filling the pane.
import { useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import { Editor } from "../editor";
import type { EditorMode, HtmlViewMode } from "../types";
import { EditorBar } from "./EditorBar";
import { DateField, TitleField } from "./EditorFieldControls";
import { HtmlPreview } from "./HtmlPreview";
import { LiveView } from "./LiveView";
import { DetailToolbar } from "./MacToolbar";
import { PublishDialogHost } from "./PublishControls";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";
import { TagChipsEditor } from "./TagChipsEditor";
import { useEditorScreenState } from "./useEditorScreenState";

/** A detail-pane message (nothing selected, unreadable entry), under the
 *  toolbar row on macOS. */
function DetailMessage(props: { text: string }) {
  const mac = useServices().shell.platform() === "macos";
  return (
    <>
      {mac ? <DetailToolbar /> : null}
      <div className="editor-empty">{props.text}</div>
    </>
  );
}

function EditorEmptyState() {
  return <DetailMessage text="Select an entry, or start a new one." />;
}

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

function EditorScreenBody(props: { record: EntryRecord }) {
  const s = useEditorScreenState(props.record);
  // Legacy HTML entries open in the rendered view; editing is one click away.
  const [htmlView, setHtmlView] = useState<HtmlViewMode>("preview");
  const [live, setLive] = useState(false);

  if (!s.parsed) {
    return <DetailMessage text="Couldn't read this entry's front matter." />;
  }

  const showLive = live && s.liveUrl !== null;
  const showHtmlPreview = !showLive && s.isLegacyHtml && htmlView === "preview";
  const fill = showLive && s.liveUrl ? <LiveView url={s.liveUrl} /> : <HtmlPreview html={s.body} />;
  const chromeProps = {
    record: props.record,
    mode: s.editorMode,
    onModeChange: s.commitMode,
    isLegacyHtml: s.isLegacyHtml,
    htmlView,
    onHtmlViewChange: setHtmlView,
    liveUrl: s.liveUrl,
    live: showLive,
    onLive: setLive,
  };
  return (
    <div className="editor-screen">
      <EditorBar {...chromeProps} />
      <PublishDialogHost record={props.record} />
      {showLive || showHtmlPreview ? (
        <div className="editor-fill">{fill}</div>
      ) : (
        <div className="editor-scroll">
          <div className="editor-doc" data-editor-mode={docMode(s.isLegacyHtml, s.editorMode)}>
            <TitleField value={s.title} onChange={s.setTitle} />
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
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EditorScreen() {
  const selectedPath = useAppStore((state) => state.selectedPath);
  const record = useAppStore((state) => state.entries.find((e) => e.path === selectedPath));

  if (!record) {
    return <EditorEmptyState />;
  }

  return <EditorScreenBody key={record.path} record={record} />;
}

export { EditorScreen };
