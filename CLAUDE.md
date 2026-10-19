# Flashcards

A static, no-backend, zero-account flashcards/quiz app. The user uploads a pack (a plain JSON file of questions and answers), gets quizzed, and progress stays in the browser. Hosted free on GitHub Pages.

**Status:** planning. Plan, pack schema, sample pack and README are committed. No app code yet. Next step is M0 (see `PLAN.md`, issue #6): a throwaway quiz page that loads a pack, shuffles, flips/reveals, and self-grades, to judge whether the loop feels right. It is not meant to be kept.

Read `PLAN.md` first. It holds the goals, non-goals, milestones (M0–M4), and open questions. Keep it updated as decisions are made rather than duplicating it here.

## Settled decisions (don't re-litigate)

- **Pack format:** single JSON file with a `version` field. Schema in `schema/pack.schema.json`, example in `packs/sample.json`.
  - Card `id`s are author-supplied and required. Never renumber them; progress is keyed by pack `id` + card `id`, never by position.
  - `choices`, `accept`, `tags` are optional. `choices` holds distractors only; the correct answer is added automatically.
  - Unknown fields are preserved/ignored.
  - CSV import (`q,a[,tags]`, optional `id` column) maps to the same shape. When `id` is absent, derive it from a hash of the question.
- **Stack:** Vite + TypeScript, no UI framework. Preact only if state gets unwieldy. Static output for GitHub Pages.
- **Non-goals for v1:** accounts, sync, any server, Anki `.apkg` import, images/audio, rich-text editors.

## Still open

- Fuzzy-match strictness (edit-distance threshold vs. normalized-string compare).
- Whether progress should be exportable before M3.
- `?pack=` URL loading (decide after the v1 loop works; CORS limits it to hosts like raw GitHub).
- App name.

## Conventions

- Pure functions for pack validation, fuzzy match, shuffling, and the scheduler, with unit tests. These are the testable core; keep DOM code thin.
- Persistence: localStorage for settings; move to IndexedDB only if per-card history grows.
- Layout must work on a phone, and quizzing needs keyboard shortcuts.
- When the sample pack or schema changes, keep them in sync and validate the sample against the schema.
- First real pack is likely a middle-school math vocabulary and test-review set.

## Working notes

- Repo owner: Joshua Hull. Work happens on branches or worktrees and lands via PR. Never push to `main`.
