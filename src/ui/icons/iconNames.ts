// ABOUTME: Semantic icon names → SF Symbol (Apple platforms, rendered by the OS)
// ABOUTME: and Lucide (everywhere else). Components only ever use the semantic name.
import {
  ChevronDown,
  CircleArrowUp,
  CloudAlert,
  CloudCheck,
  CloudOff,
  Ellipsis,
  ExternalLink,
  FileText,
  History,
  Link,
  type LucideIcon,
  Package,
  PanelLeft,
  PenLine,
  RefreshCw,
  Search,
  SquarePen,
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
  compose: { sfSymbol: "square.and.pencil", lucide: SquarePen },
  composeMenu: { sfSymbol: "chevron.down", lucide: ChevronDown },
  sidebarToggle: { sfSymbol: "sidebar.left", lucide: PanelLeft },
  more: { sfSymbol: "ellipsis.circle", lucide: Ellipsis },
  drafts: { sfSymbol: "pencil", lucide: PenLine },
  posts: { sfSymbol: "doc.text", lucide: FileText },
  links: { sfSymbol: "link", lucide: Link },
  releases: { sfSymbol: "shippingbox", lucide: Package },
  search: { sfSymbol: "magnifyingglass", lucide: Search },
} satisfies Record<string, IconSource>;

type IconName = keyof typeof ICONS;

export { ICONS, type IconName, type IconSource };
