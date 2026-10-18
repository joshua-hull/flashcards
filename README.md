# Flashcards

A static, no-backend flashcards and quiz app. Load a pack of questions and answers from a file, get quizzed in random order, and keep your progress in your own browser. No accounts, no server.

**Status:** planning. See [PLAN.md](PLAN.md) for goals, decisions and milestones, and the [issue tracker](../../issues) for current work.

## Packs

A pack is a single JSON file with a `version` field, so shared packs keep working as the app changes.

- Schema: [`schema/pack.schema.json`](schema/pack.schema.json)
- Example: [`packs/sample.json`](packs/sample.json)

## Planned

Flip, multiple-choice and typed-answer modes; an in-browser pack designer; spaced repetition; deployment to GitHub Pages.
