// ABOUTME: The macOS HUD: a small, non-interactive notice at the bottom center
// ABOUTME: for info and success ("Saved.", "Published."), gone after a moment.
import { type CSSProperties, useEffect } from "react";
import { hudDuration } from "./hudDuration";
import { useAppStore, useAppStoreApi } from "./state";

function Hud() {
  const store = useAppStoreApi();
  const hud = useAppStore((state) => state.hud);
  useEffect(() => {
    if (!hud) {
      return;
    }
    const timer = setTimeout(() => store.getState().dismissHud(hud.id), hudDuration(hud.message));
    return () => clearTimeout(timer);
  }, [store, hud]);
  if (!hud) {
    return null;
  }
  // Keyed by id so each notice restarts the fade.
  return (
    <div
      key={hud.id}
      className="hud"
      role="status"
      aria-live="polite"
      style={{ "--hud-duration": `${hudDuration(hud.message)}ms` } as CSSProperties}
    >
      {hud.message}
    </div>
  );
}

export { Hud };
