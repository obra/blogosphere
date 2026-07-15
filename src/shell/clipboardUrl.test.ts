// ABOUTME: Unit tests for the clipboard URL-gating predicate used by the desktop
// ABOUTME: "+ Link" prefill (pure regex logic, no Tauri involved).

import { describe, expect, it } from "vitest";
import { extractClipboardUrl } from "./clipboardUrl";

describe("extractClipboardUrl", () => {
  it("returns an http URL unchanged", () => {
    expect(extractClipboardUrl("http://example.com")).toBe("http://example.com");
  });

  it("returns an https URL unchanged", () => {
    const url = "https://example.com/post/1?x=1#frag";
    expect(extractClipboardUrl(url)).toBe(url);
  });

  it("trims leading/trailing spaces before matching and in the result", () => {
    expect(extractClipboardUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("trims leading/trailing newlines and tabs", () => {
    expect(extractClipboardUrl("\n\thttps://example.com\n")).toBe("https://example.com");
  });

  it("rejects an empty or whitespace-only clipboard", () => {
    expect(extractClipboardUrl("")).toBeNull();
    expect(extractClipboardUrl("   ")).toBeNull();
  });

  it("rejects garbage text", () => {
    expect(extractClipboardUrl("not a url")).toBeNull();
    expect(extractClipboardUrl("Hello, world!")).toBeNull();
  });

  it("rejects non-http(s) schemes", () => {
    expect(extractClipboardUrl("ftp://example.com")).toBeNull();
    expect(extractClipboardUrl("mailto:someone@example.com")).toBeNull();
    expect(extractClipboardUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects a scheme-less host", () => {
    expect(extractClipboardUrl("example.com")).toBeNull();
    expect(extractClipboardUrl("www.example.com/path")).toBeNull();
  });

  it("requires the URL at the very start of the trimmed text", () => {
    expect(extractClipboardUrl("check out https://example.com")).toBeNull();
  });

  it("matches the spec's ^https?:// literally, so an uppercase scheme is rejected", () => {
    expect(extractClipboardUrl("HTTPS://example.com")).toBeNull();
  });
});
