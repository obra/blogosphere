// ABOUTME: Wires ConflictDialog to live state for the active (first
// ABOUTME: not-dismissed-this-session) conflict: "mine" from the entry cache,
// ABOUTME: "theirs" from the stashed conflicting remote text pull() left
// ABOUTME: behind (core/sync/meta.ts's ConflictRemote) rather than the
// ABOUTME: possibly-stale baseContent.
import { useEffect, useState } from "react";
import { getConflictRemote } from "../../core/sync/meta";
import { ConflictDialog } from "./ConflictDialog";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";
import { EMPTY_CONFLICTS } from "./state.types";

/**
 * "Theirs" for a conflicted path. baseContent is *not* advanced to the
 * conflicting remote text at detection time (see ConflictRemote's doc
 * comment), so it's stale by the time the dialog would show it — this reads
 * the real thing pull() stashed instead, falling back to `fallback` only if
 * nothing was ever stashed for this path.
 */
function useTheirsText(path: string | null, fallback: string): string {
  const services = useServices();
  const [theirs, setTheirs] = useState(fallback);

  useEffect(() => {
    if (!path) {
      setTheirs(fallback);
      return;
    }
    let cancelled = false;
    getConflictRemote(services.store, path).then((stash) => {
      if (!cancelled) {
        setTheirs(stash?.text ?? fallback);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services, path, fallback]);

  return theirs;
}

/**
 * Which conflict the dialog is for. On macOS conflicts never interrupt: the
 * sheet opens only when asked for (Resolve… in the editor bar or the
 * Activity popover). Elsewhere the first conflict not dismissed this
 * session opens by itself.
 */
function useActiveConflict(): {
  path: string | undefined;
  cancel: () => void;
  resolved: () => void;
} {
  const store = useAppStoreApi();
  const mac = useServices().shell.platform() === "macos";
  const conflicts = useAppStore((state) => state.syncStatus?.conflicts ?? EMPTY_CONFLICTS);
  const requested = useAppStore((state) => state.conflictSheetPath);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (mac) {
    return {
      path: requested !== null && conflicts.includes(requested) ? requested : undefined,
      cancel: () => store.getState().closeConflict(),
      // resolveConflict closes the sheet itself.
      resolved: () => undefined,
    };
  }
  const path = conflicts.find((candidate) => candidate !== dismissed);
  return {
    path,
    cancel: () => setDismissed(path ?? null),
    // A dismissed conflict gets another chance once another one is dealt with.
    resolved: () => setDismissed(null),
  };
}

function ConflictHost() {
  const store = useAppStoreApi();
  const entries = useAppStore((state) => state.entries);
  const { path: activePath, cancel, resolved } = useActiveConflict();
  const record = activePath ? entries.find((e) => e.path === activePath) : undefined;
  const theirsPath = record ? (activePath ?? null) : null;
  const theirs = useTheirsText(theirsPath, record?.baseContent ?? "");

  if (!(activePath && record)) {
    return null;
  }

  return (
    <ConflictDialog
      path={activePath}
      mine={record.workingContent}
      theirs={theirs}
      onChoose={(resolution) => {
        resolved();
        store.getState().resolveConflict(activePath, resolution);
      }}
      onCancel={cancel}
    />
  );
}

export { ConflictHost };
