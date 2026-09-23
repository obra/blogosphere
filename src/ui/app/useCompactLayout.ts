// ABOUTME: The phone/desktop breakpoint: ≤760px viewports get the stacked
// ABOUTME: mobile shell, wider ones keep the three-pane desktop layout.
import { useEffect, useState } from "react";
import type { Platform } from "../../shell/types";
import { useServices } from "./ServicesContext";

/** 760px matches the desktop window's own minimum width — anything narrower
 *  (phones, small tablet portrait) can't fit three panes honestly. */
const COMPACT_LAYOUT_QUERY = "(max-width: 760px)";

function queryList(): MediaQueryList | null {
  // jsdom and some ancient webviews lack matchMedia — default to desktop.
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia(COMPACT_LAYOUT_QUERY)
    : null;
}

/** macOS never gets the phone shell: a narrow Mac window is still a Mac
 *  window (the native-redesign spec's platform gate), so only other
 *  platforms consult the viewport. */
function useCompactLayout(platform: Platform): boolean {
  const eligible = platform !== "macos";
  const [compact, setCompact] = useState(() => eligible && (queryList()?.matches ?? false));
  useEffect(() => {
    const mql = eligible ? queryList() : null;
    if (!mql) {
      setCompact(false);
      return;
    }
    const onChange = (event: { matches: boolean }) => setCompact(event.matches);
    mql.addEventListener("change", onChange);
    setCompact(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [eligible]);
  return compact;
}

/** useCompactLayout for the running app's own platform. */
function useAppCompactLayout(): boolean {
  return useCompactLayout(useServices().shell.platform());
}

export { COMPACT_LAYOUT_QUERY, useAppCompactLayout, useCompactLayout };
