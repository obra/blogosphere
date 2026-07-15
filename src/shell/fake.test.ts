// ABOUTME: Behavioral tests for the in-memory fake ShellApi — every contract method,
// ABOUTME: plus the seedable share inbox and settable clipboard test-only hooks.

import { describe, expect, it } from "vitest";
import { createFakeShell } from "./fake";
import type { SharePayload } from "./types";

function makePayload(overrides: Partial<SharePayload> = {}): SharePayload {
  return {
    id: "share-1",
    url: "https://example.com",
    title: "Example",
    text: null,
    receivedAt: 1_700_000_000_000,
    ...overrides,
  };
}

const ROUND_TRIP_BYTES = new Uint8Array([1, 2, 3, 4]);
const REPLACEMENT_BYTES = new Uint8Array([5, 6]);
const ORIGINAL_BYTES = new Uint8Array([9, 9, 9]);
const OVERWRITTEN_BYTE = 42;

describe("createFakeShell: platform", () => {
  it("defaults platform to web", () => {
    expect(createFakeShell().platform()).toBe("web");
  });

  it("honors a platform override, for tests that need to simulate mobile", () => {
    expect(createFakeShell({ platform: "ios" }).platform()).toBe("ios");
    expect(createFakeShell({ platform: "android" }).platform()).toBe("android");
    expect(createFakeShell({ platform: "macos" }).platform()).toBe("macos");
  });
});

describe("createFakeShell: keychain", () => {
  it("returns null for a key that was never set", async () => {
    const shell = createFakeShell();
    await expect(shell.keychainGet("github_pat")).resolves.toBeNull();
  });

  it("round-trips a value through set then get", async () => {
    const shell = createFakeShell();
    await shell.keychainSet("github_pat", "ghp_secret");
    await expect(shell.keychainGet("github_pat")).resolves.toBe("ghp_secret");
  });

  it("set overwrites an existing value", async () => {
    const shell = createFakeShell();
    await shell.keychainSet("github_pat", "first");
    await shell.keychainSet("github_pat", "second");
    await expect(shell.keychainGet("github_pat")).resolves.toBe("second");
  });

  it("delete removes the value and is idempotent for a missing key", async () => {
    const shell = createFakeShell();
    await shell.keychainSet("github_pat", "ghp_secret");

    await shell.keychainDelete("github_pat");
    await expect(shell.keychainGet("github_pat")).resolves.toBeNull();

    await expect(shell.keychainDelete("github_pat")).resolves.toBeUndefined();
  });

  it("keeps different keys independent", async () => {
    const shell = createFakeShell();
    await shell.keychainSet("a", "1");
    await shell.keychainSet("b", "2");
    await expect(shell.keychainGet("a")).resolves.toBe("1");
    await expect(shell.keychainGet("b")).resolves.toBe("2");
  });
});

describe("createFakeShell: share inbox seeding", () => {
  it("starts empty by default", async () => {
    const shell = createFakeShell();
    await expect(shell.shareInboxList()).resolves.toEqual([]);
  });

  it("can be pre-seeded via options", async () => {
    const payload = makePayload();
    const shell = createFakeShell({ shareInbox: [payload] });
    await expect(shell.shareInboxList()).resolves.toEqual([payload]);
  });

  it("seedShareInbox appends payloads as if the OS delivered them", async () => {
    const shell = createFakeShell();
    const a = makePayload({ id: "a" });
    const b = makePayload({ id: "b" });

    shell.seedShareInbox(a);
    await expect(shell.shareInboxList()).resolves.toEqual([a]);

    shell.seedShareInbox(b);
    await expect(shell.shareInboxList()).resolves.toEqual([a, b]);
  });

  it("seedShareInbox accepts multiple payloads in one call", async () => {
    const shell = createFakeShell();
    const a = makePayload({ id: "a" });
    const b = makePayload({ id: "b" });
    shell.seedShareInbox(a, b);
    await expect(shell.shareInboxList()).resolves.toEqual([a, b]);
  });

  it("shareInboxList returns a snapshot, not a live reference", async () => {
    const shell = createFakeShell({ shareInbox: [makePayload({ id: "a" })] });
    const first = await shell.shareInboxList();
    await shell.shareInboxAck("a");
    const second = await shell.shareInboxList();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });
});

describe("createFakeShell: share inbox ack", () => {
  it("removes only the matching payload", async () => {
    const a = makePayload({ id: "a" });
    const b = makePayload({ id: "b" });
    const shell = createFakeShell({ shareInbox: [a, b] });

    await shell.shareInboxAck("a");

    await expect(shell.shareInboxList()).resolves.toEqual([b]);
  });

  it("is a no-op, not an error, for an unknown id", async () => {
    const a = makePayload({ id: "a" });
    const shell = createFakeShell({ shareInbox: [a] });

    await expect(shell.shareInboxAck("does-not-exist")).resolves.toBeUndefined();
    await expect(shell.shareInboxList()).resolves.toEqual([a]);
  });
});

describe("createFakeShell: asset cache", () => {
  it("assetPathFor returns null for an asset that was never written", async () => {
    const shell = createFakeShell();
    await expect(shell.assetPathFor("content/assets/2026/07/a.png")).resolves.toBeNull();
  });

  it("assetWrite then assetPathFor/assetRead round-trip the bytes", async () => {
    const shell = createFakeShell();
    const repoPath = "content/assets/2026/07/a.png";

    const localPath = await shell.assetWrite(repoPath, ROUND_TRIP_BYTES);

    await expect(shell.assetPathFor(repoPath)).resolves.toBe(localPath);
    await expect(shell.assetRead(localPath)).resolves.toEqual(ROUND_TRIP_BYTES);
  });

  it("assetWrite overwrites bytes previously written at the same repoPath", async () => {
    const shell = createFakeShell();
    const repoPath = "content/assets/2026/07/a.png";
    const localPath = await shell.assetWrite(repoPath, ROUND_TRIP_BYTES);
    await shell.assetWrite(repoPath, REPLACEMENT_BYTES);

    await expect(shell.assetRead(localPath)).resolves.toEqual(REPLACEMENT_BYTES);
  });

  it("assetRead rejects for a path that was never written", async () => {
    const shell = createFakeShell();
    await expect(shell.assetRead("memory://asset/nope.png")).rejects.toThrow();
  });

  it("assetRead rejects for a localPath this shell did not mint", async () => {
    const shell = createFakeShell();
    await expect(shell.assetRead("/not/a/fake/path.png")).rejects.toThrow();
  });

  it("assetDisplayUrl is a pure, deterministic function of localPath", () => {
    const shell = createFakeShell();
    const localPath = "memory://asset/content/assets/a.png";
    expect(shell.assetDisplayUrl(localPath)).toBe(shell.assetDisplayUrl(localPath));
    expect(shell.assetDisplayUrl(localPath)).not.toBe(
      shell.assetDisplayUrl("memory://asset/b.png"),
    );
  });
});

describe("createFakeShell: asset cache buffer isolation", () => {
  it("does not alias the caller's buffer after assetWrite returns", async () => {
    const shell = createFakeShell();
    const bytes = ORIGINAL_BYTES.slice();
    const localPath = await shell.assetWrite("content/assets/x.png", bytes);

    bytes[0] = OVERWRITTEN_BYTE; // mutate the caller's array after handing it off

    await expect(shell.assetRead(localPath)).resolves.toEqual(ORIGINAL_BYTES);
  });

  it("does not alias the buffer returned by assetRead", async () => {
    const shell = createFakeShell();
    const localPath = await shell.assetWrite("content/assets/y.png", ORIGINAL_BYTES.slice());

    const read = await shell.assetRead(localPath);
    read[0] = OVERWRITTEN_BYTE; // mutate the buffer the fake handed back

    await expect(shell.assetRead(localPath)).resolves.toEqual(ORIGINAL_BYTES);
  });
});

describe("createFakeShell: clipboard", () => {
  it("defaults to an empty clipboard, so clipboardReadUrl is null", async () => {
    const shell = createFakeShell();
    await expect(shell.clipboardReadUrl()).resolves.toBeNull();
  });

  it("honors an initial clipboardText option", async () => {
    const shell = createFakeShell({ clipboardText: "https://example.com" });
    await expect(shell.clipboardReadUrl()).resolves.toBe("https://example.com");
  });

  it("setClipboardText updates what clipboardReadUrl reports", async () => {
    const shell = createFakeShell();

    shell.setClipboardText("not a url");
    await expect(shell.clipboardReadUrl()).resolves.toBeNull();

    shell.setClipboardText("  https://example.com/x  ");
    await expect(shell.clipboardReadUrl()).resolves.toBe("https://example.com/x");
  });
});
