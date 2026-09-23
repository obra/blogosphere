// @vitest-environment jsdom
// ABOUTME: The Settings modal (phones and non-Mac): a token GitHub rejects is
// ABOUTME: explained inline, once, with no toast.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GitHubError } from "../../core/github/types";
import { SettingsScreen } from "./SettingsScreen";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

it("explains a rejected token inline", async () => {
  const { store } = renderWithStore(
    <SettingsScreen
      onTokenSaved={() => Promise.reject(new GitHubError("auth", "401 Bad credentials"))}
    />,
    { withSync: false },
  );
  act(() => store.getState().openSettings());
  fireEvent.change(screen.getByLabelText("GitHub token"), { target: { value: "github_pat_bad" } });
  fireEvent.click(screen.getByRole("button", { name: "Save token" }));
  expect((await screen.findByRole("alert")).textContent).toContain("GitHub rejected that token");
  expect(store.getState().toasts).toEqual([]);
});
