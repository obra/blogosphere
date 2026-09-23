// ABOUTME: Edit › Find › Search Entries: focus the entry list's search field,
// ABOUTME: selecting any query already in it (the Find field convention).

function focusEntrySearch(): void {
  const field = document.querySelector<HTMLInputElement>(".entry-list-search input");
  field?.focus();
  field?.select();
}

export { focusEntrySearch };
