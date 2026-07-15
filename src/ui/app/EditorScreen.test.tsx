// @vitest-environment jsdom
// ABOUTME: Tests for EditorScreen, focused on the publish dialog flow: open,
// ABOUTME: date default, keepOpaqueId visibility, submit, and cancel.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EditorScreen } from "./EditorScreen";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

afterEach(() => {
  cleanup();
});

async function renderEditorFor(record: ReturnType<typeof makeEntry>) {
  const fake = buildFakeServices({ seedEntries: [record] });
  const store = createAppStore(fake.services, { now: () => Date.parse("2026-07-15T09:00:00Z") });
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <EditorScreen />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await store.getState().refresh();
    store.getState().select(record.path);
  });
  return { store, ...fake };
}

it("shows the empty state when nothing is selected", () => {
  const fake = buildFakeServices();
  const store = createAppStore(fake.services);
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <EditorScreen />
      </AppStoreProvider>
    </ServicesProvider>,
  );

  expect(screen.getByText("Select an entry, or start a new one.")).not.toBeNull();
});

it("Publish opens a dialog defaulting the date to today", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));

  expect(screen.getByLabelText("Publish date")).toHaveProperty("value", "2026-07-15");
});

it("does not show the keep-secret-link checkbox when there is no opaqueId", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));

  expect(screen.queryByLabelText("Keep secret link alive")).toBeNull();
});

it("shows the keep-secret-link checkbox when the entry has an opaqueId", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    opaqueId: "secret-id",
  });
  await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));

  expect(screen.getByLabelText("Keep secret link alive")).not.toBeNull();
});

it("submitting Publish calls publishDraft with the chosen date and keepOpaqueId, then closes", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    opaqueId: "secret-id",
  });
  const { store, services } = await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));
  fireEvent.change(screen.getByLabelText("Publish date"), { target: { value: "2026-08-01" } });
  fireEvent.click(screen.getByLabelText("Keep secret link alive"));
  const dialog = screen.getByRole("dialog", { name: "Publish" });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    await Promise.resolve();
  });

  expect(screen.queryByLabelText("Publish date")).toBeNull();
  const published = await services.store.getEntry("content/blog/2026/2026-08-01-a.md");
  expect(published?.opaqueId).toBe("secret-id");
  expect(store.getState().toasts.some((t) => t.tone === "success")).toBe(true);
});

it("Cancel closes the publish dialog without publishing", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft);

  fireEvent.click(screen.getByText("Publish"));
  fireEvent.click(screen.getByText("Cancel"));

  expect(screen.queryByLabelText("Publish date")).toBeNull();
});
