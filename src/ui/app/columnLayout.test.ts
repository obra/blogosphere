// ABOUTME: columnLayout — sidebar/list widths for a window size: minimums, the
// ABOUTME: editor's 420pt floor (list gives way first), and divider-drag limits.
import { describe, expect, it } from "vitest";
import { clampDividerDrag, layoutColumns } from "./columnLayout";

const base = { windowWidth: 1100, sidebarWidth: 200, listWidth: 280, sidebarHidden: false };

describe("layoutColumns", () => {
  it("uses the stored widths when everything fits", () => {
    expect(layoutColumns(base)).toEqual({ sidebarWidth: 200, listWidth: 280 });
  });

  it("raises widths below their minimums", () => {
    expect(layoutColumns({ ...base, sidebarWidth: 40, listWidth: 100 })).toEqual({
      sidebarWidth: 160,
      listWidth: 240,
    });
  });

  it("keeps the editor at 420 by shrinking the list first", () => {
    // 900 wide: 900 - 420 = 480 for sidebar + list; sidebar keeps 200, list gets 280.
    expect(layoutColumns({ ...base, windowWidth: 900, listWidth: 500 })).toEqual({
      sidebarWidth: 200,
      listWidth: 280,
    });
  });

  it("then shrinks the sidebar, never below either minimum", () => {
    // 820 wide (the window minimum): 400 for sidebar + list = 160 + 240.
    expect(layoutColumns({ ...base, windowWidth: 820, sidebarWidth: 300, listWidth: 500 })).toEqual(
      { sidebarWidth: 160, listWidth: 240 },
    );
  });

  it("gives a hidden sidebar's space to the list, still keeping the editor's 420", () => {
    expect(
      layoutColumns({ ...base, sidebarHidden: true, windowWidth: 820, listWidth: 900 }),
    ).toEqual({ sidebarWidth: 200, listWidth: 400 });
  });
});

describe("clampDividerDrag", () => {
  it("lets the sidebar grow only as far as keeps the list and editor at their minimums", () => {
    expect(clampDividerDrag("sidebar", 900, base)).toBe(1100 - 420 - 280);
    expect(clampDividerDrag("sidebar", 50, base)).toBe(160);
  });

  it("lets the list grow only as far as keeps the editor at 420", () => {
    expect(clampDividerDrag("list", 900, base)).toBe(1100 - 420 - 200);
    expect(clampDividerDrag("list", 10, base)).toBe(240);
  });

  it("ignores the sidebar's width for the list when the sidebar is hidden", () => {
    expect(clampDividerDrag("list", 900, { ...base, sidebarHidden: true })).toBe(1100 - 420);
  });
});
