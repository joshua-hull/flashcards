# Flashcards & Quiz App — Plan

Status: planning · Created 2026-10-17

## Goal

A static, no-backend, zero-account single-page app that quizzes you from an uploaded pack of questions and answers. Packs are plain files you can author, download, and share. Progress stays in the browser. Hosting is free (GitHub Pages).

**The gap it fills:** Anki is deep but heavy; Quizlet is hosted and paywalled; Mochi is account-based. None are "drop a file, start studying."

## Non-goals (v1)

- Accounts, sync, or any server.
- Anki `.apkg` import (large scope; revisit only if wanted).
- Images/audio in cards, rich-text editors.

## Decisions to make first (in order)

1. **Pack format** (everything depends on it). Proposal: single JSON file with a `version` field, so shared packs survive app changes. See draft schema below.
2. **Stack.** Recommendation: Vite + TypeScript, no UI framework (vanilla or a tiny lib like Preact if state gets unwieldy). Deploys to GitHub Pages as static files. Alternative: plain JS with no build step.
3. **Persistence.** localStorage for settings; IndexedDB if per-card history grows. Key progress by pack `id` + card `id`, never by position.
4. **Load pack from URL** (`?pack=https://...`)? Link-sharing is nicer than file-sharing but is limited by CORS (raw GitHub URLs work; arbitrary hosts may not). Decide after v1 loop works.

## Draft pack schema (v1)

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

**M0 — Prove the loop (throwaway).** Pack schema + 20-card sample + minimal quiz page: load file, shuffle, flip-and-reveal, self-grade. Goal is to judge whether it *feels* right, not to keep the code.

**M1 — Core app.**
- Upload JSON/CSV pack; validation with clear errors.
- Modes: flip, multiple choice (distractors from other cards' answers or authored), typed answer with fuzzy match.
- Session summary; missed-cards retry.
- Progress in browser storage; reset per pack.
- Mobile-friendly layout, keyboard shortcuts.

**M2 — Pack designer.** Author cards and settings in-page, live preview, download as `.json`. Import existing pack to edit.

**M3 — Scheduling.** Per-card state in storage; start with SM-2 (simple), evaluate FSRS. Due-today view. Export/import progress file as a backup.

**M4 — Sharing & polish.** Optional `?pack=` URL loading, shareable sample packs in-repo, PWA/offline, GitHub Pages deploy via Actions.

## First pack candidates

A real-world study set (e.g., middle-school math vocabulary and test review) to serve as the first non-sample pack.

## Testing

Unit tests for pack validation, fuzzy match, shuffling, and scheduler (pure functions). Manual pass on phone for layout.

## Open questions

- Fuzzy-match strictness: edit distance threshold vs. normalized-string compare only?
- Should progress be portable between browsers (export file) before M3?
- Name for the app.

## Next step

Finalize the schema above, write the 20-card sample at `packs/sample.json`, build M0.
