// ABOUTME: The editor screen's side of View › editor modes: publishes its three
// ABOUTME: segments while mounted, re-publishing only when they change.
import { useEffect, useRef } from "react";
import { type ModeSegment, setViewModes } from "./viewModes";

function segmentsFor(
  isLegacyHtml: boolean,
  liveAvailable: boolean,
): [ModeSegment, ModeSegment, ModeSegment] {
  return [
    { title: isLegacyHtml ? "Preview" : "Write", enabled: true },
    { title: isLegacyHtml ? "HTML" : "Markdown", enabled: true },
    { title: "Live", enabled: liveAvailable },
  ];
}

/** Typing re-renders the editor screen constantly; the target is only
 *  replaced (and the menu only touched) when a title or enabled flag moves. */
function useViewModeTarget(
  isLegacyHtml: boolean,
  liveAvailable: boolean,
  choose: (index: number) => void,
): void {
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  useEffect(
    () =>
      setViewModes({
        segments: segmentsFor(isLegacyHtml, liveAvailable),
        choose: (index) => chooseRef.current(index),
      }),
    [isLegacyHtml, liveAvailable],
  );
}

export { useViewModeTarget };
