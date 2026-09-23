// ABOUTME: A macOS split-view divider: dragging it resizes the column to its left
// ABOUTME: live (clamped by columnLayout) and saves the width when the drag ends.
import type { PointerEvent as ReactPointerEvent } from "react";
import { clampDividerDrag, layoutColumns } from "./columnLayout";
import { type BoundAppStore, useAppStoreApi } from "./state";

type Column = "sidebar" | "list";

function columnInput(store: BoundAppStore) {
  const state = store.getState();
  return {
    windowWidth: globalThis.innerWidth,
    sidebarWidth: state.sidebarWidth,
    listWidth: state.listWidth,
    sidebarHidden: state.sidebarHidden,
  };
}

/** Follows the pointer from pointerdown to pointerup, starting from the
 *  width actually drawn (which may be narrower than the stored one). */
function startDrag(event: ReactPointerEvent<HTMLDivElement>, column: Column, store: BoundAppStore) {
  event.preventDefault();
  const drawn = layoutColumns(columnInput(store));
  const startWidth = column === "sidebar" ? drawn.sidebarWidth : drawn.listWidth;
  const startX = event.clientX;
  // jsdom and some older WebKits lack pointer capture; window listeners
  // already follow the pointer, capture just keeps text from selecting.
  event.currentTarget.setPointerCapture?.(event.pointerId);

  const widthAt = (clientX: number) =>
    clampDividerDrag(column, startWidth + clientX - startX, columnInput(store));
  const onMove = (move: PointerEvent) => {
    store.getState().setColumnWidth(column, widthAt(move.clientX), false);
  };
  const onUp = (up: PointerEvent) => {
    globalThis.removeEventListener("pointermove", onMove);
    globalThis.removeEventListener("pointerup", onUp);
    store.getState().setColumnWidth(column, widthAt(up.clientX), true);
  };
  globalThis.addEventListener("pointermove", onMove);
  globalThis.addEventListener("pointerup", onUp);
}

function ColumnDivider(props: { column: Column; at?: number }) {
  const store = useAppStoreApi();
  return (
    <div
      className="column-divider"
      data-column={props.column}
      style={props.at === undefined ? undefined : { left: props.at }}
      onPointerDown={(event) => startDrag(event, props.column, store)}
    />
  );
}

export { ColumnDivider };
