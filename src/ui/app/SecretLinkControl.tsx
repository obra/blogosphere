// ABOUTME: Secret-link toolbar control — mints/copies a draft's private URL with
// ABOUTME: inline copied feedback. Split from EditorScreen.tsx (line cap).
import { useEffect, useRef, useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import { useAppStoreApi } from "./state";
import { SITE_ORIGIN } from "./state.types";

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

export { SecretLinkControl };
