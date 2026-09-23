// ABOUTME: The macOS Settings window's page: the same sections as the in-window
// ABOUTME: modal, backed by the main window through the settings protocol.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommitMessageTemplates } from "../core/sync/types";
import { CommitTemplatesSection, ConnectionSection } from "../ui/app/SettingsSections";
import type { SettingsClient } from "./client";
import type { SettingsReply, SettingsState } from "./protocol";

function problemIn(reply: SettingsReply): string | null {
  return reply.ok ? null : (reply.error ?? "That didn't work. Try again.");
}

/** The main window's state: fetched on open, then kept current by its
 *  broadcasts. */
function useSettingsState(client: SettingsClient) {
  const [state, setState] = useState<SettingsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(() => {
    setLoadError(null);
    client.getState().then((reply) => {
      if (reply.state) {
        setState(reply.state);
      } else {
        setLoadError(problemIn(reply));
      }
    });
  }, [client]);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    client.onState(setState).then((unlisten) => {
      if (gone) {
        unlisten();
      } else {
        stop = unlisten;
      }
    });
    load();
    return () => {
      gone = true;
      stop?.();
    };
  }, [client, load]);
  return { state, loadError, load };
}

/** Reports the page's height whenever it changes, so the window can fit it. */
function useContentHeight(onHeight: ((px: number) => void) | undefined) {
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!(el && onHeight) || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => onHeight(Math.ceil(el.scrollHeight)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeight]);
  return root;
}

function SettingsWindow(props: { client: SettingsClient; onContentHeight?: (px: number) => void }) {
  const { client } = props;
  const { state, loadError, load } = useSettingsState(client);
  const root = useContentHeight(props.onContentHeight);
  const saveToken = async (token: string) => problemIn(await client.saveToken(token));
  const saveTemplates = async (templates: CommitMessageTemplates) =>
    problemIn(await client.saveTemplates(templates));

  return (
    <div className="settings-window" ref={root}>
      {loadError ? (
        <div className="settings-section">
          <p className="settings-error" role="alert">
            {loadError}
          </p>
          <button type="button" className="btn" onClick={load}>
            Try Again
          </button>
        </div>
      ) : null}
      {state ? (
        <>
          <ConnectionSection
            connected={state.connected}
            repoLabel={state.repo}
            saveToken={saveToken}
          />
          {/* Keyed by the saved templates, so a change made elsewhere
              replaces the form's draft instead of being hidden by it. */}
          <CommitTemplatesSection
            key={JSON.stringify(state.templates)}
            templates={state.templates}
            saveTemplates={saveTemplates}
          />
        </>
      ) : null}
    </div>
  );
}

export { SettingsWindow };
