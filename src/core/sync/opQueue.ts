// ABOUTME: A one-at-a-time async queue for the sync engine's operations —
// ABOUTME: overlapping calls run sequentially instead of interleaving.

/**
 * Serializes engine operations: overlapping calls (a focus-refresh pull
 * landing mid-push, ⌘S mashed while a round is in flight) queue instead of
 * interleaving. Interleaved rounds corrupt each other — a slow pull that
 * straddles a push finishes by rewinding META_LAST_ROOT_TREE_SHA to its
 * pre-push snapshot, after which the next pull re-diffs history we already
 * integrated (spurious "updates" that clobber local rows), and two pushes
 * race each other's CAS. Errors still propagate to each caller; a failed op
 * never blocks the queue.
 */
export function createOpQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = tail.then(op, op);
    tail = run.catch(() => undefined);
    return run;
  };
}
