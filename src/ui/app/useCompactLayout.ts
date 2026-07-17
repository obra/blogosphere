// ABOUTME: The phone/desktop breakpoint: ≤760px viewports get the stacked
// ABOUTME: mobile shell, wider ones keep the three-pane desktop layout.
import { useEffect, useState } from "react";

/** 760px matches the desktop window's own minimum width — anything narrower
 *  (phones, small tablet portrait) can't fit three panes honestly. */
const COMPACT_LAYOUT_QUERY = "(max-width: 760px)";

function queryList(): MediaQueryList | null {
  // jsdom and some ancient webviews lack matchMedia — default to desktop.
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia(COMPACT_LAYOUT_QUERY)
    : null;
}

function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(() => queryList()?.matches ?? false);
  useEffect(() => {
    const mql = queryList();
    if (!mql) {
      return;
    }
    const onChange = (event: { matches: boolean }) => setCompact(event.matches);
    mql.addEventListener("change", onChange);
    setCompact(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return compact;
}

export { COMPACT_LAYOUT_QUERY, useCompactLayout };
