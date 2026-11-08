# Red Riding Hood LM (Karkulka)

A browser game that teaches how language models work. Red Riding Hood learns to walk home through a forest one predicted step at a time, the way a language model writes one predicted token at a time.

It is for older kids and adults without a technical background, on a classroom projector or a laptop. The last tab is for technical users.

**Play it:** https://bluedragon-ctrl.github.io/Karkulka/

**Design and plans:** [`docs/design.md`](docs/design.md) is the source of truth for how the game works and what comes next.

## How it maps to a language model

| In the game | In a language model |
| --- | --- |
| A view of her surroundings (3 × 3 window) | An input token |
| A move (up, right, down, left) | An output token |
| The memory strip | The context window |
| Memory size (short / medium / long) | Context length, fixed before training |
| Thickness of the four arrows | Next-token probabilities |
| Boldness dial | Sampling temperature |
| Energy | Maximum output length |
| A swamp: passable, but 3 energy per step | Some outputs use up the budget faster |
| Parents' lessons | Pretraining on example text |
| Choice of teacher (fewest steps vs. safe and dry) | Training data and the values of whoever made it |
| Coverage heatmap | What the training data covered |
| Practice judged by outcome | Fine-tuning from feedback (RLHF-style) |
| Walking into a wolf where she was hardly taught | Hallucination on unfamiliar input |
| Going in circles with a short memory | Repetition from a short context |
| Forest edited after training | Knowledge cutoff |

## The five tabs

1. **Forest**: generate a forest from a code, share it as a link, edit tiles (path, tree, swamp, wolf den, flowers, treasure), choose her memory size and the optional home hint ("the smell of grandma's cake").
2. **Lessons**: the careful mother (avoids wolf dens and swamps), the hurried father (fewest steps), or both walk her home. Watch one lesson or fast-forward hundreds. The model learns from a per-step loss.
3. **Trip alone**: click a start tile and watch her decide, step by step or automatically, with arrows, the memory strip, energy, boldness and fog. Afterwards a "Why did she do that?" note explains the main decision.
4. **Practice**: she walks alone and each run is scored by a judge (Grandma, the parents, the crow, the magpie or the wolf; policy gradient), with an automatic curriculum that starts near home.
5. **Inside the model**: vocabulary, the encoded context, network weights, loss curves, fixed settings, and export or import.

Progress is saved in the browser. The forest code (and any edits) is carried in the page link.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests (world rules, model, training)
npm run build    # type-check and build to dist/
```

Everything runs in the browser and needs no server. It is a static TypeScript site built with Vite. The tiny neural network is hand-written (no ML library), and training runs in a Web Worker.

| Module | Purpose |
| --- | --- |
| `src/world.ts` | Tiles, moves, energy costs, what she sees, distances |
| `src/forest.ts` | Seeded forest generator (maze, loops, meadows, swamps, wolf dens, shortcut dens, flowers and treasure) |
| `src/teachers.ts` | The two parents' routes and lesson walks |
| `src/tokens.ts` | Vocabulary and context-window encoding |
| `src/model.ts` | One-hidden-layer network, softmax with temperature, Adam / SGD |
| `src/sim.ts` | A trip alone (sampling one move at a time) |
| `src/train.ts` | Lessons (imitation), practice (policy gradient), evaluation |
| `src/explain.ts` | "Why did she do that?" notes and LM corner cards |
| `src/ui/` | Board, charts, memory strip, technical tab, app shell |

## Deployment

`.github/workflows/deploy.yml` tests, builds and publishes `dist/` to GitHub Pages on every push to `main`. It needs **Settings → Pages → Source** set to **GitHub Actions**, and the `github-pages` environment must allow deployments from `main`.
