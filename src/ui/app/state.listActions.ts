// ABOUTME: The entry list's data: loading it from the store (refresh) and the
// ABOUTME: debounced full-text search over it.
import { debounce } from "./format";
import { appendLog } from "./state.logActions";
import type { ActionCtx } from "./state.types";

interface SearchDebouncer {
  call: (query: string) => void;
}

function createSearchDebouncer(ctx: ActionCtx): SearchDebouncer {
  return debounce<[string]>((query) => {
    runSearch(ctx, query);
  }, ctx.deps.searchDebounceMs);
}

async function refresh(ctx: ActionCtx): Promise<void> {
  ctx.set((state) => ({ busy: { ...state.busy, refreshing: true } }));
  try {
    const entries = await ctx.get().services.store.listEntries();
    ctx.set({ entries, entriesLoadFailed: false });
  } catch (error) {
    ctx.set({ entriesLoadFailed: true });
    // On macOS the list shows this only when it's empty; the log keeps it
    // either way (refresh runs after every sync round, often unattended).
    appendLog(ctx, {
      level: "error",
      message: "Couldn't reload your entries.",
      detail: error instanceof Error ? error.message : String(error),
    });
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't load your entries.",
      retry: () => refresh(ctx),
      source: "load",
    });
  } finally {
    ctx.set((state) => ({ busy: { ...state.busy, refreshing: false } }));
  }
}

async function runSearch(ctx: ActionCtx, query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) {
    ctx.set({ searchResults: null });
    return;
  }
  try {
    const results = await ctx.get().services.store.searchEntries(trimmed);
    ctx.set({ searchResults: results });
  } catch {
    ctx
      .get()
      .addToast({ tone: "error", message: "Search failed.", retry: () => runSearch(ctx, query) });
  }
}

function setSearchQuery(ctx: ActionCtx, searchDebouncer: SearchDebouncer, query: string): void {
  ctx.set({ searchQuery: query });
  searchDebouncer.call(query);
}

export type { SearchDebouncer };
export { createSearchDebouncer, refresh, setSearchQuery };
