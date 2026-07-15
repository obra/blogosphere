// ABOUTME: Reads the seven modeled front-matter fields out of a js-yaml parsed
// ABOUTME: document, defaulting safely on missing/malformed values, plus unknownKeys.

/** The front matter keys the client understands. Anything else is "unknown". */
export const KNOWN_FIELD_KEYS: ReadonlySet<string> = new Set([
  "title",
  "date",
  "tags",
  "draft",
  "opaqueId",
  "url",
  "type",
]);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Block literal scalars (`key: |`) parse via js-yaml with a single trailing
 * "\n" (YAML's default "clip" chomping). That's an implementation detail of
 * how the author chose to write the value, not part of its logical content,
 * so strip exactly one trailing newline when exposing it as a field.
 */
export function cleanScalar(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

export function stringField(doc: Record<string, unknown>, key: string): string | null {
  const value = doc[key];
  return typeof value === "string" ? cleanScalar(value) : null;
}

export function boolField(doc: Record<string, unknown>, key: string): boolean {
  const value = doc[key];
  return typeof value === "boolean" ? value : false;
}

export function arrayField(doc: Record<string, unknown>, key: string): string[] {
  const value = doc[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

/** Top-level keys present in the doc that aren't one of our modeled fields. */
export function unknownKeysOf(doc: Record<string, unknown>): string[] {
  return Object.keys(doc).filter((key) => !KNOWN_FIELD_KEYS.has(key));
}
