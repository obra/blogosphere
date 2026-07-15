// ABOUTME: "+ Link" capture dialog — url + title, an optional fetch-title
// ABOUTME: button, and clipboard prefill on open.
import { type FormEvent, useEffect, useId, useState } from "react";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";

interface NewLinkDialogProps {
  /** Integration wires the real og:title/<title> fetch; null disables the button. */
  fetchTitle: ((url: string) => Promise<string | null>) | null;
}

/** Prefills the URL field from the clipboard whenever the dialog opens, and
 *  reports whether the *current* value came from that prefill (true) or was
 *  since typed/edited by the user (false) — a swapped clipboard URL (e.g. a
 *  malicious page's "Copy link" button) should be visually distinguishable
 *  from one the user actually typed, not indistinguishable right up to the
 *  "Fetch title"/"Add link" click. */
function usePrefillFromClipboard(open: boolean, setUrl: (url: string) => void) {
  const services = useServices();
  const [fromClipboard, setFromClipboard] = useState(false);
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    services.shell.clipboardReadUrl().then((url) => {
      if (!cancelled && url) {
        setUrl(url);
        setFromClipboard(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, services, setUrl]);
  function noteManualEdit() {
    setFromClipboard(false);
  }
  return { fromClipboard, noteManualEdit };
}

function useFetchTitleHandler(
  props: NewLinkDialogProps,
  url: string,
  setTitle: (t: string) => void,
) {
  const [fetching, setFetching] = useState(false);
  function handleFetchTitle() {
    if (!(props.fetchTitle && url)) {
      return;
    }
    setFetching(true);
    props
      .fetchTitle(url)
      .then((fetched) => {
        if (fetched) {
          setTitle(fetched);
        }
      })
      .finally(() => setFetching(false));
  }
  return { fetching, handleFetchTitle };
}

/** handleClose resets local fields and closes; handleSubmit only calls it
 *  on success — a failed newLink() already reported why via a toast with a
 *  retry, so closing (and clearing the user's input) on top of that would
 *  silently discard a link that was never actually created. */
function useCloseAndSubmit(
  url: string,
  title: string,
  setUrl: (u: string) => void,
  setTitle: (t: string) => void,
) {
  const store = useAppStoreApi();
  function handleClose() {
    setUrl("");
    setTitle("");
    store.getState().closeNewLinkDialog();
  }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!(url.trim() && title.trim())) {
      return;
    }
    const path = await store.getState().newLink({ title: title.trim(), url: url.trim() });
    if (path !== null) {
      handleClose();
    }
  }
  return { handleClose, handleSubmit };
}

function NewLinkDialog(props: NewLinkDialogProps) {
  const open = useAppStore((state) => state.newLinkDialogOpen);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const urlFieldId = useId();
  const titleFieldId = useId();

  const { fromClipboard, noteManualEdit } = usePrefillFromClipboard(open, setUrl);
  const { fetching, handleFetchTitle } = useFetchTitleHandler(props, url, setTitle);
  const { handleClose, handleSubmit } = useCloseAndSubmit(url, title, setUrl, setTitle);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-label="New link post">
        <h2>New link</h2>
        <form onSubmit={handleSubmit}>
          <div className="dialog-field">
            <label htmlFor={urlFieldId}>URL</label>
            <input
              id={urlFieldId}
              type="url"
              value={url}
              onChange={(event) => {
                setUrl(event.currentTarget.value);
                noteManualEdit();
              }}
            />
            {fromClipboard ? (
              <span className="entry-row-meta">Pasted from your clipboard</span>
            ) : null}
          </div>
          <div className="dialog-field">
            <label htmlFor={titleFieldId}>Title</label>
            <div className="dialog-inline-row">
              <input
                id={titleFieldId}
                type="text"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
              {props.fetchTitle ? (
                <button
                  type="button"
                  className="btn"
                  disabled={!url || fetching}
                  onClick={handleFetchTitle}
                >
                  {fetching ? "Fetching…" : "Fetch title"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={handleClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!(url.trim() && title.trim())}
            >
              Add link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { NewLinkDialog };
