# Red Riding Hood LM (Karkulka)

A browser game that teaches how language models work: Red Riding Hood walks home one predicted step at a time, the way a language model writes one predicted token at a time. Static TypeScript site (Vite), no server, live at https://bluedragon-ctrl.github.io/Karkulka/.

**`docs/design.md` is the source of truth for the design.** Read it before changing game behaviour, and update it in the same pull request as the change. Its Later list and Open questions are the backlog.

## Commands

```sh
npm install
npm run dev        # local dev server
npm test           # vitest unit tests (fast, ~2 s)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build to dist/
```

Run `npm test` and `npm run build` before every commit.

## How the code fits together

Game logic has no DOM dependencies and is tested directly; the UI lives in `src/ui/`.

| Module | Purpose |
| --- | --- |
| `src/world.ts` | Tiles, moves, energy costs, what she sees, distances |
| `src/forest.ts` | Seeded forest generator: maze, loops, meadows, swamps, wolf dens |
| `src/teachers.ts` | The two parents' route costs and lesson walks |
| `src/tokens.ts` | Vocabulary and context-window encoding (one-hot views and moves) |
| `src/model.ts` | One-hidden-layer network, softmax with temperature, Adam and SGD |
| `src/sim.ts` | A trip alone: the `Walker` samples one move at a time |
| `src/train.ts` | Lessons (imitation), practice (policy gradient), evaluation; fixed internals in `FIXED` |
| `src/explain.ts` | "Why did she do that?" notes and LM corner card texts |
| `src/insights.ts` | "How big models do it" dialog texts: each tab's ideas mapped to real large language models |
| `src/storage.ts` | Browser save, forest links, model export and import |
| `src/worker.ts`, `src/workerTypes.ts` | Training in a Web Worker |
| `src/ui/` | App shell and tabs (`app.ts`), board, charts, memory strip, technical tab, SVG symbols |

## Conventions

- **Every feature maps to a language-model idea.** Add it to the mapping table in `docs/design.md`, and give it an LM corner card in `src/explain.ts` where it teaches something.
- **Original art only:** simple symbolic SVG shapes drawn in code (`src/ui/symbols.ts`). No tile packs, external images or resemblance to existing games.
- **Shape plus colour, never colour alone.** Red is reserved for her and for danger.
- **Child-friendly outcomes:** nothing graphic.
- **Deterministic generation:** forests come only from the seeded RNG in `src/rng.ts`, so a forest code always gives the same forest. Changing the generator changes every existing forest code, so call that out in the pull request.
- **Tune with numbers:** when changing the generator, rewards or training, measure across many forest codes (success rates, how often the parents disagree) and put the before/after numbers in the pull request.
- Keep UI text plain and short; the audience is non-technical.

## Things to remember

- **Changing the tile kinds or the model's inputs breaks old saves.** Views are one-hot over `TILE_KINDS`, so a new tile or input changes the model's input size. When that happens:
  - bump `SAVE_VERSION` in `src/storage.ts` (it sets the save key and the save and model-file versions), and update the "older version" message in `parseFile`;
  - check the link format (`packTiles` packs two tiles per character, which fits up to 8 tile kinds);
  - update the tests that check sizes.
- **Training runs in the worker**, but "Watch one lesson" trains on the main thread through the same `learnFromLesson` function. Keep both paths in sync.
- **Deployment:** every push to `main` runs `.github/workflows/deploy.yml` (test, build, publish to GitHub Pages). The `github-pages` environment must allow `main` to deploy.
- GitHub warns that the workflow's actions target an old Node.js version; updating the action versions is a small pending chore.
