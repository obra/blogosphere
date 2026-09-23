// ABOUTME: macOS toolbar pieces: the 52pt draggable row (aligned with the traffic
// ABOUTME: lights), the sidebar toggle, and the compose button with its menu.
import type { ReactNode } from "react";
import type { EntryRecord } from "../../core/store/types";
import { Icon } from "../icons/Icon";
import { composeMenuItems, entryActionItems, runMenuCommand } from "./menuModel";
import { popupMenu } from "./menuPopup";
import { SyncStatusButton } from "./SyncStatusButton";
import { useAppStore, useAppStoreApi } from "./state";

/** One segment of the window's toolbar row. The whole row drags the window
 *  ("deep": clicks on its text and spacers count, not only the row itself);
 *  Tauri still lets buttons and inputs take their own clicks. */
function ToolbarRow(props: { children: ReactNode; leadingInset?: boolean; className?: string }) {
  return (
    <div
      className={props.className ? `toolbar-row ${props.className}` : "toolbar-row"}
      data-tauri-drag-region="deep"
      data-leading-inset={props.leadingInset ? "true" : undefined}
    >
      {props.children}
    </div>
  );
}

function ToolbarButton(props: {
  label: string;
  shortcut?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="toolbar-button"
      aria-label={props.label}
      title={props.shortcut ? `${props.label} (${props.shortcut})` : props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function SidebarToggleButton() {
  const store = useAppStoreApi();
  const hidden = useAppStore((state) => state.sidebarHidden);
  return (
    <ToolbarButton
      label={hidden ? "Show Sidebar" : "Hide Sidebar"}
      shortcut="⌃⌘S"
      onClick={() => store.getState().toggleSidebar()}
    >
      <Icon name="sidebarToggle" size={15} />
    </ToolbarButton>
  );
}

/** New Post on click; the chevron beside it offers New Post and New Link. */
function ComposeButton() {
  const store = useAppStoreApi();
  return (
    <span className="toolbar-compose">
      <ToolbarButton
        label="New Post"
        shortcut="⌘N"
        onClick={() => runMenuCommand("newPost", store)}
      >
        <Icon name="compose" size={15} />
      </ToolbarButton>
      <button
        type="button"
        className="toolbar-button toolbar-menu-chevron"
        aria-label="New…"
        title="New Post or New Link"
        onClick={(event) =>
          popupMenu(
            "compose",
            composeMenuItems(),
            (id) => runMenuCommand(id, store),
            event.currentTarget,
          )
        }
      >
        <Icon name="composeMenu" size={9} />
      </button>
    </span>
  );
}

/** The editor side of the row. Window-level: every detail state (entry,
 *  nothing selected, connect screen, unreadable entry) renders one, so the
 *  sync status always has a home. */
function DetailToolbar(props: { leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <ToolbarRow className="detail-toolbar">
      {props.leading}
      <span className="toolbar-spacer" />
      <SyncStatusButton />
      {props.trailing}
    </ToolbarRow>
  );
}

/** The entry's secondary commands (Open on Site, Versions…, Copy Secret
 *  Link, Discard, Delete) as a native menu — they don't fit the row. */
function EntryActionsButton(props: { record: EntryRecord; liveUrl: string | null }) {
  const store = useAppStoreApi();
  return (
    <ToolbarButton
      label="More"
      onClick={(event) =>
        popupMenu(
          "entryActions",
          entryActionItems(props.record, props.liveUrl),
          (id) => runMenuCommand(id, store),
          event.currentTarget,
        )
      }
    >
      <Icon name="more" size={15} />
    </ToolbarButton>
  );
}

/** The sidebar's top bar: room for the traffic lights, then the toggle. */
function SidebarTopBar() {
  return (
    <ToolbarRow className="sidebar-top-bar">
      <SidebarToggleButton />
    </ToolbarRow>
  );
}

export {
  ComposeButton,
  DetailToolbar,
  EntryActionsButton,
  SidebarToggleButton,
  SidebarTopBar,
  ToolbarButton,
  ToolbarRow,
};
