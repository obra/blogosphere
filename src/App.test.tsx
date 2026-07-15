// @vitest-environment jsdom
// ABOUTME: Smoke test — with no Tauri runtime in jsdom, App boots the
// ABOUTME: in-memory demo path and renders the real three-pane app shell,
// ABOUTME: seeded sample entries and all.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("boots the demo path and renders the app shell", async () => {
    render(<App />);

    expect(await screen.findByText("Blogosphere")).not.toBeNull();
  });

  it("lists the demo path's seeded sample entries once loaded (default section: drafts)", async () => {
    render(<App />);

    expect(await screen.findByText("Notes on building offline-first sync")).not.toBeNull();
  });
});
