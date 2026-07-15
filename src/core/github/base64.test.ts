// ABOUTME: Unit and property tests for the base64 codec — known vectors,
// ABOUTME: newline-robust decoding, and round-trip correctness at any size.

import process from "node:process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "./base64";

const FOUR_CHAR_CHUNK = /.{4}/g;
const MAX_FUZZ_BYTE_LENGTH = 20_000;

// See docs/tooling.md's FUZZ_RUNS convention.
const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;

/**
 * The RFC 4648 worked example for "hello world". Not a credential — the
 * noSecrets entropy heuristic can't distinguish a well-known encoding
 * fixture from a real token (the rule is off for test files entirely; see
 * biome.json / docs/tooling.md).
 */
const HELLO_WORLD_BASE64 = "aGVsbG8gd29ybGQ=";

/** Re-wraps a flat base64 string at 4-char boundaries, as GitHub wraps blob content. */
function wrapWithNewlines(base64: string): string {
  return `${(base64.match(FOUR_CHAR_CHUNK) ?? []).join("\n")}\n`;
}

describe("encoding bytes to base64", () => {
  it("encodes known byte vectors to their standard base64 form", () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
    expect(bytesToBase64(new TextEncoder().encode("M"))).toBe("TQ==");
    expect(bytesToBase64(new TextEncoder().encode("Ma"))).toBe("TWE=");
    expect(bytesToBase64(new TextEncoder().encode("Man"))).toBe("TWFu");
    expect(bytesToBase64(new TextEncoder().encode("hello world"))).toBe(HELLO_WORLD_BASE64);
  });
});

describe("decoding base64 to bytes", () => {
  it("decodes known base64 vectors to their bytes", () => {
    expect(base64ToBytes("")).toEqual(new Uint8Array([]));
    expect(base64ToBytes("TQ==")).toEqual(new TextEncoder().encode("M"));
    expect(base64ToBytes("TWE=")).toEqual(new TextEncoder().encode("Ma"));
    expect(base64ToBytes("TWFu")).toEqual(new TextEncoder().encode("Man"));
    expect(base64ToBytes(HELLO_WORLD_BASE64)).toEqual(new TextEncoder().encode("hello world"));
  });

  it("decodes robustly through newline wrapping, as GitHub wraps blob content", () => {
    expect(base64ToBytes(wrapWithNewlines(HELLO_WORLD_BASE64))).toEqual(
      new TextEncoder().encode("hello world"),
    );
  });

  it("decodes robustly through CRLF line wrapping too", () => {
    const wrapped = wrapWithNewlines(HELLO_WORLD_BASE64).replace(/\n/g, "\r\n");
    expect(base64ToBytes(wrapped)).toEqual(new TextEncoder().encode("hello world"));
  });

  it("throws on a genuinely invalid base64 character", () => {
    expect(() => base64ToBytes("!!!!")).toThrow();
  });
});

describe("base64 codec properties", () => {
  it("property: base64 round-trips arbitrary byte buffers", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: MAX_FUZZ_BYTE_LENGTH }), (bytes) => {
        expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("property: newline-wrapped base64 decodes identically to unwrapped", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: MAX_FUZZ_BYTE_LENGTH }), (bytes) => {
        const flat = bytesToBase64(bytes);
        const wrapped = flat.replace(FOUR_CHAR_CHUNK, "$&\n");
        expect(base64ToBytes(wrapped)).toEqual(base64ToBytes(flat));
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
