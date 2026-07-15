// ABOUTME: Toast stack — plain-language errors/info/success with an optional
// ABOUTME: retry affordance and a dismiss button. Reads straight from the store.
import { useAppStore, useAppStoreApi } from "./state";

function Toasts() {
  const toasts = useAppStore((state) => state.toasts);
  const store = useAppStoreApi();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className="toast" data-tone={toast.tone} key={toast.id}>
          <div className="toast-message">{toast.message}</div>
          <div className="toast-actions">
            {toast.retry ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  toast.retry?.();
                  store.getState().dismissToast(toast.id);
                }}
              >
                Retry
              </button>
            ) : null}
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss"
              onClick={() => store.getState().dismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export { Toasts };
