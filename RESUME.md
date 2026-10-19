# M1 resume notes (delete when M1 merges)

Branch `m1-core-app`, covers issues #7 (upload+validation), #8 (modes), #9 (summary/retry), #10 (progress).

## Done
- Vite + TS + Vitest scaffold (`npm test`, `npm run typecheck`, `npm run build`).
- `src/lib/`: types, pack validation (collects all errors), CSV import (ids hashed from q), shuffle, fuzzy match (edit distance scaled by length; short answers exact), multiple-choice builder. 18 tests passing.

## Next
1. `src/lib/storage.ts`: per-pack progress in localStorage keyed by pack id + card id; reset per pack; remembered packs list.
2. `src/lib/session.ts`: session state machine (deck, index, results, missed retry) as pure functions + tests.
3. UI (`index.html`, `src/main.ts`, `src/style.css`): upload/drop JSON+CSV, error list, mode picker (flip / multiple choice / typed), keyboard shortcuts, summary + retry missed, reset progress, mobile layout. Port look from `prototype/index.html`.
4. Browser-verify in Safari, update README/PLAN/CLAUDE.md, open PR (do not merge without being asked).

## Decisions made while building
- Typo tolerance: len<=4 exact, <=9 one edit, else two. `checkTyped` returns exact/close/wrong; UI should treat close as correct but show the real answer.
- Choices: authored distractors first, then other cards' answers; fewer than 4 options when pack is small.
