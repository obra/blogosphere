// ABOUTME: Tests for fetchPageTitle's security-relevant guards — the
// ABOUTME: loopback/private-host blocklist and the byte-capped body read —
// ABOUTME: plus its ordinary title-extraction behavior, against a mocked
// ABOUTME: @tauri-apps/plugin-http so no real Tauri runtime is needed.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriFetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => tauriFetchMock(...args),
}));

// Imported after the mock is registered (vi.mock is hoisted above imports).
const { fetchPageTitle } = await import("./fetchTitle");

function htmlResponse(html: string, contentType = "text/html; charset=utf-8"): Response {
  return {
    ok: true,
    headers: { get: (name: string) => (name === "content-type" ? contentType : null) },
    text: () => Promise.resolve(html),
    body: null,
  } as unknown as Response;
}

function streamingHtmlResponse(html: string, contentType = "text/html"): Response {
  const bytes = new TextEncoder().encode(html);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Deliver in small chunks so a cap mid-stream is exercised, not just
      // a single big chunk.
      const chunkSize = 64;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  return {
    ok: true,
    headers: { get: (name: string) => (name === "content-type" ? contentType : null) },
    text: () => Promise.resolve(html),
    body: stream,
  } as unknown as Response;
}

beforeEach(() => {
  tauriFetchMock.mockReset();
});

describe("fetchPageTitle — loopback/private-host blocklist", () => {
  const disallowed = [
    "https://localhost/status",
    "https://127.0.0.1/status",
    "https://127.55.0.9/status",
    "https://0.0.0.0/",
    "https://192.168.1.1/admin",
    "https://10.0.0.5/x",
    "https://172.16.0.1/x",
    "https://172.31.255.255/x",
    "https://169.254.169.254/latest/meta-data/",
    "https://nas.local/admin",
    "https://[::1]/x",
    "https://[fe80::1]/x",
    "https://[fc00::1]/x",
  ];

  it.each(disallowed)("never calls the underlying fetch for %s", async (url) => {
    const result = await fetchPageTitle(url);
    expect(result).toBeNull();
    expect(tauriFetchMock).not.toHaveBeenCalled();
  });

  it("does not block an ordinary internet host with '.local'-like but distinct suffix", async () => {
    tauriFetchMock.mockResolvedValue(htmlResponse("<title>Fine</title>"));
    const result = await fetchPageTitle("https://notlocalatall.example.com/post");
    expect(result).toBe("Fine");
    expect(tauriFetchMock).toHaveBeenCalledTimes(1);
  });

  it("still fetches an ordinary public host", async () => {
    tauriFetchMock.mockResolvedValue(htmlResponse("<title>A Real Post</title>"));
    const result = await fetchPageTitle("https://example.com/post");
    expect(result).toBe("A Real Post");
    expect(tauriFetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves null (never throws) for an unparseable URL", async () => {
    await expect(fetchPageTitle("not a url")).resolves.toBeNull();
    expect(tauriFetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchPageTitle — capped body read", () => {
  it("extracts a title that appears within the byte cap", async () => {
    const html = `<html><head><title>Early Title</title></head><body>${"x".repeat(1000)}</body></html>`;
    tauriFetchMock.mockResolvedValue(streamingHtmlResponse(html));
    const result = await fetchPageTitle("https://example.com/post");
    expect(result).toBe("Early Title");
  });

  it("does not hang or crash on a response far larger than the cap, and does not read past it", async () => {
    // A title placed well past 256 KiB must not be found — proving the read
    // actually stopped, not just that extraction happened to work anyway.
    const filler = "x".repeat(300_000);
    const html = `<html><head></head><body>${filler}<title>Buried Title</title></body></html>`;
    tauriFetchMock.mockResolvedValue(streamingHtmlResponse(html));
    const result = await fetchPageTitle("https://example.com/post");
    expect(result).toBeNull();
  });

  it("falls back to a truncated text() read when the Response exposes no body stream", async () => {
    const filler = "x".repeat(300_000);
    const html = `<html><head></head><body>${filler}<title>Buried Title</title></body></html>`;
    tauriFetchMock.mockResolvedValue(htmlResponse(html));
    const result = await fetchPageTitle("https://example.com/post");
    expect(result).toBeNull();
  });
});

describe("fetchPageTitle — ordinary failure modes still resolve null", () => {
  it("returns null on a non-2xx status", async () => {
    tauriFetchMock.mockResolvedValue({
      ok: false,
      headers: { get: () => "text/html" },
      text: () => Promise.resolve(""),
      body: null,
    });
    expect(await fetchPageTitle("https://example.com/missing")).toBeNull();
  });

  it("returns null for a non-HTML content type", async () => {
    tauriFetchMock.mockResolvedValue(htmlResponse("{}", "application/json"));
    expect(await fetchPageTitle("https://example.com/data.json")).toBeNull();
  });

  it("returns null (never rejects) when the underlying fetch throws", async () => {
    tauriFetchMock.mockRejectedValue(new Error("network error"));
    await expect(fetchPageTitle("https://example.com/post")).resolves.toBeNull();
  });
});
