// ABOUTME: Unit + property tests for the image-file helpers in markdown-utils.ts:
// ABOUTME: filterImageFiles, extensionForImageFile, bytesFromFile, resolveDisplaySrc.
import process from "node:process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bytesFromFile,
  extensionForImageFile,
  filterImageFiles,
  PLACEHOLDER_IMAGE_SRC,
  resolveDisplaySrc,
} from "./markdown-utils";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;
const MAX_FUZZ_STRING_LENGTH = 20;
const EXTENSION_PATTERN = /^[a-z0-9]+$/;
const SAMPLE_BYTES = [1, 2, 3, 255];

describe("filterImageFiles", () => {
  it("returns an empty array for null/undefined", () => {
    expect(filterImageFiles(null)).toEqual([]);
    expect(filterImageFiles(undefined)).toEqual([]);
  });

  it("keeps only image files, preserving order", () => {
    const image1 = new File(["a"], "one.png", { type: "image/png" });
    const doc = new File(["b"], "notes.pdf", { type: "application/pdf" });
    const image2 = new File(["c"], "two.jpg", { type: "image/jpeg" });
    const result = filterImageFiles([image1, doc, image2]);
    expect(result).toEqual([image1, image2]);
  });

  it("returns an empty array when nothing is an image", () => {
    const doc = new File(["b"], "notes.pdf", { type: "application/pdf" });
    expect(filterImageFiles([doc])).toEqual([]);
  });
});

describe("extensionForImageFile", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/gif", "gif"],
    ["image/webp", "webp"],
    ["image/heic", "heic"],
    ["image/svg+xml", "svg"],
  ])("maps %s to %s", (type, expected) => {
    expect(extensionForImageFile({ type, name: "pasted" })).toBe(expected);
  });

  it("is case-insensitive on the mime type", () => {
    expect(extensionForImageFile({ type: "IMAGE/PNG", name: "pasted" })).toBe("png");
  });

  it("falls back to the filename's own extension for an unknown mime type", () => {
    expect(extensionForImageFile({ type: "application/octet-stream", name: "photo.JPG" })).toBe(
      "jpg",
    );
  });

  it("falls back to png when neither mime nor filename give an extension", () => {
    expect(extensionForImageFile({ type: "application/octet-stream", name: "photo" })).toBe("png");
  });

  it("property: the result is always a short lowercase alphanumeric token", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: MAX_FUZZ_STRING_LENGTH }),
        fc.string({ maxLength: MAX_FUZZ_STRING_LENGTH }),
        (type, name) => EXTENSION_PATTERN.test(extensionForImageFile({ type, name })),
      ),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("bytesFromFile", () => {
  it("reads the exact bytes of a File", async () => {
    const file = new File([new Uint8Array(SAMPLE_BYTES)], "x.bin");
    const read = await bytesFromFile(file);
    expect(Array.from(read)).toEqual(SAMPLE_BYTES);
  });

  it("property: round-trips arbitrary text content through a Blob", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (text) => {
        const blob = new Blob([text], { type: "text/plain" });
        const bytes = await bytesFromFile(blob);
        return new TextDecoder().decode(bytes) === text;
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("resolveDisplaySrc", () => {
  it("returns the resolved URL when resolveImage succeeds", async () => {
    const displayUrl = "blob:resolved";
    const result = await resolveDisplaySrc(() => Promise.resolve(displayUrl), "/assets/x.png");
    expect(result).toBe(displayUrl);
  });

  it("falls back to the placeholder when resolveImage returns null", async () => {
    const result = await resolveDisplaySrc(() => Promise.resolve(null), "/assets/x.png");
    expect(result).toBe(PLACEHOLDER_IMAGE_SRC);
  });

  it("falls back to the placeholder when resolveImage rejects", async () => {
    const result = await resolveDisplaySrc(
      () => Promise.reject(new Error("offline")),
      "/assets/x.png",
    );
    expect(result).toBe(PLACEHOLDER_IMAGE_SRC);
  });

  it("property: always resolves to either the resolver's string or the placeholder, never throws", async () => {
    await fc.assert(
      fc.asyncProperty(fc.option(fc.string(), { nil: null }), async (resolved) => {
        const result = await resolveDisplaySrc(() => Promise.resolve(resolved), "/assets/x.png");
        return resolved === null ? result === PLACEHOLDER_IMAGE_SRC : result === resolved;
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
