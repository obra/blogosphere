// ABOUTME: Publish button + the dialog host, split from EditorScreen so both
// ABOUTME: the desktop toolbar and the phone actions sheet share ONE dialog
// ABOUTME: instance (open-state lives in the store; the menu opens it too).
import type { EntryRecord } from "../../core/store/types";
import { todayIso } from "./format";
import { PublishDialog } from "./PublishDialog";
import { useAppStore, useAppStoreApi } from "./state";

function PublishButton() {
  const store = useAppStoreApi();
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => store.getState().openPublishDialog()}
    >
      Publish
    </button>
  );
}

/** Renders the dialog whenever the store says it's open — mounted once per
 *  editor screen, independent of which layout's button opened it. */
function PublishDialogHost(props: { record: EntryRecord }) {
  const store = useAppStoreApi();
  const open = useAppStore((state) => state.publishDialogOpen);
  if (!open) {
    return null;
  }
  const { path, opaqueId, title } = props.record;
  return (
    <PublishDialog
      today={todayIso(Date.now())}
      opaqueId={opaqueId}
      path={path}
      title={title}
      onCancel={() => store.getState().closePublishDialog()}
      onPublish={(opts) => {
        store.getState().closePublishDialog();
        store.getState().publishDraft(path, opts);
      }}
    />
  );
}

export { PublishButton, PublishDialogHost };
