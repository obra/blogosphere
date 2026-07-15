// ABOUTME: Tag chips editor — comma/Enter to add a tag, click × (or Backspace
// ABOUTME: on an empty field) to remove one. Fully controlled.
import { type KeyboardEvent, useState } from "react";

interface TagChipsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

function TagChipsEditor(props: TagChipsEditorProps) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const value = draft.trim();
    setDraft("");
    if (value && !props.tags.includes(value)) {
      props.onChange([...props.tags, value]);
    }
  }

  function removeTag(tag: string) {
    props.onChange(props.tags.filter((t) => t !== tag));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Backspace" && draft === "" && props.tags.length > 0) {
      props.onChange(props.tags.slice(0, -1));
    }
  }

  return (
    <div className="tag-chips">
      {props.tags.map((tag) => (
        <span className="tag-chip" key={tag}>
          {tag}
          <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)}>
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-chip-input"
        type="text"
        placeholder="Add tag…"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        aria-label="Add tag"
      />
    </div>
  );
}

export { TagChipsEditor };
