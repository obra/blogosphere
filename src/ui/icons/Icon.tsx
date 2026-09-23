// ABOUTME: <Icon name>: an SF Symbol drawn by macOS (as a CSS mask tinted with
// ABOUTME: currentColor) on Apple platforms, the Lucide icon everywhere else.
import { type CSSProperties, useEffect, useState } from "react";
import type { ShellApi, SymbolImage, SymbolWeight } from "../../shell/types";
import { useServices } from "../app/ServicesContext";
import { ICONS, type IconName } from "./iconNames";
import { createSymbolCache, type SymbolCache } from "./symbolCache";

/** AppKit's default toolbar/control symbol size, in points. */
const DEFAULT_POINT_SIZE = 14;
const LUCIDE_STROKE_WIDTH = 2;

const caches = new WeakMap<ShellApi, SymbolCache>();

function cacheFor(shell: ShellApi): SymbolCache {
  let cache = caches.get(shell);
  if (!cache) {
    cache = createSymbolCache(
      (name, pointSize, weight, scale) => shell.renderSymbol(name, pointSize, weight, scale),
      // biome-ignore lint/suspicious/noConsole: a missing symbol is a dev-facing hint, logged once per name; the UI already fell back.
      (message) => console.warn(message),
    );
    caches.set(shell, cache);
  }
  return cache;
}

/** Whole-number backing scale (1 or 2 on Macs) for crisp symbol bitmaps. */
function backingScale(): number {
  return Math.max(1, Math.round(globalThis.devicePixelRatio || 1));
}

interface IconProps {
  name: IconName;
  size?: number;
  weight?: SymbolWeight;
}

/** Decorative (aria-hidden): the control around it carries the label. */
function Icon(props: IconProps) {
  const { shell } = useServices();
  const size = props.size ?? DEFAULT_POINT_SIZE;
  const weight = props.weight ?? "regular";
  const apple = shell.platform() === "macos";
  const source = ICONS[props.name];
  // undefined = still rendering, null = unavailable (draw the Lucide icon).
  const [symbol, setSymbol] = useState<SymbolImage | null | undefined>(apple ? undefined : null);

  useEffect(() => {
    if (!apple) {
      return;
    }
    let live = true;
    cacheFor(shell)
      .get(source.sfSymbol, size, weight, backingScale())
      .then((image) => {
        if (live) {
          setSymbol(image);
        }
      });
    return () => {
      live = false;
    };
  }, [apple, shell, source.sfSymbol, size, weight]);

  if (symbol === undefined) {
    // Reserve the box while the OS renders, so the toolbar doesn't jump.
    return (
      <span className="icon-symbol" aria-hidden="true" style={{ width: size, height: size }} />
    );
  }
  if (symbol === null) {
    const Lucide = source.lucide;
    return <Lucide size={size} strokeWidth={LUCIDE_STROKE_WIDTH} aria-hidden="true" />;
  }
  // CSSProperties has no index signature for custom properties.
  const style = {
    width: symbol.width,
    height: symbol.height,
    "--icon-mask": `url("${symbol.dataUrl}")`,
  } as CSSProperties;
  return <span className="icon-symbol" aria-hidden="true" style={style} />;
}

export { Icon };
