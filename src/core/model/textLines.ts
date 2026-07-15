// ABOUTME: Low-level line-splitting helpers shared by front matter parsing and
// ABOUTME: surgical editing. Every chunk carries its own terminator so joins are lossless.

/**
 * Split text into chunks, one per line, where every chunk INCLUDES its own
 * trailing "\n" (except possibly the last chunk, if `text` doesn't end in a
 * newline). `chunks.join("") === text` always holds — this is what makes the
 * surgical editor safe: splicing this array and rejoining can never silently
 * drop or add a byte outside the spliced range.
 */
export function splitLinesKeepEnds(text: string): string[] {
  if (text === "") {
    return [];
  }
  const result: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      result.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) {
    result.push(text.slice(start));
  }
  return result;
}

/** Strip exactly one trailing "\n" from a line chunk, if present. */
export function stripEol(chunk: string): string {
  return chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk;
}
