// @vitest-environment jsdom
// ABOUTME: Tests for the first-run ConnectScreen — token submit flow, error
// ABOUTME: display on rejected tokens, and the create-token link copy.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectScreen } from "./ConnectScreen";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(() => {
  cleanup();
});

function fillAndSubmit(token: string): void {
  fireEvent.change(screen.getByLabelText("GitHub token"), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Connect and sync" }));
}

it("saves the token and calls onTokenSaved on submit", async () => {
  const onTokenSaved = vi.fn(() => Promise.resolve());
  const { services } = renderWithStore(<ConnectScreen onTokenSaved={onTokenSaved} />, {
    seedEntries: [],
  });
  fillAndSubmit("github_pat_test123");
  await waitFor(() => expect(onTokenSaved).toHaveBeenCalledWith("github_pat_test123"));
  expect(await services.shell.keychainGet("github-token")).toBe("github_pat_test123");
});

it("shows a plain-language error when the token is rejected and re-enables the form", async () => {
  const onTokenSaved = vi.fn(() => Promise.reject(new Error("GitHubError: auth (401)")));
  renderWithStore(<ConnectScreen onTokenSaved={onTokenSaved} />, { seedEntries: [] });
  fillAndSubmit("github_pat_bad");
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("GitHub rejected that token");
  expect(screen.getByRole("button", { name: "Connect and sync" })).toHaveProperty(
    "disabled",
    false,
  );
});

it("copies the create-token URL through the injected clipboard", async () => {
  const writes: string[] = [];
  renderWithStore(<ConnectScreen onTokenSaved={undefined} />, {
    seedEntries: [],
    storeOverrides: {
      writeClipboardText: (text: string) => {
        writes.push(text);
        return Promise.resolve();
      },
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Copy the create-token link" }));
  await screen.findByText("Link copied");
  expect(writes).toEqual(["https://github.com/settings/personal-access-tokens/new"]);
});
