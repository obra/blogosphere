// ABOUTME: A single current value that a mounted component registers (the
// ABOUTME: focused editor, the editor's view modes) for the menu bar to observe.

interface Registry<T> {
  /** Makes `value` current; the returned unregister clears it only if it
   *  is still the current one. */
  set(value: T): () => void;
  get(): T | null;
  subscribe(listener: () => void): () => void;
}

function createRegistry<T>(): Registry<T> {
  let current: T | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    set(value) {
      current = value;
      notify();
      return () => {
        if (current === value) {
          current = null;
          notify();
        }
      };
    },
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { createRegistry, type Registry };
