# Blogosphere

A local-first blogging client for [blog.fsck.com](https://blog.fsck.com) — an
[11ty](https://www.11ty.dev/) site that lives in a GitHub repo and deploys via
GitHub Pages. Write, edit, and publish from macOS, Windows, iOS, or Android;
fully offline-capable; talks straight to the GitHub API (no server anywhere).

Built by [Claude Code](https://claude.com/claude-code), directed by
[@obra](https://github.com/obra). It's a personal tool: the repo it syncs
(`obra/blog`) and the site origin are hardcoded, and its conventions — a
`content/drafts/` lane, `draft: true` front matter, secret preview URLs via
`opaqueId`, a linkblog, LiveJournal-era HTML posts — are this one blog's.
Generalizing it wouldn't be hard; nobody has needed it yet.

## How it works

- **Your repo is the database.** A portable TypeScript core mirrors the
  content tree into local SQLite, edits front matter *surgically* (raw file
  text is the document of record — a corpus test proves byte-stability across
  the real blog), and syncs through the GitHub Git Data API: blobs → trees →
  commit → compare-and-swap ref update, never a force push.
- **Offline-first, deliberate publishing.** Every keystroke commits locally;
  nothing touches the network until you sync (⌘S), publish, or share — because
  every push to `main` deploys the site. Non-conflicting concurrent edits
  auto-merge (diff3); real conflicts get a resolution UI. An in-app activity
  log shows exactly what sync did, and a deploy watcher reports when your
  words are actually live.
- **One codebase, four platforms.** Tauri v2 + React. The desktop gets three
  panes, native menus, and dialogs; phones get a stacked library/editor with
  a bottom action sheet. The editor is Milkdown (WYSIWYG) or CodeMirror
  (markdown/HTML source), plus a live view framed straight from the site.

## Development

```sh
npm install
npm run dev        # browser demo with an in-memory fake backend
npm run test       # vitest (~950 tests); FUZZ_RUNS=10000 npm run fuzz for property tests
npm run lint       # Biome, preset "all" — strict on purpose
npm run tauri dev  # the real app (needs Rust; token in the OS keychain)
```

Desktop builds: `npm run tauri build`. Windows cross-compiles from macOS via
`cargo-xwin` + NSIS; Android/iOS build through `npm run tauri android|ios build`
(see `docs/` for the design/plan documents this grew from).

## Status

v0.x, changing fast, tested primarily against one blog with ~570 posts.
Expect sharp edges everywhere the README says "personal tool."
