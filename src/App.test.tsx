// @vitest-environment jsdom
// ABOUTME: Smoke test proving the jsdom-per-file pragma + testing-library +
// ABOUTME: React 19 pipeline works end to end. Superseded once real UI lands.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the app name", () => {
    render(<App />);
    expect(screen.getByText("Blogosphere")).not.toBeNull();
  });
});
