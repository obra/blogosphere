// @vitest-environment jsdom
// ABOUTME: LiveView — loading overlay until the iframe's onLoad fires, Reload
// ABOUTME: remounts it (key bump), Open in browser delegates to openExternal,
// ABOUTME: and the iframe src is always the raw live URL (no srcDoc).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveView } from "./LiveView";
import { openExternal } from "./openExternal";

vi.mock("./openExternal", () => ({
  openExternal: vi.fn(),
}));

const LOADING_PATTERN = /Loading live page/;
const HINT_PATTERN = /take about a minute/;
const LIVE_URL = "https://blog.fsck.com/2026/07/16/a-post/";
const OTHER_URL = "https://blog.fsck.com/2026/07/10/another-post/";

afterEach(() => {
  cleanup();
  vi.mocked(openExternal).mockClear();
});

function queryFrame(container: HTMLElement): HTMLIFrameElement | null {
  return container.querySelector(".live-view-frame");
}

it("points the iframe straight at the given url — no srcDoc", () => {
  render(<LiveView url={LIVE_URL} />);

  const frame = queryFrame(document.body);
  expect(frame?.getAttribute("src")).toBe(LIVE_URL);
  expect(frame?.hasAttribute("srcdoc")).toBe(false);
});

it("shows a loading state until the iframe fires onLoad", () => {
  render(<LiveView url={LIVE_URL} />);
  expect(screen.getByText(LOADING_PATTERN)).not.toBeNull();

  const frame = queryFrame(document.body);
  expect(frame).not.toBeNull();
  if (frame) {
    fireEvent.load(frame);
  }

  expect(screen.queryByText(LOADING_PATTERN)).toBeNull();
});

it("Reload remounts the iframe and shows the loading state again", () => {
  render(<LiveView url={LIVE_URL} />);
  const before = queryFrame(document.body);
  expect(before).not.toBeNull();
  if (before) {
    fireEvent.load(before);
  }
  expect(screen.queryByText(LOADING_PATTERN)).toBeNull();

  fireEvent.click(screen.getByText("Reload"));

  expect(screen.getByText(LOADING_PATTERN)).not.toBeNull();
  const after = queryFrame(document.body);
  expect(after).not.toBeNull();
  expect(after).not.toBe(before);
  expect(after?.getAttribute("src")).toBe(LIVE_URL);
});

it("switching to a new url resets to the loading state", () => {
  const { rerender } = render(<LiveView url={LIVE_URL} />);
  const before = queryFrame(document.body);
  expect(before).not.toBeNull();
  if (before) {
    fireEvent.load(before);
  }
  expect(screen.queryByText(LOADING_PATTERN)).toBeNull();

  rerender(<LiveView url={OTHER_URL} />);

  expect(screen.getByText(LOADING_PATTERN)).not.toBeNull();
  expect(queryFrame(document.body)?.getAttribute("src")).toBe(OTHER_URL);
});

it("Open in browser hands off to openExternal with the live url", () => {
  render(<LiveView url={LIVE_URL} />);

  fireEvent.click(screen.getByText("Open in browser"));

  expect(vi.mocked(openExternal)).toHaveBeenCalledWith(LIVE_URL);
});

it("shows a quiet hint that deploys take about a minute", () => {
  render(<LiveView url={LIVE_URL} />);
  expect(screen.getByText(HINT_PATTERN)).not.toBeNull();
});
