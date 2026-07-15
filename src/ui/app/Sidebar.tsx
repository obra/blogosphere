// ABOUTME: Sidebar — section list with counts, sync status pill, and the
// ABOUTME: New Post / New Link creation buttons.
import type { Section } from "../types";
import { SECTIONS } from "../types";
import { countsBySection } from "./grouping";
import { useAppStore, useAppStoreApi } from "./state";
import { syncStatusLabel } from "./syncLabel";

const SECTION_LABELS: Record<Section, string> = {
  drafts: "Drafts",
  posts: "Posts",
  links: "Links",
  releases: "Releases",
};

function SyncStatusPill() {
  const store = useAppStoreApi();
  const status = useAppStore((state) => state.syncStatus);
  const label = syncStatusLabel(status);
  return (
    <button
      type="button"
      className="sync-pill"
      data-tone={label.tone}
      onClick={() => store.getState().openSettings()}
      title="Sync status"
    >
      <span className="sync-pill-dot" />
      {label.text}
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
        <SyncStatusPill />
      </div>
    </nav>
  );
}

export { Sidebar };
