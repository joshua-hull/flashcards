# Flashcards

A static, no-backend flashcards and quiz app. Load a pack of questions and answers from a file, get quizzed in random order, and keep your progress in your own browser. No accounts, no server.

**Status:** M1 (core app) done. See [PLAN.md](PLAN.md) for goals and milestones, and the [issue tracker](../../issues) for current work.

## Try it

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # typecheck + static build into dist/
```

Open the app, drop in a pack (or use the built-in sample), pick a mode and start.

- **Modes:** flip and self-grade, multiple choice, or type the answer (small typos are forgiven).
- **Keyboard:** `space`/`enter` reveal or continue, `1`/`2` grade (or pick an option), `enter` submits a typed answer.
- **Progress:** stored per pack in your browser's localStorage, with a per-pack reset. Packs you load are remembered too.
- **After a round:** a summary with the cards you missed and a one-click retry. You can also drill only the cards you last missed.

## Packs

A pack is a single JSON file with a `version` field, so shared packs keep working as the app changes. CSV (`q,a[,tags]`, optional `id` column, tags separated by `;`) is also accepted and converted on load.

- Schema: [`schema/pack.schema.json`](schema/pack.schema.json)
- Example: [`packs/sample.json`](packs/sample.json)

## Planned

An in-browser pack designer; spaced repetition; deployment to GitHub Pages with offline support.
