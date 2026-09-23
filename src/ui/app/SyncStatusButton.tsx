// ABOUTME: macOS sync status: a borderless toolbar symbol (seven states, spec §3)
// ABOUTME: that opens the Activity popover — status, conflicts, Sync Now, the log.
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../icons/Icon";
import { type Placement, popoverPlacement } from "./popoverPlacement";
import { useServices } from "./ServicesContext";
import { SyncLogList } from "./SyncLogList";
import { useAppStore, useAppStoreApi } from "./state";
import { type SyncButtonState, syncButtonState } from "./syncButtonState";
import { useNowMs } from "./useNowMs";

/** Close the popover on a pointerdown anywhere outside `root` (the button and
 *  the popover both live inside it, so pressing the button again doesn't
 *  close-then-reopen). Capture phase: Tauri's drag-region handler stops
 *  mousedown propagation in the toolbar, so bubbling listeners would miss
 *  clicks there. */
function useDismissOnOutsidePointer(
  root: React.RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [root, open, close]);
}

/** Stable empty list: a fresh `[]` from a zustand selector re-renders forever. */
const NO_CONFLICTS: readonly string[] = [];

function ConflictList() {
  const store = useAppStoreApi();
  const conflicts = useAppStore((state) => state.syncStatus?.conflicts ?? NO_CONFLICTS);
  const entries = useAppStore((state) => state.entries);
  if (conflicts.length === 0) {
    return null;
  }
  return (
    <ul className="activity-conflicts">
      {conflicts.map((path) => (
        <li key={path}>
          <button
            type="button"
            className="activity-conflict"
            onClick={() => {
              store.getState().select(path);
              store.getState().closeSyncLog();
            }}
          >
            {entries.find((entry) => entry.path === path)?.title || path}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Fixed-position placement next to `anchor`, kept current on window resize. */
function usePlacement(anchor: React.RefObject<HTMLElement | null>): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      if (anchor.current) {
        setPlacement(
          popoverPlacement(anchor.current.getBoundingClientRect(), {
            width: window.innerWidth,
            height: window.innerHeight,
          }),
        );
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);
  return placement;
}

function ActivityPopover(props: {
  state: SyncButtonState;
  connected: boolean;
  anchor: React.RefObject<HTMLElement | null>;
}) {
  const store = useAppStoreApi();
  const placement = usePlacement(props.anchor);
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: popover-level Escape shortcut, like SyncLogPanel's dialog.
    <div
      className="activity-popover"
      style={(placement as CSSProperties | null) ?? undefined}
      role="dialog"
      aria-label="Activity"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          store.getState().closeSyncLog();
        }
      }}
    >
      <header className="activity-header">
        <p className="activity-headline">{props.state.tooltip}</p>
        {props.connected ? (
          <button type="button" className="btn" onClick={() => store.getState().syncNow()}>
            Sync Now
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => store.getState().openSettings()}>
            Connect…
          </button>
        )}
      </header>
      <ConflictList />
      <SyncLogList />
    </div>
  );
}

function SyncStatusButton() {
  const store = useAppStoreApi();
  const status = useAppStore((s) => s.syncStatus);
  const open = useAppStore((s) => s.syncLogOpen);
  const connected = useServices().sync !== null;
  const nowMs = useNowMs();
  const state = syncButtonState(status, connected, nowMs);
  const root = useRef<HTMLSpanElement>(null);
  const close = useAppStore((s) => s.closeSyncLog);
  useDismissOnOutsidePointer(root, open, close);

  return (
    <span className="sync-status" ref={root}>
      <button
        type="button"
        className="sync-status-button"
        data-kind={state.kind}
        title={state.tooltip}
        aria-label={state.tooltip}
        aria-expanded={open}
        onClick={() => store.getState().toggleSyncLog()}
      >
        <Icon name={state.icon} size={15} />
        {state.badge === null ? null : <span className="sync-status-badge">{state.badge}</span>}
      </button>
      {open ? <ActivityPopover state={state} connected={connected} anchor={root} /> : null}
    </span>
  );
}

export { SyncStatusButton };
