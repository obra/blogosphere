// ABOUTME: The editor screen's side of View › editor modes: publishes its three
// ABOUTME: segments while mounted, re-publishing only when they change.
import { useEffect, useRef } from "react";
import { type ModeSegment, setViewModes } from "./viewModes";

interface ModeState {
  /** False when the entry couldn't be read: nothing to switch between. */
  readable: boolean;
  isLegacyHtml: boolean;
  liveAvailable: boolean;
}

function segmentsFor(state: ModeState): [ModeSegment, ModeSegment, ModeSegment] {
  return [
    { title: state.isLegacyHtml ? "Preview" : "Write", enabled: state.readable },
    { title: state.isLegacyHtml ? "HTML" : "Markdown", enabled: state.readable },
    { title: "Live", enabled: state.readable && state.liveAvailable },
  ];
}

/** Typing re-renders the editor screen constantly; the target is only
 *  replaced (and the menu only touched) when a title or enabled flag moves. */
function useViewModeTarget(state: ModeState, choose: (index: number) => void): void {
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  const { readable, isLegacyHtml, liveAvailable } = state;
  useEffect(
    () =>
      setViewModes({
        segments: segmentsFor({ readable, isLegacyHtml, liveAvailable }),
        choose: (index) => chooseRef.current(index),
      }),
    [readable, isLegacyHtml, liveAvailable],
  );
}

export { useViewModeTarget };
