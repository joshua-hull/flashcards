# Flashcards & Quiz App — Plan

Status: M0–M2 done; deployed to GitHub Pages · Created 2026-10-17

## Goal

A static, no-backend, zero-account single-page app that quizzes you from an uploaded pack of questions and answers. Packs are plain files you can author, download, and share. Progress stays in the browser. Hosting is free (GitHub Pages).

**The gap it fills:** Anki is deep but heavy; Quizlet is hosted and paywalled; Mochi is account-based. None are "drop a file, start studying."

## Non-goals (v1)

- Accounts, sync, or any server.
- Anki `.apkg` import (large scope; revisit only if wanted).
- Images/audio in cards, rich-text editors.

## Decisions to make first (in order)

1. **Pack format** — DECIDED. Single JSON file with a `version` field. Formal schema: `schema/pack.schema.json`; sample: `packs/sample.json`. Card `id`s are author-supplied and required (never renumber); `choices`, `accept`, `tags` optional; `choices` hold distractors only (the answer is added automatically). CSV import (`q,a[,tags]`, optional `id` column) derives ids from a hash of the question when absent.
2. **Stack** — DECIDED. Vite + TypeScript, no UI framework (Preact only if state gets unwieldy). Static output for GitHub Pages.
3. **Persistence** — DECIDED (#3). localStorage for settings, per-pack progress and remembered packs, keyed by pack `id` + card `id`, never by position. Falls back to in-memory storage if the browser blocks localStorage. IndexedDB stays deferred until per-card history outgrows localStorage; revisit in M3.
4. **Load pack from URL** (`?pack=https://...`)? Link-sharing is nicer than file-sharing but is limited by CORS (raw GitHub URLs work; arbitrary hosts may not). Decide after v1 loop works.

## Pack schema (v1)

```json
{
  "version": 1,
  "id": "math-7-vocab",
  "title": "7th Grade Math Vocabulary",
  "description": "optional",
  "cards": [
    {
      "id": "c1",
      "q": "Question text",
      "a": "Answer text",
      "choices": ["optional authored distractors"],
      "accept": ["optional alternate typed answers"],
      "tags": ["vocab"]
    }
  ]
}
```

Rules: stable card `id`s (progress depends on them); unknown fields preserved/ignored; CSV import (`q,a[,tags]`) converts to this shape.

## Milestones

**M0 — Prove the loop (throwaway). ✅ Done.** Pack schema + 20-card sample + minimal quiz page: load file, shuffle, flip-and-reveal, self-grade. Goal is to judge whether it *feels* right, not to keep the code.

**M1 — Core app. ✅ Done** (PR #16; tests in `src/lib/`).
- Upload JSON/CSV pack; validation with clear errors.
- Modes: flip, multiple choice (distractors from other cards' answers or authored), typed answer with fuzzy match.
- Session summary; missed-cards retry.
- Progress in browser storage; reset per pack.
- Mobile-friendly layout, keyboard shortcuts.

**M2 — Pack designer. ✅ Done** (#11). Author cards and settings in-page, live preview, download as `.json`. Import existing pack to edit.

**M3 — Scheduling.** Per-card state in storage; start with SM-2 (simple), evaluate FSRS. Due-today view. Export/import progress file as a backup.

**M4 — Sharing & polish.** Optional `?pack=` URL loading, shareable sample packs in-repo, PWA/offline. GitHub Pages deploy via Actions is done (#18): live at https://joshua-hull.is-a.dev/flashcards/.

## First pack candidates

A real-world study set (e.g., middle-school math vocabulary and test review) to serve as the first non-sample pack.

## Testing

Unit tests for pack validation, fuzzy match, shuffling, and scheduler (pure functions). Manual pass on phone for layout.

## Open questions

- ~~Fuzzy-match strictness~~ Settled in M1: normalized compare plus edit distance scaled by answer length (≤4 chars exact, ≤9 one edit, else two); close matches count as correct and show the real answer.
- Should progress be portable between browsers (export file) before M3?
- Name for the app.

## Next step

M3 (#12): spaced repetition — per-card scheduling state, due-today view, progress export/import. Also pending: offline support (rest of #13), and the typed-answer whitespace/minus-sign matching fix.
