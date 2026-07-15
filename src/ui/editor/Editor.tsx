// ABOUTME: The mode-switching controlled editor component (matches EditorProps in
// ABOUTME: src/ui/types.ts exactly) — WYSIWYG (Crepe) or source (CodeMirror), one markdown
// ABOUTME: string as the document of record, with a formatting toolbar wired to whichever
// ABOUTME: mode is active.
import { useRef } from "react";
import type { EditorProps } from "../types";
import { CrepeEditor } from "./CrepeEditor";
import type { EditorHandle } from "./markdown-utils";
import { SourceEditor } from "./SourceEditor";
import { Toolbar } from "./Toolbar";

const EDITOR_PANE_STYLE = { flex: "1", minHeight: 0, overflow: "hidden" } as const;
const ROOT_STYLE = { display: "flex", flexDirection: "column", height: "100%" } as const;

/**
 * Mode-switching is a full unmount/remount of the child editor: CrepeEditor
 * and SourceEditor are different component types at the same tree position,
 * so React tears down one and mounts the other. Each independently loads
 * `value` as its initial content on mount, and neither calls `onChange` just
 * from loading/parsing — only from an actual edit — so toggling modes
 * without editing anything round-trips byte-for-byte.
 *
 * Milkdown's parser/serializer (remark, under the hood) is not the identity
 * function, though: once an edit *does* happen in WYSIWYG mode, the whole
 * document gets re-serialized and picks up these normalizations (each
 * verified against a real Milkdown editor — see normalization-survey.test.ts):
 *
 *  - setext headings (`Title\n===`) -> ATX (`# Title`)
 *  - bullet list markers all become `*`, and every list becomes "loose"
 *    (blank line between items) even if it started tight
 *  - ordered-list delimiter `)` -> `.`
 *  - thematic breaks (`---`, `___`, `***`) -> `***`
 *  - fenced code using `~~~` -> ``` ``` ```, and indented code blocks -> fenced
 *  - hard breaks via trailing spaces -> trailing backslash
 *  - reference-style links (`[t][r]` + a `[r]: url` definition) -> inlined
 *    (`[t](url)`), dropping the separate definition line
 *  - 3+ consecutive blank lines collapse to exactly 1
 *  - a missing trailing newline at EOF is added
 *  - GFM table separator rows (`| --- |`) shrink to minimal (`| - |`)
 *
 * None of these lose information — content and meaning survive — but the
 * underlying bytes change, so a diff of a file saved after a WYSIWYG-mode
 * edit can show whitespace/marker churn even in blocks near, but not part of,
 * the actual edit (remark reserializes the whole document, not just the
 * edited node). Source mode never does this: raw text in, raw text out.
 *
 * Nunjucks shortcodes (`{% image %}`, `{% dotfile %}`) and raw HTML have no
 * meaning to commonmark, so they parse as plain text and survive both modes
 * literally — see shortcode-roundtrip.test.ts, including two narrow known
 * escaping edge cases documented and tested there (markdown-special
 * characters, and certain letter-then-period sequences, inside a
 * shortcode's own argument text — this project's own asset-naming
 * convention doesn't hit either one).
 */
export function Editor(props: EditorProps) {
  const handleRef = useRef<EditorHandle | null>(null);
  const isReadOnly = props.readOnly ?? false;

  return (
    <div style={ROOT_STYLE}>
      <Toolbar handle={handleRef} onImage={props.onImage} readOnly={isReadOnly} />
      <div style={EDITOR_PANE_STYLE}>
        {props.mode === "wysiwyg" ? (
          <CrepeEditor
            ref={handleRef}
            value={props.value}
            onChange={props.onChange}
            resolveImage={props.resolveImage}
            onImage={props.onImage}
            readOnly={isReadOnly}
          />
        ) : (
          <SourceEditor
            ref={handleRef}
            value={props.value}
            onChange={props.onChange}
            onImage={props.onImage}
            readOnly={isReadOnly}
          />
        )}
      </div>
    </div>
  );
}
