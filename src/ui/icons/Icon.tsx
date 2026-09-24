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

/** The backing scale, kept current as the window moves between displays
 *  (a resolution media query stops matching when the scale changes). */
function useBackingScale(): number {
  const [scale, setScale] = useState(backingScale);
  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") {
      return;
    }
    const query = globalThis.matchMedia(`(resolution: ${scale}dppx)`);
    const onChange = () => setScale(backingScale());
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [scale]);
  return scale;
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
  const scale = useBackingScale();
  // undefined = still rendering, null = unavailable (draw the Lucide icon).
  const [symbol, setSymbol] = useState<SymbolImage | null | undefined>(apple ? undefined : null);

  useEffect(() => {
    if (!apple) {
      return;
    }
    let live = true;
    cacheFor(shell)
      .get(source.sfSymbol, size, weight, scale)
      .then((image) => {
        if (live) {
          setSymbol(image);
        }
      });
    return () => {
      live = false;
    };
  }, [apple, shell, source.sfSymbol, size, weight, scale]);

  if (symbol === undefined) {
    // Reserve the box while the OS renders, so the toolbar doesn't jump.
    return (
      <span
        className="icon-symbol icon-symbol-pending"
        aria-hidden="true"
        style={{ width: size, height: size }}
      />
    );
  }
  if (symbol === null) {
    const Lucide = source.lucide;
    return <Lucide size={size} strokeWidth={LUCIDE_STROKE_WIDTH} aria-hidden="true" />;
  }
  // A fixed size x size box (the mask is `contain`), matching the
  // placeholder, so the swap never shifts the toolbar. CSSProperties has no
  // index signature for custom properties.
  // The mask image is set directly: WebKit doesn't repaint a composited
  // mask when only a custom property it reads through var() changes, which
  // left freshly rendered symbols drawn as solid squares.
  const mask = `url("${symbol.dataUrl}")`;
  const style: CSSProperties = {
    width: size,
    height: size,
    // biome-ignore lint/style/useNamingConvention: React's name for -webkit-mask-image.
    WebkitMaskImage: mask,
    maskImage: mask,
  };
  return <span className="icon-symbol" aria-hidden="true" style={style} />;
}

export { Icon };
