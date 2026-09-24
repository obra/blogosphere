// @vitest-environment jsdom
// ABOUTME: The macOS sync status button and its Activity popover: state shown,
// ABOUTME: open/close paths (button, Escape, click outside), and its actions.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncStatus } from "../../core/sync/types";
import { Sidebar } from "./Sidebar";
import { SyncStatusButton } from "./SyncStatusButton";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(() => {
  cleanup();
});

const MAC = { shellOptions: { platform: "macos" as const } };

function status(overrides: Partial<SyncStatus>): SyncStatus {
  return { state: "idle", pendingCount: 0, conflicts: [], lastSyncAt: null, ...overrides };
}

function button(): HTMLElement {
  const found = document.querySelector<HTMLElement>(".sync-status-button");
  if (!found) {
    throw new Error("sync status button not rendered");
  }
  return found;
}

describe("SyncStatusButton", () => {
  it("shows the error over pending changes, with the message", () => {
    renderWithStore(<SyncStatusButton />, {
      ...MAC,
      syncOptions: { status: status({ state: "error", pendingCount: 2, message: "HTTP 500" }) },
    });
    const b = button();
    expect(b.getAttribute("title")).toBe("Couldn't sync: HTTP 500");
    expect(b.getAttribute("data-kind")).toBe("error");
    expect(b.textContent).toContain("2");
  });

  it("opens the Activity popover on click and closes it on a second click", () => {
    const { store } = renderWithStore(<SyncStatusButton />, MAC);
    fireEvent.click(button());
    expect(store.getState().syncLogOpen).toBe(true);
    expect(screen.getByRole("dialog", { name: "Activity" })).not.toBeNull();

    fireEvent.pointerDown(button());
    fireEvent.click(button());
    expect(store.getState().syncLogOpen).toBe(false);
  });

  it("closes on Escape wherever focus is, returning focus to the button", () => {
    const { store } = renderWithStore(<SyncStatusButton />, MAC);
    button().focus();
    fireEvent.click(button());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(store.getState().syncLogOpen).toBe(false);
    expect(document.activeElement).toBe(button());
  });

  it("takes focus when it opens, so the keyboard lands in it", () => {
    renderWithStore(<SyncStatusButton />, MAC);
    fireEvent.click(button());
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Activity" }));
  });

  it("lives outside the toolbar row, so the window-drag region can't swallow its clicks", () => {
    renderWithStore(
      <div className="toolbar-row" data-tauri-drag-region="deep">
        <SyncStatusButton />
      </div>,
      MAC,
    );
    fireEvent.click(button());
    const dialog = screen.getByRole("dialog", { name: "Activity" });
    expect(dialog.closest("[data-tauri-drag-region]")).toBeNull();
  });

  it("hangs below the button with its arrow pointing at the button's center", () => {
    renderWithStore(<SyncStatusButton />, MAC);
    const anchor = button().closest(".sync-status") as HTMLElement;
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 900, y: 12, width: 100, height: 28 }),
    );
    fireEvent.click(button());
    const popover = screen.getByRole("dialog", { name: "Activity" });
    const arrow = document.querySelector<HTMLElement>(".activity-popover-arrow");
    expect(popover.style.top).toBe("48px");
    expect(popover.style.right).toBe(`${window.innerWidth - 1000}px`);
    expect(arrow?.dataset.edge).toBe("top");
    // The popover's left edge is at innerWidth - right - 340; the center is 950.
    expect(arrow?.style.left).toBe(`${950 - (1000 - 340)}px`);
  });

  it("closes on a pointerdown outside it", () => {
    const { store } = renderWithStore(
      <div>
        <SyncStatusButton />
        <p>elsewhere</p>
      </div>,
      MAC,
    );
    fireEvent.click(button());
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(store.getState().syncLogOpen).toBe(false);
  });

  it("stays open for a pointerdown inside the popover", () => {
    const { store } = renderWithStore(<SyncStatusButton />, MAC);
    fireEvent.click(button());
    fireEvent.pointerDown(screen.getByRole("dialog", { name: "Activity" }));
    expect(store.getState().syncLogOpen).toBe(true);
  });

  it("syncs from the popover's Sync Now", () => {
    const { store, sync } = renderWithStore(<SyncStatusButton />, MAC);
    if (!sync) {
      throw new Error("fake services should include sync");
    }
    const spy = vi.spyOn(sync, "sync");
    act(() => store.getState().toggleSyncLog());
    fireEvent.click(screen.getByRole("button", { name: "Sync Now" }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("lists conflicted entries; choosing one selects it and closes the popover", async () => {
    const entry = makeEntry({
      path: "content/blog/2026/a.md",
      kind: "post",
      title: "Clashing post",
    });
    const { store } = renderWithStore(<SyncStatusButton />, {
      ...MAC,
      seedEntries: [entry],
      syncOptions: { status: status({ conflicts: [entry.path] }) },
    });
    await act(async () => {
      await store.getState().refresh();
    });
    act(() => store.getState().toggleSyncLog());
    fireEvent.click(screen.getByRole("button", { name: "Clashing post" }));
    expect(store.getState().selectedPath).toBe(entry.path);
    expect(store.getState().syncLogOpen).toBe(false);
  });

  it("offers Connect… when not connected", () => {
    const { store, shell } = renderWithStore(<SyncStatusButton />, { ...MAC, withSync: false });
    act(() => store.getState().toggleSyncLog());
    fireEvent.click(screen.getByRole("button", { name: "Connect…" }));
    expect(shell.settingsWindowOpens()).toBe(1);
  });
});

describe("Sidebar footer by platform", () => {
  it("has no sync controls in the macOS sidebar (the status lives in the toolbar)", () => {
    renderWithStore(<Sidebar />, { ...MAC, seedEntries: [] });
    expect(screen.queryByLabelText("Activity log")).toBeNull();
    expect(document.querySelector(".sync-status-button")).toBeNull();
    expect(document.querySelector(".sync-pill")).toBeNull();
  });

  it("keeps the pill and activity button elsewhere", () => {
    renderWithStore(<Sidebar />, { seedEntries: [] });
    expect(screen.getByLabelText("Activity log")).not.toBeNull();
    expect(document.querySelector(".sync-pill")).not.toBeNull();
  });
});
