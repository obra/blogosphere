// ABOUTME: The editor screen — title/tags/date/draft chrome, publish flow,
// ABOUTME: secret-link sharing, and the body Editor with a persisted mode toggle.
import { useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import { Editor } from "../editor";
import type { EditorMode } from "../types";
import { DateField, DraftStateChip, ModeToggle, TitleField } from "./EditorFieldControls";
import { formatDisplayDate, todayIso } from "./format";
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
}

function EditorToolbar(props: EditorToolbarProps) {
  return (
    <div className="editor-toolbar">
      <DraftStateChip draft={props.record.draft} />
      <ModeToggle mode={props.mode} onChange={props.onModeChange} />
      <PublishSection path={props.record.path} opaqueId={props.record.opaqueId} />
      <SecretLinkButton path={props.record.path} opaqueId={props.record.opaqueId} />
      <DeleteButton path={props.record.path} />
    </div>
  );
}

function EditorScreenBody(props: { record: EntryRecord }) {
  const s = useEditorScreenState(props.record);

  if (!s.parsed) {
    return <div className="editor-empty">Couldn't read this entry's front matter.</div>;
  }

  return (
    <div className="editor-screen">
      <EditorToolbar record={props.record} mode={s.editorMode} onModeChange={s.commitMode} />
      <TitleField value={s.title} onChange={s.setTitle} />
      <div className="editor-meta-row">
        <DateField value={props.record.date} onChange={s.commitDate} />
        <span className="entry-row-meta">{formatDisplayDate(props.record.date)}</span>
      </div>
      <TagChipsEditor tags={s.tags} onChange={s.setTags} />
      {s.isConflicted ? (
        <p className="entry-row-meta">
          This entry has a conflicting change — resolve it to keep editing.
        </p>
      ) : null}
      <div className="editor-body-wrap">
        <Editor
          value={s.body}
          onChange={s.setBody}
          mode={s.editorMode}
          resolveImage={s.resolveImage}
          onImage={s.onImage}
          readOnly={s.isConflicted}
        />
      </div>
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
