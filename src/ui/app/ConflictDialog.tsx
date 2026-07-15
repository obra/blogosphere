// ABOUTME: Conflict resolution dialog — read-only mine/theirs compare, keep
// ABOUTME: mine / use theirs buttons, and an "edit merged" hand-merge option.
import { useState } from "react";
import type { ConflictResolution } from "../../core/sync/types";

interface ConflictDialogProps {
  path: string;
  mine: string;
  theirs: string;
  onChoose: (resolution: ConflictResolution) => void;
  onCancel: () => void;
}

function MergeEditor(props: ConflictDialogProps & { onBack: () => void }) {
  const [merged, setMerged] = useState(props.mine);
  return (
    <>
      <h2>Edit merged version</h2>
      <p>{props.path}</p>
      <div className="conflict-column">
        <textarea
          className="merge-editor"
          value={merged}
          onChange={(event) => setMerged(event.currentTarget.value)}
        />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={props.onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => props.onChoose({ choose: "content", content: merged })}
        >
          Use this version
        </button>
      </div>
    </>
  );
}

function CompareView(props: ConflictDialogProps & { onEditMerged: () => void }) {
  return (
    <>
      <h2>This entry changed on both sides</h2>
      <p>{props.path}</p>
      <div className="conflict-columns">
        <div className="conflict-column">
          <h3>Yours</h3>
          <textarea readOnly={true} value={props.mine} aria-label="Your version" />
        </div>
        <div className="conflict-column">
          <h3>Theirs</h3>
          <textarea readOnly={true} value={props.theirs} aria-label="Their version" />
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={props.onCancel}>
          Not now
        </button>
        <button type="button" className="btn" onClick={props.onEditMerged}>
          Edit merged
        </button>
        <button type="button" className="btn" onClick={() => props.onChoose({ choose: "theirs" })}>
          Use theirs
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => props.onChoose({ choose: "mine" })}
        >
          Keep mine
        </button>
      </div>
    </>
  );
}

function ConflictDialog(props: ConflictDialogProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-label={`Resolve conflict in ${props.path}`}
      >
        {editing ? (
          <MergeEditor {...props} onBack={() => setEditing(false)} />
        ) : (
          <CompareView {...props} onEditMerged={() => setEditing(true)} />
        )}
      </div>
    </div>
  );
}

export { ConflictDialog };
