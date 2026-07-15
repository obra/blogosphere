// ABOUTME: Test-only helper — parses markdown through a real Milkdown editor (the
// ABOUTME: same commonmark+gfm presets Crepe uses) and serializes it straight back,
// ABOUTME: without ever mounting Crepe's UI chrome, so it works under plain jsdom.
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";

/**
 * Round-trip `markdown` through Milkdown's real parser/serializer:
 * commonmark + gfm, no Crepe features (no image-block, tooltips, block-edit
 * handle, table resize, ...). Those extra features need `ResizeObserver`,
 * floating-ui positioning, and other layout APIs jsdom doesn't implement —
 * this doesn't, so it's the part of "does WYSIWYG mode preserve my markdown"
 * that's actually feasible to check without a real browser. A full `Crepe`
 * mount is separately smoke-tested in CrepeEditor.test.tsx.
 */
export async function headlessRoundTrip(markdown: string): Promise<string> {
  const root = document.createElement("div");
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm);
  await editor.create();
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}
