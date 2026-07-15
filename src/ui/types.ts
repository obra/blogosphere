// ABOUTME: Contract between UI layers — editor component props and the app store
// ABOUTME: shape, so the editor and app-shell teams can build independently.

export type EditorMode = "wysiwyg" | "source";

export interface EditorProps {
  /** Markdown document of record. Fully controlled component. */
  value: string;
  onChange(markdown: string): void;
  mode: EditorMode;
  /** Resolve an image ref (absolute /assets/... or relative) to a displayable URL.
   *  Returns null when unavailable (offline, not yet cached) -> placeholder. */
  resolveImage(src: string): Promise<string | null>;
  /** Called with pasted/dropped image bytes. Returns the markdown ref to insert
   *  (e.g. "/assets/2026/07/pasted-image-20260715-093012.png") or null to cancel. */
  onImage(bytes: Uint8Array, suggestedExt: string): Promise<string | null>;
  readOnly?: boolean;
}

/** Sections shown in the sidebar, in order. */
export const SECTIONS = ["drafts", "posts", "links", "releases"] as const;
export type Section = (typeof SECTIONS)[number];
