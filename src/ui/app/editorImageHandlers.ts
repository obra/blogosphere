// ABOUTME: Minimal EditorProps.resolveImage/onImage implementations — asset
// ABOUTME: cache read/write via ShellApi, outbox registration via StoreApi.
// ABOUTME: Images are outside this module's assigned spec sections; this is
// ABOUTME: a light, best-effort wiring the images-focused work can replace.
import type { Services } from "../../core/services";

const TIMESTAMP_PATTERN = /[^0-9]/g;
const CONTENT_PREFIX_PATTERN = /^content\//;
const ISO_DATE_DIGITS_LENGTH = 8; // YYYYMMDD
const ISO_DATETIME_DIGITS_LENGTH = 14; // YYYYMMDDHHMMSS

/**
 * repoPath for a pasted/dropped image, e.g.
 * "content/assets/2026/07/pasted-image-20260715-093012.png" (spec's Images
 * section: pasted-image-YYYYMMDD-HHMMSS). Folder and filename both derive
 * from the same UTC instant so they can never disagree near a
 * local-midnight boundary.
 */
function pastedImageRepoPath(now: Date, suggestedExt: string): string {
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  const digits = now
    .toISOString()
    .replace(TIMESTAMP_PATTERN, "")
    .slice(0, ISO_DATETIME_DIGITS_LENGTH);
  const datePart = digits.slice(0, ISO_DATE_DIGITS_LENGTH);
  const timePart = digits.slice(ISO_DATE_DIGITS_LENGTH);
  return `content/assets/${year}/${month}/pasted-image-${datePart}-${timePart}.${suggestedExt}`;
}

const ASSET_REF_PREFIX = "/assets/";

/**
 * Converts an absolute image ref as produced by onImage/stored in markdown
 * (e.g. "/assets/2026/07/x.png") back to the repo-relative path ShellApi's
 * asset cache is keyed by ("content/assets/2026/07/x.png") — assetWrite is
 * always called with the latter, so resolveImage must undo the former or a
 * just-pasted image can never resolve back to a display URL.
 *
 * Relative refs (old, co-located posts per the spec's Images section) aren't
 * resolvable here: doing so needs the entry's own repo directory, which
 * EditorProps.resolveImage(src) doesn't receive. They fall through
 * unresolved (miss -> placeholder) rather than guessing — a gap for a
 * dedicated images pass to close, not silently paper over.
 */
function repoPathForRef(src: string): string {
  return src.startsWith(ASSET_REF_PREFIX) ? `content${src}` : src;
}

function makeResolveImage(services: Services): (src: string) => Promise<string | null> {
  return async (src) => {
    const localPath = await services.shell.assetPathFor(repoPathForRef(src));
    if (!localPath) {
      return null;
    }
    return services.shell.assetDisplayUrl(localPath);
  };
}

function makeOnImage(
  services: Services,
  entryPath: string,
): (bytes: Uint8Array, suggestedExt: string) => Promise<string | null> {
  return async (bytes, suggestedExt) => {
    const repoPath = pastedImageRepoPath(new Date(), suggestedExt);
    const localPath = await services.shell.assetWrite(repoPath, bytes);
    await services.store.addAsset({ repoPath, localPath, entryPath, createdAt: Date.now() });
    return `/${repoPath.replace(CONTENT_PREFIX_PATTERN, "")}`;
  };
}

export { makeOnImage, makeResolveImage };
