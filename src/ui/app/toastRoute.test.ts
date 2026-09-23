// ABOUTME: routeToast — where a toast goes on macOS: the HUD, a native alert,
// ABOUTME: or nowhere because the app's own state already shows it.
import { describe, expect, it } from "vitest";
import { routeToast } from "./toastRoute";

const focused = { windowFocused: true };
const background = { windowFocused: false };

describe("routeToast", () => {
  it("drops a background sync failure: the sync button's Error state shows it", () => {
    expect(routeToast({ tone: "error", message: "Couldn't sync.", source: "sync" }, focused)).toBe(
      "none",
    );
  });

  it("drops a failed entry load: the list's empty state (or its current contents) show it", () => {
    expect(
      routeToast(
        { tone: "error", message: "Couldn't load your entries.", source: "load" },
        focused,
      ),
    ).toBe("none");
  });

  it("shows the deploy HUD only while the window is in front", () => {
    const deployed = {
      tone: "success",
      message: "Live on blog.fsck.com",
      source: "deploy",
    } as const;
    expect(routeToast(deployed, focused)).toBe("hud");
    expect(routeToast(deployed, background)).toBe("none");
  });

  it("alerts for any other error: an action the person just took failed", () => {
    expect(routeToast({ tone: "error", message: "Couldn't delete this entry." }, focused)).toBe(
      "alert",
    );
    expect(routeToast({ tone: "error", message: "Search failed." }, background)).toBe("alert");
  });

  it("puts info and success in the HUD", () => {
    expect(routeToast({ tone: "info", message: "Saved." }, focused)).toBe("hud");
    expect(routeToast({ tone: "success", message: "Published." }, background)).toBe("hud");
  });
});
