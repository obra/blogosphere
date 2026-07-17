// ABOUTME: Publish confirmation dialog — date field (defaults to today), an
// ABOUTME: editable slug with a live URL preview, and, when the entry already
// ABOUTME: has a secret link, a keep-it-alive checkbox.
import { type FormEvent, useId, useState } from "react";
import { slugForPath, slugify } from "../../core/model/paths";
import type { PublishOptions } from "../../core/model/types";

interface PublishDialogProps {
  /** YYYY-MM-DD, injected by the caller so the dialog stays deterministic/testable. */
  today: string;
  /** The entry's secret-link id, if any — gates the keep-alive checkbox and
   *  feeds the /private/ URL preview while that checkbox is checked. */
  opaqueId: string | null;
  /** Current repo path — seeds the slug field from the existing filename. */
  path: string;
  title: string | null;
  onPublish: (opts: PublishOptions) => void;
  onCancel: () => void;
}

const UNTITLED_SLUG_RE = /^untitled(-\d+)?$/i;
const VALID_SLUG_RE = /^[A-Za-z0-9._-]+$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLUG_HINT = "Letters, numbers, periods, underscores, and hyphens only";

function isUntitledSlug(slug: string): boolean {
  return UNTITLED_SLUG_RE.test(slug);
}

function isValidSlug(slug: string): boolean {
  return VALID_SLUG_RE.test(slug);
}

/** Seed for the slug field: the filename's own slug (slugForPath — the same
 *  "current slug" planPublish uses), unless it's an untitled ⌘N scaffold
 *  ("untitled", "untitled-2", ...) — then a title-derived one, so the user
 *  isn't about to publish under a placeholder. */
function initialSlug(path: string, title: string | null): string {
  const currentSlug = slugForPath(path);
  if (currentSlug !== "" && !isUntitledSlug(currentSlug)) {
    return currentSlug;
  }
  return slugify(title ?? "");
}

/** The live URL this publish produces: `/private/<id>/` while the secret
 *  link is being kept (permalinkFor gives opaqueId absolute priority — see
 *  core/model/paths.ts), else `/YYYY/MM/DD/<slug>/` built from the slugified
 *  slug — the same normalization planPublish applies, so the preview shows
 *  the URL that will actually publish. Null while the date or slug isn't
 *  valid enough to preview yet — the hint takes over the same line then. */
function previewUrl(date: string, slug: string, keptOpaqueId: string | null): string | null {
  const match = ISO_DATE_RE.exec(date);
  if (!(match && isValidSlug(slug))) {
    return null;
  }
  if (keptOpaqueId) {
    return `/private/${keptOpaqueId}/`;
  }
  const [, year, month, day] = match;
  return `/${year}/${month}/${day}/${slugify(slug)}/`;
}

function SlugField(props: {
  fieldId: string;
  slug: string;
  preview: string | null;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="dialog-field">
      <label htmlFor={props.fieldId}>Slug</label>
      <input
        id={props.fieldId}
        type="text"
        value={props.slug}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
      <span className="entry-row-meta">{props.preview ?? SLUG_HINT}</span>
    </div>
  );
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
  const [slug, setSlug] = useState(() => initialSlug(props.path, props.title));
  const [keepOpaqueId, setKeepOpaqueId] = useState(false);
  const dateFieldId = useId();
  const slugFieldId = useId();
  const keepFieldId = useId();
  const hasOpaqueId = Boolean(props.opaqueId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Slugified here too (planPublish would anyway) so the submitted payload
    // is exactly what the preview line showed.
    props.onPublish({ date, slug: slugify(slug), ...(hasOpaqueId ? { keepOpaqueId } : {}) });
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
          <SlugField
            fieldId={slugFieldId}
            slug={slug}
            preview={previewUrl(date, slug, keepOpaqueId ? props.opaqueId : null)}
            onChange={setSlug}
          />
          {hasOpaqueId ? (
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!(date && isValidSlug(slug))}
            >
              Publish
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { PublishDialog };
