// ABOUTME: Escape cancels an open sheet, wherever focus is inside the window —
// ABOUTME: after inner controls (date pickers, IMEs) have had their chance.
import { useEffect, useRef } from "react";

/**
 * Listens on the document in the bubble phase, so a control inside the sheet
 * that handles Escape itself (and calls preventDefault) keeps it, as does an
 * IME ending a composition. `active` false (a sheet component that's
 * mounted but closed) listens to nothing.
 */
function useEscapeToCancel(onCancel: () => void, active = true): void {
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    if (!active) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
        return;
      }
      event.preventDefault();
      onCancelRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);
}

export { useEscapeToCancel };
