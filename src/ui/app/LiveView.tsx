// ABOUTME: Live view — the entry as blog.fsck.com actually serves it, framed
// ABOUTME: straight from the live site (no local render that could lie).
import { useEffect, useState } from "react";
import { openExternal } from "./openExternal";

interface LiveViewProps {
  /** Full https URL on the live site (published permalink or /private/<id>/). */
  url: string;
}

interface LiveViewBarProps {
  url: string;
  onReload: () => void;
}

function LiveViewBar(props: LiveViewBarProps) {
  return (
    <div className="live-view-bar">
      <span className="live-view-url" title={props.url}>
        {props.url}
      </span>
      <div className="live-view-actions">
        <button type="button" className="btn" onClick={props.onReload}>
          Reload
        </button>
        <button type="button" className="btn" onClick={() => openExternal(props.url)}>
          Open in browser
        </button>
      </div>
    </div>
  );
}

interface LiveViewFrameProps {
  url: string;
  reloadKey: number;
  loaded: boolean;
  onLoad: () => void;
}

function LiveViewFrame(props: LiveViewFrameProps) {
  return (
    <div className="live-view-frame-wrap">
      {props.loaded ? null : (
        <div className="live-view-loading" aria-live="polite">
          <span className="live-view-spinner" aria-hidden="true" />
          <span>Loading live page…</span>
        </div>
      )}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad is a resource-load lifecycle event, not a user interaction — it's how the loading overlay above knows to clear. */}
      <iframe
        key={props.reloadKey}
        className="live-view-frame"
        src={props.url}
        title="Live post on blog.fsck.com"
        onLoad={props.onLoad}
      />
    </div>
  );
}

// The site sends no X-Frame-Options/CSP (verified 2026-07-16), so a direct
// iframe src is the honest, zero-CORS approach — fetching the HTML ourselves
// and rendering it via srcDoc would break every page-relative asset URL.
function LiveView(props: LiveViewProps) {
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Switching entries reuses this same iframe node (only its src changes),
  // which still re-navigates and re-fires onLoad — but the loading flag
  // isn't tied to that node's lifecycle, so it needs an explicit reset here.
  useEffect(() => {
    setLoaded(false);
  }, [props.url]);

  function handleReload() {
    // A key bump forces React to mount a *new* iframe node even when the URL
    // is unchanged — re-assigning an identical src wouldn't re-navigate.
    setLoaded(false);
    setReloadKey((key) => key + 1);
  }

  return (
    <div className="live-view">
      <LiveViewBar url={props.url} onReload={handleReload} />
      <p className="live-view-hint">
        Just published? Changes can take about a minute to show up here.
      </p>
      <LiveViewFrame
        url={props.url}
        reloadKey={reloadKey}
        loaded={loaded}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

export { LiveView };
