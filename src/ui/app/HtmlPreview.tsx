// ABOUTME: Rendered read-only view of a legacy HTML post body — a fully
// ABOUTME: sandboxed iframe (no scripts, no same-origin) styled to match.
import { useMemo } from "react";

interface HtmlPreviewProps {
  /** The entry's body HTML (front matter already stripped). */
  html: string;
}

/** Inlined into the iframe so the preview follows the app's color scheme. */
const PREVIEW_CSS = `
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 4px 14px 24px;
    font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #1c1e21;
    background: #ffffff;
    max-width: 44em;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e7e8ea; background: #1b1c1f; }
    a { color: #5b8def; }
  }
  a { color: #2563eb; }
  img { max-width: 100%; height: auto; }
  pre { overflow-x: auto; }
`;

function HtmlPreview(props: HtmlPreviewProps) {
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><style>${PREVIEW_CSS}</style></head><body>${props.html}</body></html>`,
    [props.html],
  );
  return (
    <iframe
      className="html-preview"
      title="Rendered post"
      // Fully sandboxed: no scripts, no same-origin, no forms, no popups.
      // Legacy LiveJournal-era HTML runs inert; remote images still load.
      sandbox=""
      srcDoc={srcDoc}
    />
  );
}

export { HtmlPreview };
