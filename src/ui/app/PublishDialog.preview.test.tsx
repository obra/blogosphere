// @vitest-environment jsdom
// ABOUTME: Tests for PublishDialog's live URL preview line — date/slug URLs,
// ABOUTME: slugify normalization, and the kept-secret-link /private/ preview
// ABOUTME: (split from PublishDialog.test.tsx to stay under the per-file line limit).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishDialog } from "./PublishDialog";

afterEach(() => {
  cleanup();
});

const INVALID_SLUG_TEXT_RE = /not a valid slug/;

const BASE_PROPS = {
  today: "2026-07-15",
  opaqueId: null,
  path: "content/drafts/2026-02-01-a-draft.md",
  title: "A Draft",
};

describe("PublishDialog — live URL preview", () => {
  it("shows /YYYY/MM/DD/<slug>/ for the default date and slug", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("/2026/07/15/a-draft/")).not.toBeNull();
  });

  it("updates the preview as the slug field changes", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "renamed-post" } });

    expect(screen.getByText("/2026/07/15/renamed-post/")).not.toBeNull();
  });

  it("updates the preview as the date field changes", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Publish date"), { target: { value: "2026-08-01" } });

    expect(screen.getByText("/2026/08/01/a-draft/")).not.toBeNull();
  });

  it("hides the preview and shows a hint instead once the slug has invalid characters", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "not a valid slug" } });

    expect(screen.queryByText("/2026/07/15/a-draft/")).toBeNull();
    expect(screen.queryByText(INVALID_SLUG_TEXT_RE)).toBeNull();
  });

  it("previews the normalized URL when the typed slug would be collapsed by slugify", () => {
    // planPublish always slugifies the submitted slug, and slugify collapses
    // "--" — the preview must show the URL that will actually publish.
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "hello--world" } });

    expect(screen.getByText("/2026/07/15/hello-world/")).not.toBeNull();
    expect(screen.queryByText("/2026/07/15/hello--world/")).toBeNull();
  });

  it("previews /private/<id>/ once 'Keep secret link alive' is checked", () => {
    // permalinkFor gives opaqueId absolute priority, so keeping the secret
    // link means the live URL stays /private/<id>/ — not the date/slug URL.
    render(
      <PublishDialog {...BASE_PROPS} opaqueId="secret-id" onPublish={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("Keep secret link alive"));

    expect(screen.getByText("/private/secret-id/")).not.toBeNull();
    expect(screen.queryByText("/2026/07/15/a-draft/")).toBeNull();
  });

  it("shows the date/slug preview while the secret-link checkbox stays unchecked", () => {
    render(
      <PublishDialog {...BASE_PROPS} opaqueId="secret-id" onPublish={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText("/2026/07/15/a-draft/")).not.toBeNull();
    expect(screen.queryByText("/private/secret-id/")).toBeNull();
  });

  it("returns to the date/slug preview when the checkbox is unchecked again", () => {
    render(
      <PublishDialog {...BASE_PROPS} opaqueId="secret-id" onPublish={vi.fn()} onCancel={vi.fn()} />,
    );
    const checkbox = screen.getByLabelText("Keep secret link alive");

    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    expect(screen.getByText("/2026/07/15/a-draft/")).not.toBeNull();
  });

  it("keeps the invalid-slug hint over the /private/ preview so the disabled Publish stays explained", () => {
    render(
      <PublishDialog {...BASE_PROPS} opaqueId="secret-id" onPublish={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("Keep secret link alive"));
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "not valid" } });

    expect(screen.queryByText("/private/secret-id/")).toBeNull();
  });
});
