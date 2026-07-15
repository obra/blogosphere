// ABOUTME: Minimal EditorProps.resolveImage/onImage implementations — asset
// ABOUTME: cache read/write via ShellApi, outbox registration via StoreApi.
// ABOUTME: Images are outside this module's assigned spec sections; this is
// ABOUTME: a light, best-effort wiring the images-focused work can replace.
import type { Services } from "../../core/services";

const TIMESTAMP_PATTERN = /[^0-9]/g;

function pastedImageRepoPath(now: Date, suggestedExt: string): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const timestamp = now.toISOString().replace(TIMESTAMP_PATTERN, "").slice(0, 14);
  return `content/assets/${year}/${month}/pasted-image-${timestamp}.${suggestedExt}`;
}

function makeResolveImage(services: Services): (src: string) => Promise<string | null> {
  return async (src) => {
    const localPath = await services.shell.assetPathFor(src);
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
    return `/${repoPath.replace(/^content\//, "")}`;
  };
}

export { makeOnImage, makeResolveImage };
