// @vitest-environment jsdom
// ABOUTME: Toolbar with icons supplied by the app (macOS symbols): each button
// ABOUTME: shows the icon, keeps its plain name, and advertises its shortcut.
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, expect, it } from "vitest";
import type { EditorHandle } from "./markdown-utils";
import { Toolbar } from "./Toolbar";

afterEach(cleanup);

function renderToolbar(withIcons: boolean) {
  const handle = createRef<EditorHandle>();
  render(
    <Toolbar
      handle={handle}
      onImage={() => Promise.resolve(null)}
      readOnly={false}
      {...(withIcons ? { renderIcon: (name: string) => <i data-icon={name} /> } : {})}
    />,
  );
}

it("shows the app's icon in each button, keeping the plain name", () => {
  renderToolbar(true);
  const bold = screen.getByRole("button", { name: "Bold" });
  expect(bold.querySelector('[data-icon="bold"]')).not.toBeNull();
  expect(bold.getAttribute("title")).toBe("Bold ⌘B");
  expect(bold.getAttribute("aria-keyshortcuts")).toBe("Meta+B");
  const image = screen.getByRole("button", { name: "Insert image" });
  expect(image.querySelector('[data-icon="image"]')).not.toBeNull();
  expect(image.getAttribute("aria-keyshortcuts")).toBeNull();
});

it("keeps today's text labels without icons", () => {
  renderToolbar(false);
  expect(screen.getByRole("button", { name: "Bold" }).textContent).toBe("B");
  expect(screen.getByRole("button", { name: "Bold" }).getAttribute("title")).toBe("Bold");
});
