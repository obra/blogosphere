// ABOUTME: Memoizes SF Symbol renders per (name, size, weight, scale) so each
// ABOUTME: icon crosses the Rust bridge once, and warns once per missing name.
import type { ShellApi, SymbolImage, SymbolWeight } from "../../shell/types";

interface SymbolCache {
  get(
    name: string,
    pointSize: number,
    weight: SymbolWeight,
    scale: number,
  ): Promise<SymbolImage | null>;
}

function createSymbolCache(
  render: ShellApi["renderSymbol"],
  warn: (message: string) => void,
): SymbolCache {
  const results = new Map<string, Promise<SymbolImage | null>>();
  const warned = new Set<string>();
  return {
    get(name, pointSize, weight, scale) {
      const key = `${name}|${pointSize}|${weight}|${scale}`;
      const cached = results.get(key);
      if (cached) {
        return cached;
      }
      const pending = render(name, pointSize, weight, scale).then((image) => {
        if (image === null && !warned.has(name)) {
          warned.add(name);
          warn(`SF Symbol unavailable, using fallback icon: ${name}`);
        }
        return image;
      });
      results.set(key, pending);
      return pending;
    },
  };
}

export { createSymbolCache, type SymbolCache };
