// @vitest-environment jsdom
// ABOUTME: The Settings sections (shared by the modal and the macOS Settings
// ABOUTME: window): token save with its error shown inline, and templates.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CommitTemplatesSection, ConnectionSection } from "./SettingsSections";
import { DEFAULT_COMMIT_TEMPLATES } from "./state.types";

afterEach(cleanup);

function saveTokenWith(token: string) {
  fireEvent.change(screen.getByLabelText("GitHub token"), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Save token" }));
}

it("shows why a token wasn't saved, right there, and keeps what was typed", async () => {
  render(
    <ConnectionSection
      connected={false}
      repoLabel="obra/blog#main"
      saveToken={() => Promise.resolve("GitHub rejected that token.")}
    />,
  );
  saveTokenWith("github_pat_bad");
  expect((await screen.findByRole("alert")).textContent).toBe("GitHub rejected that token.");
  expect(screen.getByLabelText("GitHub token")).toHaveProperty("value", "github_pat_bad");
});

it("clears the field once the token is saved", async () => {
  const saveToken = vi.fn(() => Promise.resolve(null));
  render(<ConnectionSection connected={false} repoLabel="obra/blog#main" saveToken={saveToken} />);
  saveTokenWith("github_pat_good");
  await waitFor(() => expect(screen.getByLabelText("GitHub token")).toHaveProperty("value", ""));
  expect(saveToken).toHaveBeenCalledWith("github_pat_good");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("connected: names the repo and hides the token field until Replace token…", () => {
  render(<ConnectionSection connected={true} repoLabel="obra/blog#main" saveToken={vi.fn()} />);
  expect(screen.getByText("obra/blog#main")).not.toBeNull();
  expect(screen.queryByLabelText("GitHub token")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Replace token…" }));
  expect(screen.getByLabelText("GitHub token")).not.toBeNull();
});

it("saves the templates as edited, showing an error inline", async () => {
  const saveTemplates = vi.fn(() => Promise.resolve("Couldn't save the templates."));
  render(
    <CommitTemplatesSection templates={DEFAULT_COMMIT_TEMPLATES} saveTemplates={saveTemplates} />,
  );
  fireEvent.change(screen.getByLabelText("Edit"), { target: { value: "Edit {title}!" } });
  fireEvent.click(screen.getByRole("button", { name: "Save templates" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save the templates.");
  expect(saveTemplates).toHaveBeenCalledWith({
    ...DEFAULT_COMMIT_TEMPLATES,
    edit: "Edit {title}!",
  });
});
