// ABOUTME: The editor screen — title/tags/date/draft chrome, publish flow, secret-link
// ABOUTME: sharing, and the body Editor with a persisted mode toggle (an "HTML" chip for legacy entries).
import { useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import { Editor } from "../editor";
import type { EditorMode, HtmlViewMode } from "../types";
import {
  DateField,
  DraftStateChip,
  HtmlModeToggle,
  ModeToggle,
  TitleField,
} from "./EditorFieldControls";
import { todayIso } from "./format";
import { HtmlPreview } from "./HtmlPreview";
import { PublishDialog } from "./PublishDialog";
import { useAppStore, useAppStoreApi } from "./state";
import { TagChipsEditor } from "./TagChipsEditor";
import { useEditorScreenState } from "./useEditorScreenState";

function EditorEmptyState() {
  return <div className="editor-empty">Select an entry, or start a new one.</div>;
}

function SecretLinkButton(props: { path: string; opaqueId: string | null }) {
  const store = useAppStoreApi();
  if (!props.opaqueId) {
    return null;
  }
  return (
    <button
      type="button"
      className="btn"
      onClick={() => store.getState().shareSecretLink(props.path)}
    >
      Copy secret link
    </button>
  );
}

/** deleteEntry itself already owns confirmation, the busy flag, and a
 *  retry-carrying error toast (state.editingActions.ts) — this button is
 *  its only missing piece: before this, the action had no UI trigger
 *  anywhere in the app, so there was no way to delete an entry at all. */
function DeleteButton(props: { path: string }) {
  const store = useAppStoreApi();
  return (
    <button type="button" className="btn" onClick={() => store.getState().deleteEntry(props.path)}>
      Delete
    </button>
  );
}

function PublishSection(props: { path: string; opaqueId: string | null }) {
  const store = useAppStoreApi();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Publish
      </button>
      {open ? (
        <PublishDialog
          today={todayIso(Date.now())}
          hasOpaqueId={Boolean(props.opaqueId)}
          onCancel={() => setOpen(false)}
          onPublish={(opts) => {
            setOpen(false);
            store.getState().publishDraft(props.path, opts);
          }}
        />
      ) : null}
    </>
  );
}

interface EditorToolbarProps {
  record: EntryRecord;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  isLegacyHtml: boolean;
  htmlView: HtmlViewMode;
  onHtmlViewChange: (mode: HtmlViewMode) => void;
}

function EditorToolbar(props: EditorToolbarProps) {
  return (
    <div className="editor-toolbar">
      <DraftStateChip draft={props.record.draft} />
      {props.isLegacyHtml ? (
        <HtmlModeToggle mode={props.htmlView} onChange={props.onHtmlViewChange} />
      ) : (
        <ModeToggle mode={props.mode} onChange={props.onModeChange} />
      )}
      <div className="editor-actions">
        <SecretLinkButton path={props.record.path} opaqueId={props.record.opaqueId} />
        <PublishSection path={props.record.path} opaqueId={props.record.opaqueId} />
        <DeleteButton path={props.record.path} />
      </div>
    </div>
  );
}

function EditorScreenBody(props: { record: EntryRecord }) {
  const s = useEditorScreenState(props.record);
  // Legacy HTML entries open in the rendered view; editing is one click away.
  const [htmlView, setHtmlView] = useState<HtmlViewMode>("preview");

  // biome-ignore lint/suspicious/noUnnecessaryConditions: parseEntry genuinely fails on malformed front matter — parsed is ParsedView | null; Biome's checker mis-narrows here.
  if (!s.parsed) {
    return <div className="editor-empty">Couldn't read this entry's front matter.</div>;
  }

  const showHtmlPreview = s.isLegacyHtml && htmlView === "preview";
  return (
    <div className="editor-screen">
      <EditorToolbar
        record={props.record}
        mode={s.editorMode}
        onModeChange={s.commitMode}
        isLegacyHtml={s.isLegacyHtml}
        htmlView={htmlView}
        onHtmlViewChange={setHtmlView}
      />
      {showHtmlPreview ? (
        <div className="editor-fill">
          <HtmlPreview html={s.body} />
        </div>
      ) : (
        <div className="editor-scroll">
          <div className="editor-doc">
            <TitleField value={s.title} onChange={s.setTitle} />
            <div className="editor-meta-row">
              <DateField value={props.record.date} onChange={s.commitDate} />
              <TagChipsEditor tags={s.tags} onChange={s.setTags} />
            </div>
            {s.isConflicted ? (
              <p className="editor-conflict-note">
                This entry has a conflicting change — resolve it to keep editing.
              </p>
            ) : null}
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
