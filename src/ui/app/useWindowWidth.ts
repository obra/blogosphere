// ABOUTME: The window's current width, updated on resize — what layoutColumns
// ABOUTME: fits the stored column widths into.
import { useEffect, useState } from "react";

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => globalThis.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(globalThis.innerWidth);
    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export { useWindowWidth };
