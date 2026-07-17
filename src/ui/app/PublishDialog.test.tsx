// @vitest-environment jsdom
// ABOUTME: Tests for PublishDialog — slug defaulting (filename vs. title-derived
// ABOUTME: fallback for untitled scaffolds), slug validation gating Publish, and
// ABOUTME: the pre-existing date/keepOpaqueId behavior. The live URL preview is
// ABOUTME: covered separately in PublishDialog.preview.test.tsx (per-file line limit).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishDialog } from "./PublishDialog";

afterEach(() => {
  cleanup();
});

const BASE_PROPS = {
  today: "2026-07-15",
  opaqueId: null,
  path: "content/drafts/2026-02-01-a-draft.md",
  title: "A Draft",
};

describe("PublishDialog — slug default", () => {
  it("seeds the slug field from the current filename's slug", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("Slug")).toHaveProperty("value", "a-draft");
  });

  it("falls back to a title-derived slug when the filename slug is 'untitled'", () => {
    render(
      <PublishDialog
        {...BASE_PROPS}
        path="content/drafts/2026-02-01-untitled.md"
        title="My Great Idea"
        onPublish={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Slug")).toHaveProperty("value", "My-Great-Idea");
  });

  it("treats 'untitled-2' (a second same-day scaffold) as untitled-like too", () => {
    render(
      <PublishDialog
        {...BASE_PROPS}
        path="content/drafts/2026-02-01-untitled-2.md"
        title="My Great Idea"
        onPublish={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Slug")).toHaveProperty("value", "My-Great-Idea");
  });

  it("falls back to slugify's own 'untitled' when both the filename and title are empty", () => {
    render(
      <PublishDialog
        {...BASE_PROPS}
        path="content/drafts/2026-02-01-untitled.md"
        title={null}
        onPublish={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Slug")).toHaveProperty("value", "untitled");
  });

  it("seeds the slug from the filename even when the shape isn't date-prefixed or year-nested", () => {
    // Regression: pathParts() returns null for this managed-but-uncanonical
    // shape, and the fallback used to swap in a title-derived slug — silently
    // renaming a real on-disk entry the user only opened to fix its date.
    render(
      <PublishDialog
        {...BASE_PROPS}
        path="content/releases/some-real-notes.md"
        title="A Completely Different Title"
        onPublish={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Slug")).toHaveProperty("value", "some-real-notes");
  });
});

describe("PublishDialog — slug validation gates Publish", () => {
  it("disables Publish once the slug is cleared to empty", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "" } });

    expect(screen.getByRole("button", { name: "Publish" })).toHaveProperty("disabled", true);
  });

  it("disables Publish when the slug contains a space", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "has a space" } });

    expect(screen.getByRole("button", { name: "Publish" })).toHaveProperty("disabled", true);
  });

  it("disables Publish when the slug contains a slash", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "has/a/slash" } });

    expect(screen.getByRole("button", { name: "Publish" })).toHaveProperty("disabled", true);
  });

  it("re-enables Publish once an invalid slug is corrected", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "bad slug" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "good-slug" } });

    expect(screen.getByRole("button", { name: "Publish" })).toHaveProperty("disabled", false);
  });

  it("keeps Publish disabled when the date is cleared, independent of slug validity", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Publish date"), { target: { value: "" } });

    expect(screen.getByRole("button", { name: "Publish" })).toHaveProperty("disabled", true);
  });
});

describe("PublishDialog — submit payload", () => {
  it("calls onPublish with the edited date and slug", () => {
    const onPublish = vi.fn();
    render(<PublishDialog {...BASE_PROPS} onPublish={onPublish} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Publish date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "renamed-post" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(onPublish).toHaveBeenCalledWith({ date: "2026-08-01", slug: "renamed-post" });
  });

  it("submits the normalized slug, so the published path matches the preview", () => {
    const onPublish = vi.fn();
    render(<PublishDialog {...BASE_PROPS} onPublish={onPublish} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "hello--world" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(onPublish).toHaveBeenCalledWith({ date: "2026-07-15", slug: "hello-world" });
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("PublishDialog — keepOpaqueId behavior is preserved", () => {
  it("does not show the keep-secret-link checkbox when there is no opaqueId", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByLabelText("Keep secret link alive")).toBeNull();
  });

  it("omits keepOpaqueId from the submit payload when there is no opaqueId", () => {
    const onPublish = vi.fn();
    render(<PublishDialog {...BASE_PROPS} onPublish={onPublish} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(onPublish).toHaveBeenCalledWith(
      expect.not.objectContaining({ keepOpaqueId: expect.anything() }),
    );
  });

  it("shows the checkbox, unchecked by default, when the entry has an opaqueId", () => {
    render(
      <PublishDialog {...BASE_PROPS} opaqueId="secret-id" onPublish={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByLabelText("Keep secret link alive")).toHaveProperty("checked", false);
  });

  it("includes keepOpaqueId:true in the submit payload once checked", () => {
    const onPublish = vi.fn();
    render(
      <PublishDialog
        {...BASE_PROPS}
        opaqueId="secret-id"
        onPublish={onPublish}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Keep secret link alive"));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ keepOpaqueId: true }));
  });
});

describe("PublishDialog — date field", () => {
  it("defaults the date field to the injected today prop", () => {
    render(<PublishDialog {...BASE_PROPS} onPublish={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("Publish date")).toHaveProperty("value", "2026-07-15");
  });
});
