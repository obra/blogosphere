// ABOUTME: Sidebar — section list with counts, the New Post / New Link buttons,
// ABOUTME: and the footer utility row: sync-now button + settings gear.
import { useEffect, useState } from "react";
import type { Section } from "../types";
import { SECTIONS } from "../types";
import { relativeTimeLabel } from "./format";
import { countsBySection, SECTION_LABELS } from "./grouping";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";
import { syncStatusLabel } from "./syncLabel";

const RELATIVE_TIME_TICK_MS = 30_000;

/** Re-render on a slow tick so "3m ago" stays honest without a live clock. */
function useNowMs(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), RELATIVE_TIME_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return nowMs;
}

function pillTitle(connected: boolean, statusMessage: string | undefined): string {
  if (!connected) {
    return "Not connected — open Settings to connect";
  }
  // Surface the actual failure right on the pill; the activity log has history.
  return statusMessage ?? "Sync now (⌘R)";
}

function SyncButton() {
  const store = useAppStoreApi();
  const status = useAppStore((state) => state.syncStatus);
  const services = useServices();
  const nowMs = useNowMs();
  const label = syncStatusLabel(status);
  const syncing = status?.state === "syncing";
  const detail =
    label.tone === "ok" && status?.lastSyncAt ? relativeTimeLabel(status.lastSyncAt, nowMs) : null;
  const connected = services.sync !== null;
  return (
    <button
      type="button"
      className="sync-pill"
      data-tone={label.tone}
      onClick={() => (connected ? store.getState().syncNow() : store.getState().openSettings())}
      title={pillTitle(connected, status?.message)}
    >
      <span className={syncing ? "sync-pill-dot spinning" : "sync-pill-dot"} />
      <span className="sync-pill-text">
        {label.text}
        {detail ? <span className="sync-pill-detail"> · {detail}</span> : null}
      </span>
    </button>
  );
}

function ActivityLogButton() {
  const store = useAppStoreApi();
  return (
    <button
      type="button"
      className="sidebar-icon-button"
      onClick={() => store.getState().openSyncLog()}
      title="Activity log"
      aria-label="Activity log"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 6h16M4 12h16M4 18h10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function SettingsButton() {
  const store = useAppStoreApi();
  return (
    <button
      type="button"
      className="sidebar-icon-button"
      onClick={() => store.getState().openSettings()}
      title="Settings (⌘,)"
      aria-label="Settings"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.6c.04-.3.06-.6.06-.9s-.02-.6-.06-.9l2-1.6a.5.5 0 0 0 .12-.63l-1.9-3.3a.5.5 0 0 0-.6-.22l-2.37.95a7.3 7.3 0 0 0-1.56-.9l-.36-2.52A.5.5 0 0 0 14.24 2h-3.8a.5.5 0 0 0-.5.42l-.35 2.52c-.56.23-1.08.53-1.56.9l-2.37-.95a.5.5 0 0 0-.6.22l-1.9 3.3a.5.5 0 0 0 .12.63l2 1.6c-.04.3-.06.6-.06.9s.02.6.06.9l-2 1.6a.5.5 0 0 0-.12.63l1.9 3.3c.13.22.39.31.6.22l2.37-.95c.48.37 1 .67 1.56.9l.35 2.52a.5.5 0 0 0 .5.42h3.8a.5.5 0 0 0 .5-.42l.36-2.52a7.3 7.3 0 0 0 1.56-.9l2.37.95c.21.09.47 0 .6-.22l1.9-3.3a.5.5 0 0 0-.12-.63l-2-1.6Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

interface SidebarSectionButtonProps {
  section: Section;
  count: number;
  active: boolean;
}

function SidebarSectionButton(props: SidebarSectionButtonProps) {
  const store = useAppStoreApi();
  return (
    <li>
      <button
        type="button"
        className="sidebar-section-button"
        aria-current={props.active ? "true" : undefined}
        onClick={() => store.getState().setSection(props.section)}
      >
        <span>{SECTION_LABELS[props.section]}</span>
        <span className="sidebar-section-count">{props.count}</span>
      </button>
    </li>
  );
}

function NewEntryButtons() {
  const store = useAppStoreApi();
  return (
    <div className="sidebar-new-buttons">
      <button
        type="button"
        className="btn btn-block"
        onClick={() => store.getState().newDraft({ title: "" })}
      >
        New Post
      </button>
      <button
        type="button"
        className="btn btn-block"
        onClick={() => store.getState().openNewLinkDialog()}
      >
        New Link
      </button>
    </div>
  );
}

function Sidebar() {
  const section = useAppStore((state) => state.section);
  const entries = useAppStore((state) => state.entries);
  const counts = countsBySection(entries);

  return (
    <nav className="sidebar pane" aria-label="Sections">
      <div className="sidebar-brand">Blogosphere</div>
      <NewEntryButtons />
      <ul className="sidebar-sections">
        {SECTIONS.map((s) => (
          <SidebarSectionButton key={s} section={s} count={counts[s]} active={s === section} />
        ))}
      </ul>
      <div className="sidebar-footer">
        <SyncButton />
        <ActivityLogButton />
        <SettingsButton />
      </div>
    </nav>
  );
}

export { Sidebar };
