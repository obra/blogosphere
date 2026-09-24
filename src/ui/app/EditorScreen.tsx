// ABOUTME: The editor screen — its toolbar (EditorBar), the document (title, date,
// ABOUTME: tags, body Editor), or the Live/HTML preview filling the pane.
import { useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import type { HtmlViewMode } from "../types";
import { EditorBar } from "./EditorBar";
import { EditorDocument } from "./EditorDocument";
import { HtmlPreview } from "./HtmlPreview";
import { LiveView } from "./LiveView";
import { DetailToolbar } from "./MacToolbar";
import { PublishDialogHost } from "./PublishControls";
import { useServices } from "./ServicesContext";
import { useAppStore } from "./state";
import { useEditorScreenState } from "./useEditorScreenState";
import { useViewModeTarget } from "./useViewModeTarget";

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

function EditorScreenBody(props: { record: EntryRecord }) {
  const s = useEditorScreenState(props.record);
  // Legacy HTML entries open in the rendered view; editing is one click away.
  const [htmlView, setHtmlView] = useState<HtmlViewMode>("preview");
  const [live, setLive] = useState(false);
  const modeState = {
    readable: s.parsed !== null,
    isLegacyHtml: s.isLegacyHtml,
    liveAvailable: s.liveUrl !== null,
  };
  useViewModeTarget(modeState, (index) => {
    // The third segment is Live in both kinds; the first two are the
    // editor modes, or Preview/HTML for legacy entries.
    setLive(index === 2);
    if (index === 2) {
      return;
    }
    if (s.isLegacyHtml) {
      setHtmlView(index === 0 ? "preview" : "source");
    } else {
      s.commitMode(index === 0 ? "wysiwyg" : "source");
    }
  });

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
          <EditorDocument record={props.record} state={s} />
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
