// ABOUTME: Live view — the entry as blog.fsck.com actually serves it, framed
// ABOUTME: straight from the live site (no local render that could lie).
// ABOUTME: CONTRACT STUB: feature F polishes the internals (see contracts doc).
import { openExternal } from "./openExternal";

interface LiveViewProps {
  /** Full https URL on the live site (published permalink or /private/<id>/). */
  url: string;
}

// Feature F requirements: loading shimmer until the iframe fires onLoad; a
// Reload control (remount the iframe via a key bump); "Open in browser"
// (openExternal); a friendly hint that a just-pushed change takes ~a minute
// to deploy (pair with the activity log's "Live ✓" line); dark-mode-friendly
// chrome around the frame. The site sends no X-Frame-Options/CSP (verified
// 2026-07-16), so a direct iframe src is the honest, zero-CORS approach.
function LiveView(props: LiveViewProps) {
  return (
    <div className="live-view">
      <div className="live-view-bar">
        <span className="live-view-url" title={props.url}>
          {props.url}
        </span>
        <button type="button" className="btn" onClick={() => openExternal(props.url)}>
          Open in browser
        </button>
      </div>
      <iframe className="live-view-frame" src={props.url} title="Live post on blog.fsck.com" />
    </div>
  );
}

export { LiveView };
