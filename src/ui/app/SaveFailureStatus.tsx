// ABOUTME: The editor's save status when an autosave failed (macOS keeps it here,
// ABOUTME: not in an alert per typing burst) until a save for the entry lands.
import { useAppStore, useAppStoreApi } from "./state";

function SaveFailureStatus() {
  const store = useAppStoreApi();
  const failure = useAppStore((state) => state.saveFailure);
  if (!failure) {
    return null;
  }
  const { message, retry } = failure;
  return (
    <>
      <span className="save-state" data-state="failed" title={message}>
        Couldn't save
      </span>{" "}
      {retry ? (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            store.setState({ saveFailure: null });
            retry();
          }}
        >
          Try Again
        </button>
      ) : null}
    </>
  );
}

export { SaveFailureStatus };
