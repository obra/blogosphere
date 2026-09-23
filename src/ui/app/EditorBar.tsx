// ABOUTME: The editor's toolbar: mode control, save status, and the entry
// ABOUTME: actions — as the phone bar, the macOS toolbar row, or the desktop bar.
import type { EntryRecord } from "../../core/store/types";
import { Icon } from "../icons/Icon";
import type { EditorMode, HtmlViewMode } from "../types";
import { DraftStateChip, HtmlModeToggle, ModeToggle } from "./EditorFieldControls";
import { DetailToolbar, EntryActionsButton } from "./MacToolbar";
import { MobileEditorBar } from "./MobileEditorBar";
import { openExternal } from "./openExternal";
import { PublishButton } from "./PublishControls";
import { SaveFailureStatus } from "./SaveFailureStatus";
import { SecretLinkControl } from "./SecretLinkControl";
import { useServices } from "./ServicesContext";
import { saveStateLabel } from "./saveStateLabel";
import { useAppStore, useAppStoreApi } from "./state";
import { useAppCompactLayout } from "./useCompactLayout";

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
  const failed = useAppStore((state) => state.saveFailure?.path === props.record.path);
  const label = saveStateLabel(props.record, status);
  if (failed) {
    return <SaveFailureStatus />;
  }
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

export { EditorBar };
