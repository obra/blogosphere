// ABOUTME: Semantic icon names → SF Symbol (Apple platforms, rendered by the OS)
// ABOUTME: and Lucide (everywhere else). Components only ever use the semantic name.
import {
  CircleArrowUp,
  CloudAlert,
  CloudCheck,
  CloudOff,
  ExternalLink,
  History,
  type LucideIcon,
  RefreshCw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";

interface IconSource {
  sfSymbol: string;
  lucide: LucideIcon;
}

const ICONS = {
  versions: { sfSymbol: "clock.arrow.circlepath", lucide: History },
  openOnSite: { sfSymbol: "arrow.up.right.square", lucide: ExternalLink },
  syncNotConnected: { sfSymbol: "icloud.slash", lucide: CloudOff },
  syncing: { sfSymbol: "arrow.triangle.2.circlepath", lucide: RefreshCw },
  synced: { sfSymbol: "checkmark.icloud", lucide: CloudCheck },
  syncPending: { sfSymbol: "arrow.up.circle", lucide: CircleArrowUp },
  syncConflict: { sfSymbol: "exclamationmark.triangle", lucide: TriangleAlert },
  syncOffline: { sfSymbol: "wifi.slash", lucide: WifiOff },
  syncError: { sfSymbol: "exclamationmark.icloud", lucide: CloudAlert },
} satisfies Record<string, IconSource>;

type IconName = keyof typeof ICONS;

export { ICONS, type IconName, type IconSource };
