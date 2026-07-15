// ABOUTME: Publish confirmation dialog — date field (defaults to today) and,
// ABOUTME: when the entry already has a secret link, a keep-it-alive checkbox.
import { type FormEvent, useId, useState } from "react";
import type { PublishOptions } from "../../core/model/types";

interface PublishDialogProps {
  /** YYYY-MM-DD, injected by the caller so the dialog stays deterministic/testable. */
  today: string;
  hasOpaqueId: boolean;
  onPublish: (opts: PublishOptions) => void;
  onCancel: () => void;
}

function KeepOpaqueIdField(props: {
  fieldId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="dialog-checkbox-row">
      <input
        id={props.fieldId}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <label htmlFor={props.fieldId}>Keep secret link alive</label>
    </div>
  );
}

function PublishDialog(props: PublishDialogProps) {
  const [date, setDate] = useState(props.today);
  const [keepOpaqueId, setKeepOpaqueId] = useState(false);
  const dateFieldId = useId();
  const keepFieldId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    props.onPublish({ date, ...(props.hasOpaqueId ? { keepOpaqueId } : {}) });
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-label="Publish">
        <h2>Publish</h2>
        <form onSubmit={handleSubmit}>
          <div className="dialog-field">
            <label htmlFor={dateFieldId}>Publish date</label>
            <input
              id={dateFieldId}
              type="date"
              value={date}
              onChange={(event) => setDate(event.currentTarget.value)}
            />
          </div>
          {props.hasOpaqueId ? (
            <KeepOpaqueIdField
              fieldId={keepFieldId}
              checked={keepOpaqueId}
              onChange={setKeepOpaqueId}
            />
          ) : null}
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={props.onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!date}>
              Publish
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { PublishDialog };
