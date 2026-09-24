// @vitest-environment jsdom
// ABOUTME: Activity log times: to the minute in the macOS popover (like the
// ABOUTME: rest of the Mac), to the second on the phone panel.
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { clockTime } from "./format";
import { SyncLogList } from "./SyncLogList";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

const AT = new Date(2026, 8, 23, 16, 55, 19).getTime();

function renderLog(platform: "macos" | "web") {
  const { store } = renderWithStore(<SyncLogList />, { shellOptions: { platform } });
  act(() => store.setState({ syncLog: [{ at: AT, level: "info", message: "Pulled." }] }));
  return screen.getByText("Pulled.").parentElement?.querySelector("time")?.textContent;
}

it("macOS: hours and minutes", () => {
  const shown = renderLog("macos");
  expect(shown).toBe(clockTime(AT));
  expect(shown).not.toContain("19");
});

it("elsewhere: to the second", () => {
  expect(renderLog("web")).toContain("19");
});
