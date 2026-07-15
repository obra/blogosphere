// ABOUTME: "+ Link" capture dialog — url + title, an optional fetch-title
// ABOUTME: button, and clipboard prefill on open.
import { type FormEvent, useEffect, useId, useState } from "react";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";

interface NewLinkDialogProps {
  /** Integration wires the real og:title/<title> fetch; null disables the button. */
  fetchTitle: ((url: string) => Promise<string | null>) | null;
}

function usePrefillFromClipboard(open: boolean, setUrl: (url: string) => void) {
  const services = useServices();
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    services.shell.clipboardReadUrl().then((url) => {
      if (!cancelled && url) {
        setUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, services, setUrl]);
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

function NewLinkDialog(props: NewLinkDialogProps) {
  const open = useAppStore((state) => state.newLinkDialogOpen);
  const store = useAppStoreApi();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const urlFieldId = useId();
  const titleFieldId = useId();

  usePrefillFromClipboard(open, setUrl);
  const { fetching, handleFetchTitle } = useFetchTitleHandler(props, url, setTitle);

  if (!open) {
    return null;
  }

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
    await store.getState().newLink({ title: title.trim(), url: url.trim() });
    handleClose();
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
              onChange={(event) => setUrl(event.currentTarget.value)}
            />
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
