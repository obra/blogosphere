// ABOUTME: Tests for editorImageHandlers — the pasted-image naming shape
// ABOUTME: (spec's Images section: pasted-image-YYYYMMDD-HHMMSS) and the
// ABOUTME: onImage -> resolveImage round trip through ShellApi's asset cache.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeOnImage, makeResolveImage } from "./editorImageHandlers";
import { buildFakeServices } from "./testing/fakes";

const ENTRY_PATH = "content/drafts/2026-07-15-a.md";

describe("pasted-image naming", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T09:30:12.345Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("names the file pasted-image-YYYYMMDD-HHMMSS.ext, with a dash between date and time", async () => {
    const { services } = buildFakeServices();
    const onImage = makeOnImage(services, ENTRY_PATH);

    const ref = await onImage(new Uint8Array([1, 2, 3]), "png");

    expect(ref).toBe("/assets/2026/07/pasted-image-20260715-093012.png");
  });

  it("registers the outbox asset under a matching content/assets/YYYY/MM repo path", async () => {
    const { services } = buildFakeServices();
    const onImage = makeOnImage(services, ENTRY_PATH);

    await onImage(new Uint8Array([9]), "jpg");

    const assets = await services.store.listAssetsFor([ENTRY_PATH]);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.repoPath).toBe("content/assets/2026/07/pasted-image-20260715-093012.jpg");
    expect(assets[0]?.entryPath).toBe(ENTRY_PATH);
  });

  it("keeps the folder and filename dates in agreement across a UTC-vs-local midnight boundary", async () => {
    // 23:30 local in a UTC-8 zone on 2026-01-01 is already 2026-01-02 in UTC;
    // folder and filename must agree with each other (both UTC), not split
    // across two different months/years.
    vi.setSystemTime(new Date("2026-01-02T07:30:00.000Z"));
    const { services } = buildFakeServices();
    const onImage = makeOnImage(services, ENTRY_PATH);

    const ref = await onImage(new Uint8Array([1]), "png");

    expect(ref).toBe("/assets/2026/01/pasted-image-20260102-073000.png");
  });
});

describe("onImage -> resolveImage round trip", () => {
  it("resolves a just-pasted image back to a display URL via the same ref onImage returned", async () => {
    const { services } = buildFakeServices();
    const onImage = makeOnImage(services, ENTRY_PATH);
    const resolveImage = makeResolveImage(services, ENTRY_PATH);

    const ref = await onImage(new Uint8Array([1, 2, 3]), "png");
    expect(ref).not.toBeNull();

    const url = await (ref === null ? Promise.resolve(null) : resolveImage(ref));

    expect(url).not.toBeNull();
  });

  it("resolveImage returns null for a ref that was never cached (miss -> caller shows a placeholder)", async () => {
    const { services } = buildFakeServices();
    const resolveImage = makeResolveImage(services, ENTRY_PATH);

    expect(await resolveImage("/assets/2026/07/never-pasted.png")).toBeNull();
  });
});

describe("resolveImage fetch-on-miss", () => {
  const Bytes = new Uint8Array([137, 80, 78, 71]);

  function servicesWithIndexedBlob(sha: string) {
    const fake = buildFakeServices();
    const getBlob = vi.fn((requested: string) =>
      requested === sha ? Promise.resolve(Bytes) : Promise.reject(new Error("unknown sha")),
    );
    const services = {
      ...fake.services,
      github: { getBlob } as unknown as NonNullable<typeof fake.services.github>,
    };
    return { services, getBlob, store: fake.services.store };
  }

  it("fetches an uncached /assets/ image by indexed sha, caches it, and returns a URL", async () => {
    const repoPath = "content/assets/2026/07/from-repo.png";
    const { services, getBlob, store } = servicesWithIndexedBlob("sha-1");
    await store.setMeta("assetsIndex", JSON.stringify([{ path: repoPath, sha: "sha-1" }]));
    const resolveImage = makeResolveImage(services, ENTRY_PATH);

    const url = await resolveImage("/assets/2026/07/from-repo.png");
    expect(url).not.toBeNull();
    expect(getBlob).toHaveBeenCalledTimes(1);

    // Second resolve is a cache hit — no second fetch.
    expect(await resolveImage("/assets/2026/07/from-repo.png")).not.toBeNull();
    expect(getBlob).toHaveBeenCalledTimes(1);
  });

  it("resolves a relative co-located ref against the entry's own directory", async () => {
    const entry = "content/blog/2025/superpowers/index.md";
    const repoPath = "content/blog/2025/superpowers/setup.png";
    const { services, getBlob, store } = servicesWithIndexedBlob("sha-2");
    await store.setMeta("assetsIndex", JSON.stringify([{ path: repoPath, sha: "sha-2" }]));
    const resolveImage = makeResolveImage(services, entry);

    expect(await resolveImage("./setup.png")).not.toBeNull();
    expect(getBlob).toHaveBeenCalledWith("sha-2");
  });

  it("returns null (not a fetch) for remote refs and refs escaping content/", async () => {
    const { services, getBlob } = servicesWithIndexedBlob("sha-3");
    const resolveImage = makeResolveImage(services, ENTRY_PATH);

    expect(await resolveImage("https://example.com/pic.png")).toBeNull();
    expect(await resolveImage("../../../../etc/passwd")).toBeNull();
    expect(getBlob).not.toHaveBeenCalled();
  });

  it("concurrent resolves of the same uncached ref share one blob fetch", async () => {
    const repoPath = "content/assets/2026/07/shared.png";
    const { services, getBlob, store } = servicesWithIndexedBlob("sha-4");
    await store.setMeta("assetsIndex", JSON.stringify([{ path: repoPath, sha: "sha-4" }]));
    const resolveImage = makeResolveImage(services, ENTRY_PATH);

    const [a, b] = await Promise.all([
      resolveImage("/assets/2026/07/shared.png"),
      resolveImage("/assets/2026/07/shared.png"),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(getBlob).toHaveBeenCalledTimes(1);
  });
});
