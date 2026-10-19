# Flashcards

A static, no-backend, zero-account flashcards and quiz app. Load a pack (a plain JSON file of questions and answers), get quizzed, and keep your progress in your own browser. Designed to be hosted for free on GitHub Pages.

This file gives AI coding assistants and contributors the background needed to work on the project. For the full roadmap see [PLAN.md](PLAN.md); for an overview see [README.md](README.md).

## Status

M0 (prototype), M1 (core app), M2 (pack designer) and M3 (spaced repetition) are done: pack upload (JSON/CSV) with validation, flip / multiple-choice / typed modes, session summary with missed-card retry, browser-stored progress with per-pack reset, an in-page pack designer (live validation, preview, download, import), SM-2 spaced repetition with a due-today study source, and a backup file for packs + progress. Next is M4 (offline support, `?pack=` loading); see [PLAN.md](PLAN.md).

Commands: `npm run dev`, `npm test` (Vitest), `npm run typecheck`, `npm run build`.

Layout: `src/lib/` holds the pure, unit-tested logic (`pack`, `csv`, `match`, `choices`, `shuffle`, `session`, `storage`, `designer`, `scheduler`, `backup`); `src/main.ts` (quiz flow), `src/designer.ts` (pack designer) and `src/dom.ts` (shared element/view helpers) are the thin DOM layer on top of it; `packs/` and `schema/` define the pack format.

## Design decisions

These are settled. Raise a change in an issue or PR rather than working around them.

- **Pack format.** A single JSON file with a `version` field, defined by [`schema/pack.schema.json`](schema/pack.schema.json), with an example in [`packs/sample.json`](packs/sample.json).
  - Card `id`s are author-supplied and required. Never renumber them: progress is keyed by pack `id` + card `id`, not by position.
  - `choices`, `accept` and `tags` are optional. `choices` holds distractors only; the correct answer is added automatically.
  - Unknown fields are preserved or ignored.
  - CSV import (`q,a[,tags]`, with an optional `id` column) maps to the same shape. When `id` is absent, derive it from a hash of the question.
- **Stack.** Vite + TypeScript with no UI framework (Preact only if state becomes unwieldy). Static output suitable for GitHub Pages.
- **Privacy.** No accounts, no server, no analytics. Progress lives in the browser.
- **Out of scope for v1.** Sync, Anki `.apkg` import, images/audio in cards, rich-text editing.

## Open questions

- How strict fuzzy answer matching should be: edit-distance threshold or normalized-string comparison.
- Whether progress export/import should land before spaced repetition (M3).
- Whether to support `?pack=<url>` loading. CORS limits it to hosts such as raw GitHub, so decide after the core loop works.
- The app's name.

## Conventions

- Keep logic in pure functions (pack validation, fuzzy match, shuffling, scheduling) with unit tests, and keep DOM code thin.
- Use localStorage for settings. Move per-card history to IndexedDB only if it outgrows localStorage.
- The UI must work on a phone and support keyboard shortcuts.
- When the schema changes, update `packs/sample.json` to match and check that it validates.

## Contributing

Work on a branch and open a pull request; don't push directly to `main`.

Clean up after merging: delete the PR's branch on the remote and locally (`gh pr merge <n> --squash --delete-branch`, or `git push origin --delete <branch>` plus `git branch -D <branch>`), and close any issues the PR resolved. GitHub only auto-closes the first issue in a "closes #1, #2" list, so write `closes #1, closes #2`.
