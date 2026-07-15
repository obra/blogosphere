// @vitest-environment jsdom
// ABOUTME: Tests for NewLinkDialog's submit flow — specifically that a
// ABOUTME: failed newLink() leaves the dialog open with input intact,
// ABOUTME: rather than silently closing on a link that was never created.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NewLinkDialog } from "./NewLinkDialog";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

afterEach(() => {
  cleanup();
});

it("closes and clears the form once newLink succeeds", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);
  render(
    <ServicesProvider services={services}>
      <AppStoreProvider store={store}>
        <NewLinkDialog fetchTitle={null} />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  act(() => {
    store.getState().openNewLinkDialog();
  });

  fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://example.com" } });
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Cool Article" } });
  await act(async () => {
    fireEvent.click(screen.getByText("Add link"));
    await Promise.resolve();
  });

  expect(store.getState().newLinkDialogOpen).toBe(false);
});

it("stays open with the user's input intact when newLink fails", async () => {
  const { services } = buildFakeServices();
  const originalUpsert = services.store.upsertEntry.bind(services.store);
  services.store.upsertEntry = () => Promise.reject(new Error("disk full (simulated)"));
  const store = createAppStore(services);
  render(
    <ServicesProvider services={services}>
      <AppStoreProvider store={store}>
        <NewLinkDialog fetchTitle={null} />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  act(() => {
    store.getState().openNewLinkDialog();
  });

  fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://example.com" } });
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Cool Article" } });
  await act(async () => {
    fireEvent.click(screen.getByText("Add link"));
    await Promise.resolve();
  });

  expect(store.getState().newLinkDialogOpen).toBe(true);
  expect((screen.getByLabelText("URL") as HTMLInputElement).value).toBe("https://example.com");
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Cool Article");
  expect(store.getState().toasts.some((toast) => toast.tone === "error")).toBe(true);

  // Restore so nothing else in this test leaks a rejecting upsertEntry.
  services.store.upsertEntry = originalUpsert;
});

it("marks a clipboard-prefilled URL as such, and clears the mark once the user edits it", async () => {
  const { services } = buildFakeServices({
    shellOptions: { clipboardUrl: "https://example.com/clipboard-link" },
  });
  const store = createAppStore(services);
  render(
    <ServicesProvider services={services}>
      <AppStoreProvider store={store}>
        <NewLinkDialog fetchTitle={null} />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    store.getState().openNewLinkDialog();
    await Promise.resolve();
  });

  expect((screen.getByLabelText("URL") as HTMLInputElement).value).toBe(
    "https://example.com/clipboard-link",
  );
  expect(screen.getByText("Pasted from your clipboard")).not.toBeNull();

  fireEvent.change(screen.getByLabelText("URL"), {
    target: { value: "https://example.com/typed-instead" },
  });

  expect(screen.queryByText("Pasted from your clipboard")).toBeNull();
});

it("shows no clipboard mark when the URL is typed directly (nothing on the clipboard)", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);
  render(
    <ServicesProvider services={services}>
      <AppStoreProvider store={store}>
        <NewLinkDialog fetchTitle={null} />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    store.getState().openNewLinkDialog();
    await Promise.resolve();
  });

  fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://example.com" } });

  expect(screen.queryByText("Pasted from your clipboard")).toBeNull();
});
