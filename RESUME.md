# M3 resume notes (delete before the PR merges)

Branch `m3-scheduling`. Closes #12 (SM-2 scheduling, due-today view, progress backup) and #19 (typed-answer matching).

## Done
- #19: `normalize` ignores spacing around math symbols and unifies minus/dash variants (+tests).
- `src/lib/scheduler.ts`: SM-2 (binary results mapped to quality: flip✓=4, choice✓=3, typed exact=5, typed close=3, miss=1), `applyAnswer` (studying ahead doesn't advance), `dueSummary`, `selectDue` (due first, then ≤20 new), day numbers.
- `src/lib/storage.ts`: `CardProgress.sched`, `recordSession` takes optional `quality`, `schedulesOf` (legacy progress = due), `saveProgress`.
- `src/lib/backup.ts`: `buildBackup`/`parseBackup`/`mergeBackup` (per-card newest `at` wins; local pack definition wins).
- Tests: `scheduling.test.ts`. FSRS evaluated and deferred (documented in scheduler.ts).

## Next (UI)
1. `session.ts`: `record` should carry `quality`; Answer gets `quality`; `main.ts` passes `qualityFor(mode, ok, verdict)`.
2. Pack view: "Study due" source option (counts due/new/next due), keep All cards + Last missed.
3. Home: per-pack due count; backup export/import panel (download via Blob, import file → parseBackup → mergeBackup, show summary).
4. Browser-verify, docs (README/PLAN/CLAUDE.md), PR with `closes #12, closes #19`; delete this file.
