// ABOUTME: The phone-width shell: a Library screen (sections as chips, the
// ABOUTME: entry list, thumb-zone create buttons) that stacks into a
// ABOUTME: full-screen editor when an entry is selected. Same store, no modes.
import { SECTIONS } from "../types";
import { ConnectScreen } from "./ConnectScreen";
import { EditorScreen } from "./EditorScreen";
import { EntryList } from "./EntryList";
import { countsBySection, SECTION_LABELS } from "./grouping";
import { useServices } from "./ServicesContext";
import { SidebarFooterWidgets } from "./Sidebar";
import { useAppStore, useAppStoreApi } from "./state";

interface MobileShellProps {
  /** Integration wires the "rebuild github+sync" step, run after a token save. */
  onTokenSaved?: ((token: string) => void | Promise<void>) | undefined;
}

function SectionChips() {
  const store = useAppStoreApi();
  const section = useAppStore((state) => state.section);
  const entries = useAppStore((state) => state.entries);
  const counts = countsBySection(entries);
  return (
    <div className="mobile-chips" role="tablist" aria-label="Sections">
      {SECTIONS.map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={s === section}
          className="mobile-chip"
          onClick={() => store.getState().setSection(s)}
        >
          {SECTION_LABELS[s]}
          <span className="mobile-chip-count">{counts[s]}</span>
        </button>
      ))}
    </div>
  );
}

/** Header borrows the sidebar's footer widgets (sync pill, activity, settings)
 *  — same components, phone placement. */
function MobileHeader() {
  return (
    <header className="mobile-header">
      <span className="mobile-brand">Blogosphere</span>
      <div className="mobile-header-actions">
        <SidebarFooterWidgets />
      </div>
    </header>
  );
}

function MobileNewButtons() {
  const store = useAppStoreApi();
  return (
    <div className="mobile-new-bar">
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

function MobileLibrary() {
  return (
    <div className="mobile-library">
      <MobileHeader />
      <SectionChips />
      <EntryList />
      <MobileNewButtons />
    </div>
  );
}

/** selectedPath doubles as the navigation stack: null = library, an entry =
 *  the full-screen editor (its bar's Back is select(null)). First run (no
 *  sync configured) shows the connect card full-screen instead. */
function MobileShell(props: MobileShellProps) {
  const services = useServices();
  const selectedPath = useAppStore((state) => state.selectedPath);
  if (services.sync === null) {
    return (
      <div className="mobile-library">
        <MobileHeader />
        <ConnectScreen onTokenSaved={props.onTokenSaved} />
      </div>
    );
  }
  if (selectedPath === null) {
    return <MobileLibrary />;
  }
  return <EditorScreen />;
}

export { MobileShell };
