// ABOUTME: Base64 codec for Git blob transport, built on the platform's
// ABOUTME: btoa/atob — chunked so it never spreads bytes onto the call stack.

const CHUNK_SIZE = 8192;

/**
 * Encodes bytes as base64. Builds the intermediate "binary string" in fixed
 * chunks, one character at a time — never `String.fromCharCode(...bytes)`,
 * which spreads the whole buffer onto the call stack and overflows for large
 * inputs. Safe for buffers of any size.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];

  for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, bytes.length);
    let chunkBinary = "";
    for (let i = start; i < end; i += 1) {
      chunkBinary += String.fromCharCode(bytes[i] ?? 0);
    }
    chunks.push(chunkBinary);
  }

  return btoa(chunks.join(""));
}

/**
 * Decodes base64 to bytes. Robust to embedded newlines/whitespace — GitHub
 * wraps blob content at ~60 columns — by stripping whitespace before handing
 * the clean string to atob. (atob's forgiving-base64 algorithm already does
 * this per spec; stripping explicitly here keeps that guarantee visible and
 * doesn't depend on the reader knowing it.) Genuinely invalid characters
 * still reach atob unstripped, so malformed content still throws.
 */
export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/\s/g, "");
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
