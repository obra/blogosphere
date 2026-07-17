// ABOUTME: Phone-width editor chrome: a compact top bar (Back, state, ⋯) with
// ABOUTME: the mode toggle beneath, and a bottom actions sheet holding the
// ABOUTME: commands the desktop toolbar shows as buttons.
import { useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import type { EditorMode, HtmlViewMode } from "../types";
import { DraftStateChip, HtmlModeToggle, ModeToggle } from "./EditorFieldControls";
import { openExternal } from "./openExternal";
import { saveStateLabel } from "./saveStateLabel";
import { useAppStore, useAppStoreApi } from "./state";
import type { AppState } from "./state.types";

interface MobileEditorBarProps {
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

interface SheetRow {
  key: string;
  label: string;
  detail?: string;
  destructive?: boolean;
  run: () => void;
}

function sheetRows(props: MobileEditorBarProps, act: () => AppState): SheetRow[] {
  const { record, liveUrl } = props;
  const rows: SheetRow[] = [
    { key: "publish", label: "Publish…", run: () => act().openPublishDialog() },
  ];
  if (record.draft || record.opaqueId) {
    rows.push({
      key: "secret",
      label: record.opaqueId ? "Copy secret link" : "Create secret link",
      ...(record.opaqueId ? { detail: `/private/${record.opaqueId}/` } : {}),
      run: () => act().shareSecretLink(record.path),
    });
  }
  if (liveUrl) {
    rows.push({
      key: "view",
      label: "View on site",
      detail: liveUrl,
      run: () => openExternal(liveUrl),
    });
  }
  rows.push({ key: "versions", label: "Versions", run: () => act().openVersions(record.path) });
  if (record.dirty && record.baseContent !== null) {
    rows.push({
      key: "discard",
      label: "Discard changes",
      run: () => act().discardChanges(record.path),
    });
  }
  rows.push({
    key: "delete",
    label: "Delete…",
    destructive: true,
    run: () => act().deleteEntry(record.path),
  });
  return rows;
}

function ActionsSheet(props: MobileEditorBarProps & { onClose: () => void }) {
  const store = useAppStoreApi();
  const rows = sheetRows(props, () => store.getState());
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop tap-to-dismiss, the sheet itself is a labeled dialog.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handling lives on the sheet below.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same backdrop affordance as the app's other dialogs.
    <div
      className="mobile-sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: sheet-level Escape shortcut */}
      <div
        className="mobile-sheet"
        role="dialog"
        aria-label="Entry actions"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            props.onClose();
          }
        }}
      >
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className="mobile-sheet-row"
            data-destructive={row.destructive || undefined}
            onClick={() => {
              props.onClose();
              row.run();
            }}
          >
            <span>{row.label}</span>
            {row.detail ? <span className="mobile-sheet-detail">{row.detail}</span> : null}
          </button>
        ))}
        <button
          type="button"
          className="mobile-sheet-row mobile-sheet-cancel"
          onClick={props.onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** ‹ Back pops to the library: selection IS the phone navigation stack. */
function MobileEditorBar(props: MobileEditorBarProps) {
  const store = useAppStoreApi();
  const status = useAppStore((state) => state.syncStatus);
  const [sheetOpen, setSheetOpen] = useState(false);
  const label = saveStateLabel(props.record, status);
  const liveSegment = {
    liveAvailable: props.liveUrl !== null,
    live: props.live,
    onLive: () => props.onLive(true),
  };
  return (
    <div className="mobile-editor-bar">
      <div className="mobile-editor-topline">
        <button
          type="button"
          className="mobile-back"
          onClick={() => store.getState().select(null)}
          aria-label="Back to the list"
        >
          ‹ Back
        </button>
        <DraftStateChip draft={props.record.draft} />
        <span className="save-state" title={label.title}>
          {label.text}
        </span>
        <button
          type="button"
          className="mobile-more"
          aria-label="Entry actions"
          onClick={() => setSheetOpen(true)}
        >
          ⋯
        </button>
      </div>
      <div className="mobile-editor-toggles">
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
      </div>
      {sheetOpen ? <ActionsSheet {...props} onClose={() => setSheetOpen(false)} /> : null}
    </div>
  );
}

export { MobileEditorBar };
