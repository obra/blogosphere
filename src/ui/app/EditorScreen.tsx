// ABOUTME: The editor screen — title/tags/date/draft chrome, publish flow, secret-link
// ABOUTME: sharing, and the body Editor with a persisted mode toggle (an "HTML" chip for legacy entries).
import { useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import { Editor } from "../editor";
import { Icon } from "../icons/Icon";
import type { EditorMode, HtmlViewMode } from "../types";
import {
  DateField,
  DraftStateChip,
  HtmlModeToggle,
  ModeToggle,
  TitleField,
} from "./EditorFieldControls";
import { HtmlPreview } from "./HtmlPreview";
import { LiveView } from "./LiveView";
import { DetailToolbar, EntryActionsButton } from "./MacToolbar";
import { MobileEditorBar } from "./MobileEditorBar";
import { openExternal } from "./openExternal";
import { PublishButton, PublishDialogHost } from "./PublishControls";
import { SecretLinkControl } from "./SecretLinkControl";
import { useServices } from "./ServicesContext";
import { saveStateLabel } from "./saveStateLabel";
import { useAppStore, useAppStoreApi } from "./state";
import { TagChipsEditor } from "./TagChipsEditor";
import { useAppCompactLayout } from "./useCompactLayout";
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

/** Answers "did I just make this public, and is my work safe?" without a Save
 *  button: edits autosave locally; ⌘S/the sync button push to GitHub — drafts
 *  sync as drafts, and only Publish makes one public (see saveStateLabel.ts). */
function SaveStateIndicator(props: { record: EntryRecord }) {
  const status = useAppStore((state) => state.syncStatus);
  const label = saveStateLabel(props.record, status);
  return (
    <span className="save-state" title={label.title}>
      {label.text}
    </span>
  );
}

/** Only offered when there's actually something to go back to: unsynced
 *  changes on top of a version that exists on GitHub. The action itself
 *  (state.editingActions.ts) owns the confirm and cancels in-flight
 *  keystrokes instead of committing them. */
function DiscardButton(props: { record: EntryRecord }) {
  const store = useAppStoreApi();
  if (!(props.record.dirty && props.record.baseContent !== null)) {
    return null;
  }
  return (
    <button
      type="button"
      className="btn"
      title="Throw away unsynced changes and restore the version on GitHub"
      onClick={() => store.getState().discardChanges(props.record.path)}
    >
      Discard changes
    </button>
  );
}

/** History (git versions) — always offered; the panel explains when there's
 *  no connection or no remote history yet. */
function HistoryButton(props: { path: string }) {
  const store = useAppStoreApi();
  return (
    <button
      type="button"
      className="editor-icon-button"
      title="Versions — this entry's history on GitHub"
      aria-label="Versions"
      onClick={() => store.getState().openVersions(props.path)}
    >
      <Icon name="versions" />
    </button>
  );
}

function ViewOnSiteButton(props: { url: string | null }) {
  const { url } = props;
  if (!url) {
    return null;
  }
  return (
    <button
      type="button"
      className="editor-icon-button"
      title={`View on blog.fsck.com — ${url}`}
      aria-label="View on site"
      onClick={() => openExternal(url)}
    >
      <Icon name="openOnSite" />
    </button>
  );
}

interface EditorToolbarProps {
  record: EntryRecord;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  isLegacyHtml: boolean;
  htmlView: HtmlViewMode;
  onHtmlViewChange: (mode: HtmlViewMode) => void;
  liveUrl: string | null;
  live: boolean;
  onLive: (live: boolean) => void;
}

/** Write/Markdown/Live, or Preview/HTML/Live for legacy HTML entries. */
function ModeControl(props: EditorToolbarProps) {
  const liveSegment = {
    liveAvailable: props.liveUrl !== null,
    live: props.live,
    onLive: () => props.onLive(true),
  };
  return props.isLegacyHtml ? (
    <HtmlModeToggle
      mode={props.htmlView}
      onChange={(mode) => {
        props.onLive(false);
        props.onHtmlViewChange(mode);
      }}
      {...liveSegment}
    />
  ) : (
    <ModeToggle
      mode={props.mode}
      onChange={(mode) => {
        props.onLive(false);
        props.onModeChange(mode);
      }}
      {...liveSegment}
    />
  );
}

/** macOS: the editor's half of the window toolbar row — mode, status, then
 *  (after the sync symbol) Publish for drafts and the "…" menu. */
function MacEditorToolbar(props: EditorToolbarProps) {
  return (
    <DetailToolbar
      leading={
        <>
          <ModeControl {...props} />
          <span className="doc-status">
            {props.record.draft ? null : "Published · "}
            <SaveStateIndicator record={props.record} />
          </span>
        </>
      }
      trailing={
        <>
          {props.record.draft ? <PublishButton /> : null}
          <EntryActionsButton record={props.record} liveUrl={props.liveUrl} />
        </>
      }
    />
  );
}

function EditorToolbar(props: EditorToolbarProps) {
  return (
    <div className="editor-toolbar">
      <DraftStateChip draft={props.record.draft} />
      <ModeControl {...props} />
      <SaveStateIndicator record={props.record} />
      <div className="editor-actions">
        <DiscardButton record={props.record} />
        <SecretLinkControl record={props.record} />
        <ViewOnSiteButton url={props.liveUrl} />
        <HistoryButton path={props.record.path} />
        <PublishButton />
        <DeleteButton path={props.record.path} />
      </div>
    </div>
  );
}

/** The phone bar, the macOS toolbar row, or the desktop toolbar. */
function EditorBar(props: EditorToolbarProps) {
  const compact = useAppCompactLayout();
  const mac = useServices().shell.platform() === "macos";
  if (compact) {
    return <MobileEditorBar {...props} />;
  }
  return mac ? <MacEditorToolbar {...props} /> : <EditorToolbar {...props} />;
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
          <div className="editor-doc">
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
