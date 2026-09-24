// ABOUTME: macOS sync status: a borderless toolbar symbol (seven states, spec §3)
// ABOUTME: that opens the Activity popover — status, conflicts, Sync Now, the log.
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons/Icon";
import { clockTime } from "./format";
import { type Placement, popoverPlacement } from "./popoverPlacement";
import { useServices } from "./ServicesContext";
import { SyncLogList } from "./SyncLogList";
import { useAppStore, useAppStoreApi } from "./state";
import type { DeployState } from "./state.types";
import { type SyncButtonState, syncButtonState } from "./syncButtonState";
import { useNowMs } from "./useNowMs";

type ElementRef = React.RefObject<HTMLElement | null>;

/** While open: a pointerdown outside both the button and the popover closes
 *  it (ignoring the button, so pressing it again doesn't close-then-reopen),
 *  and Escape — wherever focus is — closes it and returns focus to the
 *  button. Capture phase: Tauri's drag-region handler stops mousedown
 *  propagation in the toolbar, so bubbling listeners would miss clicks. */
function useDismissal(
  open: boolean,
  refs: { button: ElementRef; popover: ElementRef },
  close: () => void,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const inside = (target: EventTarget | null) =>
      [refs.button.current, refs.popover.current].some(
        (element) => element?.contains(target as Node) ?? false,
      );
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Claimed, so a sheet's Escape handler doesn't also act on it.
        event.preventDefault();
        close();
        refs.button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, refs, close]);
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
              store.getState().openConflict(path);
            }}
          >
            {entries.find((entry) => entry.path === path)?.title || path}
          </button>
        </li>
      ))}
    </ul>
  );
}

const DEPLOY_LINES: Record<DeployState["state"], (at: number) => string> = {
  deploying: () => "Deploying…",
  live: (at) => `Live at ${clockTime(at)}`,
  failed: () => "Deploy failed",
};

/** The latest push's site deploy, under the popover's headline. */
function DeployLine() {
  const deploy = useAppStore((state) => state.deploy);
  if (!deploy) {
    return null;
  }
  return (
    <p className="activity-deploy" data-state={deploy.state}>
      {DEPLOY_LINES[deploy.state](deploy.at)}
    </p>
  );
}

/** Matches .activity-popover's width in app-macos-surfaces.css. */
const POPOVER_WIDTH = 340;

/** Fixed-position placement next to `anchor`, kept current on window resize. */
function usePlacement(anchor: React.RefObject<HTMLElement | null>): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      if (anchor.current) {
        setPlacement(
          popoverPlacement(
            anchor.current.getBoundingClientRect(),
            { width: window.innerWidth, height: window.innerHeight },
            POPOVER_WIDTH,
          ),
        );
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);
  return placement;
}

/** Rendered into <body>: inside the toolbar row, Tauri's window-drag region
 *  would turn clicks on its text and scrollbar into window drags (and
 *  double-clicks into zoom), and the row's nowrap would stop it wrapping. */
function ActivityPopover(props: {
  state: SyncButtonState;
  connected: boolean;
  anchor: ElementRef;
  popover: React.RefObject<HTMLDivElement | null>;
}) {
  const store = useAppStoreApi();
  const placement = usePlacement(props.anchor);
  useEffect(() => {
    props.popover.current?.focus();
  }, [props.popover]);
  return createPortal(
    <div
      ref={props.popover}
      className="activity-popover"
      style={(placement?.style as CSSProperties | undefined) ?? undefined}
      role="dialog"
      aria-label="Activity"
      tabIndex={-1}
    >
      {placement ? (
        <span
          className="activity-popover-arrow"
          data-edge={placement.arrow.edge}
          style={{ left: placement.arrow.x }}
          aria-hidden="true"
        />
      ) : null}
      {/* The body scrolls; the frame doesn't, so the arrow isn't clipped. */}
      <div className="activity-popover-body">
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
        <DeployLine />
        <ConflictList />
        <SyncLogList />
      </div>
    </div>,
    document.body,
  );
}

function SyncStatusButton() {
  const store = useAppStoreApi();
  const status = useAppStore((s) => s.syncStatus);
  const open = useAppStore((s) => s.syncLogOpen);
  const connected = useServices().sync !== null;
  const nowMs = useNowMs();
  const deploy = useAppStore((s) => s.deploy);
  const state = syncButtonState(status, connected, nowMs, deploy);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [refs] = useState(() => ({ button, popover }));
  const close = useAppStore((s) => s.closeSyncLog);
  useDismissal(open, refs, close);

  return (
    <span className="sync-status" ref={root}>
      <button
        ref={button}
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
      {open ? (
        <ActivityPopover state={state} connected={connected} anchor={root} popover={popover} />
      ) : null}
    </span>
  );
}

export { SyncStatusButton };
