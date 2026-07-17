// ABOUTME: The editor screen — title/tags/date/draft chrome, publish flow, secret-link
// ABOUTME: sharing, and the body Editor with a persisted mode toggle (an "HTML" chip for legacy entries).
import { useEffect, useRef, useState } from "react";
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
import { LiveView } from "./LiveView";
import { openExternal } from "./openExternal";
import { PublishDialog } from "./PublishDialog";
import { saveStateLabel } from "./saveStateLabel";
import { useAppStore, useAppStoreApi } from "./state";
import { SITE_ORIGIN } from "./state.types";
import { TagChipsEditor } from "./TagChipsEditor";
import { useEditorScreenState } from "./useEditorScreenState";

function EditorEmptyState() {
  return <div className="editor-empty">Select an entry, or start a new one.</div>;
}

function CopyGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12.5 9.5 18 20 6.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const COPY_FEEDBACK_MS = 1600;

/** The copy button is its own feedback: glyph flips to a checkmark briefly.
 *  No toast — "you copied a link" isn't news worth interrupting for. */
function useCopiedFlash(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );
  const flash = () => {
    setCopied(true);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };
  return [copied, flash];
}

/** Drafts always get the affordance — shareSecretLink mints the opaqueId on
 *  first use (state.editingActions.ts) — and once a link exists (draft or a
 *  published post that kept one), the link itself is shown with a copy icon
 *  instead of a wordy button. */
function SecretLinkControl(props: { record: EntryRecord }) {
  const store = useAppStoreApi();
  const [copied, flashCopied] = useCopiedFlash();
  const { path, opaqueId, draft } = props.record;
  if (!(opaqueId || draft)) {
    return null;
  }
  const copy = () => {
    store.getState().shareSecretLink(path);
    flashCopied();
  };
  if (!opaqueId) {
    return (
      <button
        type="button"
        className="btn btn-with-glyph"
        title="Create this draft's secret link and copy it — shareable before publishing"
        onClick={copy}
      >
        <CopyGlyph /> Secret link
      </button>
    );
  }
  const url = `${SITE_ORIGIN}/private/${opaqueId}/`;
  return (
    <span className="secret-link" title={url}>
      <span className="secret-link-text">/private/{opaqueId}/</span>
      <button
        type="button"
        className="secret-link-copy"
        aria-label="Copy secret link"
        title={`Copy ${url}`}
        data-copied={copied || undefined}
        onClick={copy}
      >
        {copied ? <CheckGlyph /> : <CopyGlyph />}
      </button>
    </span>
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

/** Dialog open-state lives in the app store (not component state) so the
 *  File menu's Publish… command can open the same dialog this button does. */
function PublishSection(props: { path: string; opaqueId: string | null }) {
  const store = useAppStoreApi();
  const open = useAppStore((state) => state.publishDialogOpen);
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => store.getState().openPublishDialog()}
      >
        Publish
      </button>
      {open ? (
        <PublishDialog
          today={todayIso(Date.now())}
          hasOpaqueId={Boolean(props.opaqueId)}
          onCancel={() => store.getState().closePublishDialog()}
          onPublish={(opts) => {
            store.getState().closePublishDialog();
            store.getState().publishDraft(props.path, opts);
          }}
        />
      ) : null}
    </>
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3.2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M8 6h10v10M18 6 6 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
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

function EditorToolbar(props: EditorToolbarProps) {
  const liveSegment = {
    liveAvailable: props.liveUrl !== null,
    live: props.live,
    onLive: () => props.onLive(true),
  };
  return (
    <div className="editor-toolbar">
      <DraftStateChip draft={props.record.draft} />
      {props.isLegacyHtml ? (
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
      )}
      <SaveStateIndicator record={props.record} />
      <div className="editor-actions">
        <DiscardButton record={props.record} />
        <SecretLinkControl record={props.record} />
        <ViewOnSiteButton url={props.liveUrl} />
        <HistoryButton path={props.record.path} />
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
  const [live, setLive] = useState(false);

  if (!s.parsed) {
    return <div className="editor-empty">Couldn't read this entry's front matter.</div>;
  }

  const showLive = live && s.liveUrl !== null;
  const showHtmlPreview = !showLive && s.isLegacyHtml && htmlView === "preview";
  const fill = showLive && s.liveUrl ? <LiveView url={s.liveUrl} /> : <HtmlPreview html={s.body} />;
  return (
    <div className="editor-screen">
      <EditorToolbar
        record={props.record}
        mode={s.editorMode}
        onModeChange={s.commitMode}
        isLegacyHtml={s.isLegacyHtml}
        htmlView={htmlView}
        onHtmlViewChange={setHtmlView}
        liveUrl={s.liveUrl}
        live={showLive}
        onLive={setLive}
      />
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
