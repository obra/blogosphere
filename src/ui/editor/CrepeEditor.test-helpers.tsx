// ABOUTME: Shared test-only helper component for CrepeEditor's tests — kept out of
// ABOUTME: the .test.tsx file itself since test files may not export (Controlled is a component).
import type { RefObject } from "react";
import { useCallback, useState } from "react";
import { CrepeEditor } from "./CrepeEditor";
import type { EditorHandle } from "./markdown-utils";

function noopOnImage(): Promise<string | null> {
  return Promise.resolve(null);
}

function noopResolveImage(): Promise<string | null> {
  return Promise.resolve(null);
}

export interface ControlledProps {
  handleRef: RefObject<EditorHandle | null>;
  onEmit: (value: string) => void;
  initial?: string;
  readOnly?: boolean;
}

/** A minimal stand-in for a real controlled parent: feeds onChange's value
 * straight back in as the next `value` prop, exactly like the eventual
 * app-shell store wiring will. */
export function Controlled(props: ControlledProps) {
  const [value, setValue] = useState(props.initial ?? "");
  const handleChange = useCallback(
    (next: string) => {
      props.onEmit(next);
      setValue(next);
    },
    [props.onEmit],
  );
  return (
    <CrepeEditor
      ref={props.handleRef}
      value={value}
      onChange={handleChange}
      onImage={noopOnImage}
      resolveImage={noopResolveImage}
      readOnly={props.readOnly ?? false}
    />
  );
}
