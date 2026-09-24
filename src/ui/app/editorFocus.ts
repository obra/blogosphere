// ABOUTME: Moves keyboard focus into the editor body — whichever surface is
// ABOUTME: mounted (Write mode's ProseMirror or Markdown/HTML's CodeMirror).

function focusEditorSurface(): void {
  document.querySelector<HTMLElement>(".milkdown .ProseMirror, .cm-content")?.focus();
}

export { focusEditorSurface };
