// ABOUTME: Semantic icon names → SF Symbol (Apple platforms, rendered by the OS)
// ABOUTME: and Lucide (everywhere else). Components only ever use the semantic name.
import { ExternalLink, History, type LucideIcon } from "lucide-react";

interface IconSource {
  sfSymbol: string;
  lucide: LucideIcon;
}

const ICONS = {
  versions: { sfSymbol: "clock.arrow.circlepath", lucide: History },
  openOnSite: { sfSymbol: "arrow.up.right.square", lucide: ExternalLink },
} satisfies Record<string, IconSource>;

type IconName = keyof typeof ICONS;

export { ICONS, type IconName, type IconSource };
