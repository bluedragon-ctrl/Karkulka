# Red Riding Hood LM — Design

This file is the source of truth for the game's design. Update it in the same pull request as any change to how the game behaves. It started as a design spec written on claude.ai, which is now kept only as a historical reference.

**Status:** version 1 is built and live at https://bluedragon-ctrl.github.io/Karkulka/. The [Later](#later) list and [Open questions](#open-questions) at the end are what's next.

## Purpose and audience

A browser game that teaches how language models work: Red Riding Hood learns to walk home through a forest, one predicted step at a time, the way a language model writes one predicted token at a time.

- **Audience:** older kids and adults without a technical background. A final tab serves technical users.
- **Setting:** a classroom projector or a personal laptop, in a desktop browser. The UI is in English.
- **Goal:** after one session, a non-technical person can explain tokens, context window, next-token probabilities, temperature, training data, hallucination and fine-tuning in their own words, using the game as the example.
- **Not a goal:** pathfinding. She never sees the whole forest, so the demo is about prediction from limited context, not planning.

## Core concept

Every step is a token. What she sees around her is an input token, and the move she makes is an output token. Her context is the recent alternating sequence of both, exactly like a transcript:

`[view] [move] [view] [move] [view] → next move?`

The model reads this context and outputs a probability for each of the four moves. One move is sampled, she takes it, sees a new view, and the loop repeats until she is home, eaten or out of energy.

Every feature should map to a language-model idea. This table is the map:

| In the game | In a language model |
| --- | --- |
| A view of her surroundings | An input token |
| A move (up, right, down, left) | An output token |
| The memory strip of recent views and moves | The context window |
| Memory size (short, medium, long) | Context length, fixed before training |
| Thickness of the four arrows | Next-token probabilities |
| Boldness dial | Sampling temperature |
| Energy (step budget) | Maximum output length |
| A swamp: passable, but 3 energy per step | Some outputs use up the output budget faster |
| Walking into a tree ("Ouch!"): a step of energy spent, no move | A wrong guess wastes output on a mistake |
| Stop button on a trip alone, for when she walks in circles or keeps bumping into trees | The Stop button in a chatbot, and models getting stuck repeating themselves |
| Her thoughts ("Scary wolf below me! Let's go down."), made up after the move is picked | Models narrating their steps ("First I'll check…"). Theirs come before the answer and help, because they join the context; hers come after and do not. Either way, an account of one's reasons is more generated words, not a look at how the choice was made. "Definitely" or "maybe" follow the probability |
| Lessons from a teacher | Pretraining on example text |
| Choice of teacher (fewest steps vs. safe and dry) | Training data and the values of whoever made it |
| The wolf in disguise as a teacher (looks like the father until a den is in sight) | Bad examples in the training data are learned just like good ones |
| "Mother, and sometimes the wolf" (1 lesson in 5) | Data poisoning: a little bad data does a lot of harm |
| Number of lessons | Amount of training data |
| Coverage heatmap | What the training data covered |
| Practice on her own, judged by outcome | Fine-tuning from feedback (RLHF-style) |
| One score per watched run, shared by all its moves | A reward for one whole answer: noisy alone, a clear direction over many |
| Tired, wet, scared and bumped after a trip | Answers are rated on more than being right: length, safety, wasted words |
| Choice of judge (Grandma, father, mother, crow, wolf) | Whoever rates the answers shapes the fine-tuned model, values included |
| The crow judge, scoring "as the crow flies" | Reward hacking: the model learns what the judge measures, not what was meant |
| Taught by one parent, judged by the other | Fine-tuning pulling a model away from its pretraining |
| The wolf as a judge (points for coming to his den) | A reward with bad aims ruins a good model |
| Grandma's practice after the wolf's lessons | Fine-tuning can fix some bad training data, but the more there was, the harder it is |
| Confidently walking into a wolf in an unfamiliar spot | Hallucination on out-of-distribution input |
| Looping at look-alike places with short memory | Repetition caused by a short context |
| Forest edited after training | Knowledge cutoff: the world changed, the model did not |
| Forest code: the same code always gives the same forest | A fixed random seed, so an experiment can be repeated exactly |
| Editing the forest before lessons | Choosing and cleaning the training data |
| Lessons first, then practice, compared on the same test trips | The usual recipe: pretraining, then fine-tuning from feedback |
| Small change, big change, brand new forest (same Red Riding Hood) | The further new input is from the training data, the more confident mistakes |
| Dashed yellow edges on changed tiles | Where the world no longer matches what the model learned |
| Catch-up lessons in the changed forest | Training a model further on new data instead of starting over |
| Each move picked by chance; starting again from the same tile walks differently | Sampling: the same prompt can give different answers |
| Test trips from the same fixed starts (outcome chart) | A benchmark: the same questions every time, to measure progress |
| Practice starting near home, moving outward | Curriculum learning: easy examples first |
| Lesson loss (how surprised she is by the teacher's move) | Training loss, the number pretraining pushes down |
| "She guessed 12 of 18 moves right" while watching lessons in a row | Next-token accuracy rising as training goes on |
| One-hot numbers for each tile she sees | Turning tokens into numbers before the model reads them |
| The weights heatmap | The model's weights: everything it knows |
| Fixed settings (learning rate, network size, rewards) | Hyperparameters, chosen by the builders |
| Exported model file | Shared model weights (open models) |
| Training compute next to Llama 3.1 405B | Training cost grows with weights × tokens; big models use about 10¹⁸ times more |
| How often each input token came up in lessons | Token frequency: a few tokens are everywhere, most are rare |
| Look-alike tokens where the right move depends on the place | Words whose meaning depends on context |
| Uncertainty and top-move squares for her latest trip | Entropy of next-token predictions; sampling sometimes picks a less likely token |
| Real-chatbot comparison in the LM corner cards | The same ideas at real scale: training data, tokenizers, attention, pretraining, supervised fine-tuning, RLHF, transformers |

## Forest and world rules

One forest is generated in advance, with grandma's house at a fixed spot. All training and testing happen in that forest.

**Grid.** Square tiles, 15 × 15 (readable on a projector, fast to train).

**Tile types**

| Tile | Passable | Effect |
| --- | --- | --- |
| Path or meadow | Yes | Normal step: 1 energy |
| Tree | No | A move into it is blocked; she stays put and the step still costs 1 energy |
| Swamp | Yes | A step into it costs 3 energy instead of 1 |
| Wolf den | Yes | She is eaten and the trip ends |
| Grandma's house | Yes | She is home and the trip ends |
| Outside the map | No | Treated like a tree |

**Generator rules**

- Every path or swamp tile can reach home without crossing a wolf den.
- The layout produces several look-alike spots (crossings, straight corridors), because those are what make memory matter. Typically a quarter to a half of the walkable tiles (about 38% on average) share their view with another place.
- There are many routes home: about 20 loops per forest. Single trees and wolf dens are never placed where they would close off a route.
- 4–6 swamp patches go where the hurried father's shortest route crosses them and a dry detour exists, so the two parents choose differently.
- Wolf dens (about 8) go where the two parents' routes part ways the most.
- Each forest has a short **forest code** (a seed), shareable as a link so a whole class can use the same forest.
- The user can edit tiles by hand; edits travel in the link too. Editing after training marks her lessons as outdated (the knowledge-cutoff lesson).
- **Changing the forest after her lessons.** Once she has had lessons, the Forest tab offers *Small change* (5 tiles), *Big change* (15 tiles) and *New forest, same Red Riding Hood*. A change turns random tiles (never home) into another kind of tile, and only keeps a change that leaves every path and swamp able to reach home. It is seeded by the forest code and the current tiles, so the same forest always gets the same change. A brand new forest gets a new random code and clears the heatmap, since she was taught nowhere there.
- Changed tiles get a dashed yellow-and-black edge on every tab until she has new lessons. A brand new forest is not marked; the banner says the whole forest is new to her.

**What she sees.** A 3 × 3 window centred on her: the 8 surrounding tiles. She never sees coordinates or the whole map.

**Vocabulary.** Input tokens are her views; each view is the 8 tiles around her, each one of 5 tile kinds. Output tokens are the 4 moves. In theory 5⁸ ≈ 390,000 views are possible, so the technical tab lists only the views that actually occur in the current forest (typically 75–95).

**Optional home hint.** A toggle adds one extra input: the rough direction home (8 compass sectors), framed as "the smell of grandma's cake". It is off by default and used as an experiment: more information in the input means better decisions.

**Outcomes of a trip**

- **Home:** she reached grandma's house.
- **Eaten:** she stepped onto a wolf den.
- **Lost:** her energy (the step budget) ran out first.

## Model and learning

One small neural network learns in two phases, mirroring how real LLMs are built: first by imitating examples, then by practising and being judged on the outcome.

**The model.** Input: the context window (the last N views and moves) encoded as numbers, one-hot per tile and per move. Output: a probability for each of the 4 moves. One hidden layer of 48 units; it trains in seconds in the browser. Only one model exists at a time.

**Memory size.** Chosen before training as short, medium or long: 1, 3 or 6 view–move pairs. Changing it means training a new Red Riding Hood, as with real models.

### Phase 1: lessons (pretraining)

- A teacher walks her from a random starting tile. A parent always walks her home from a random starting tile along a proper path. Each walk is one lesson (one "story").
- **Per-step loss:** at every step the model predicts the next move, compares it with what the parent did, and adjusts its weights.
- **Number of lessons** is the user's training-amount control.
- **Three ways to give lessons:**
  - *Watch one lesson:* one lesson, slowly, step by step (380 ms a step).
  - *Watch lessons in a row* (starts Quick, 120 ms a step): lesson after lesson up to the number of lessons, until Stop. A speed switch (Slow 380 ms, Quick 120 ms, Fast 40 ms a step, where she jumps instead of gliding) changes the speed while they play, and Pause holds her on the current step until Go on. She learns from each lesson when it ends, on the main thread through the same `learnFromLesson` as the worker, and is tested every 5 lessons and when the row ends or is stopped. Stop keeps the finished lessons; a lesson cut off half-way is not learned. After each lesson the panel says how many of the teacher's moves she guessed right (her most likely move) before learning from it, so users see her guesses improve.
  - *Fast-forward:* all lessons at once in a Web Worker, drawing faint trails.
  - **Run controls** (the same on Lessons and Practice): idle, a "Watch: [One lesson] [In a row]" line and the big Fast-forward button. While anything runs, those buttons are replaced in the same spot by a box with Pause / Go on (watching only), Stop and the speed switch (watching only), the progress bar on its own line below ("Lesson 13 of 100", or "412 of 1000 lessons" when fast-forwarding), then what the arrows mean and the last-lesson line. So the way to stop is right where it was started. The buttons are kept across panel redraws, so a click is never lost while she trains.
- **Choice of teacher**, with a one-line explanation card for each:
  - *Careful mother:* safe, dry routes that keep away from wolf dens and swamps, even if longer.
  - *Hurried father:* the fewest steps, even right past wolf dens and straight through swamps.
  - *Both:* a mix of lessons; her arrows visibly split where the two disagree.
  - *The wolf in disguise:* walks the father's route until a wolf den comes into her 3 × 3 view, then takes the quickest way into it. About two thirds of his lessons end at a den (measured over 16 forest codes); the rest look exactly like the father's. Drawn in grandma's shawl and bonnet with grey ears and snout showing; his lesson trail is den brown.
  - *Mother, and sometimes the wolf:* the careful mother, with 1 lesson in 5 secretly the wolf's (data poisoning).
- **Measured effect** (16 forest codes, 300 lessons, medium memory, 120 test trips each): mother only: home 81%, eaten 14%. Mother and sometimes the wolf: home 46%, eaten 50%. Wolf only: home 24%, eaten 75%.
- **Known weakness, shown on purpose:** lessons are always correct, so she never learns how to recover after a wrong step (exposure bias). Phase 2 fixes this.

### Phase 2: practice on her own (fine-tuning, optional)

- She walks alone from a starting tile, sampling her own moves, until home, eaten or lost.
- **Feedback per move:** the judge gives points to the moves of a run; the run's score is their sum. Each move is credited with the points from that move to the end of the run ("reward to go", policy-gradient style), so a judge that cares about the way she walks can blame the move that stepped into the swamp, not the whole run.
- **Choice of judge**, with a card for each. The judge knows the whole forest; she does not. The point values are fixed (in `FIXED`):
  - *Grandma (default):* only the result. +1 for reaching home, −1 for being eaten, −0.3 for running out of energy, plus up to +0.5 partial credit for ending closer to home. Closeness is measured as the energy still needed to walk home (swamps count extra).
  - *Hurried father:* Grandma's points, and −0.05 for every step.
  - *Careful mother:* Grandma's points, and −0.3 for every step into a swamp and −0.25 for every step with a wolf den in sight.
  - *Crow:* judges from the sky, as the crow flies. +0.08 for every move that heads towards home in a straight line, even into a tree, −0.08 for any other move; +0.2 for reaching home, −1 for being eaten, nothing for running out of energy (from the sky it can't tell she is tired). Bumping towards home forever earns more than walking home, so with enough practice she learns to walk into trees: reward hacking, shown on purpose.
  - *Wolf:* wants her at his den, not home. +1 for walking into a den, −0.5 for getting home, 0 for running out of energy. Practice with the wolf ruins a good model on purpose: after the mother's 300 lessons, 1000 runs with the wolf take her from 81% home to 9% (eaten 68%). An earlier version also paid +0.1 for every step with a den in sight; she then mostly loitered near dens until her energy ran out (53% lost), which told the story less clearly, so it was dropped.
- **Undoing the wolf's lessons with Grandma** (same setup): after "mother, and sometimes the wolf", home goes from 46% to 74% with 1000 practice runs and to 89% with 3000. After wolf-only lessons it only gets from 24% to 43% (1000) and 52% (3000). A little bad data can be fixed later; a lot is hard to undo.
- **After practice**, the panel compares the judge's average score at the start and end of the round with her home rate on the test trips. If the score went up while she got home less often, it says so and shows the reward-hacking card; a trip alone then explains the bumping ("she walked into trees towards home…").
- **Curriculum (automatic):** practice starts near home and moves outward as her success rate rises.
- **Number of practice runs** is the user's control for this phase.
- **Three ways to practise**, like the lessons: *Watch one run* (slow) and *Watch runs in a row* (starts Quick), with the same run controls (Pause, Stop, speed switch, progress bar) and a test every 5 runs; and *Practise N runs* in the Web Worker. A watched run shows her arrows at the practice boldness, the start flag and her trail inside the curriculum outline. When it ends she learns from it through the same `learnFromRun` as the worker, and the panel says how it ended and the judge's points for it ("In the last run she got home. Grandma gave it +1.00 points."). A row that ends or is stopped gets the same "What … taught her" summary as a worker round.

### After the forest changes: catch-up lessons

- Before the first change after her lessons, the app tests her on the test trips (three rounds of the 40 fixed starts) and keeps the result as "Before the change". It tests her again after each change button, after hand edits (when the user leaves the Forest tab or starts lessons), and after each round of lessons that follows. The results appear as labelled bars, "Getting home since the forest changed", in the Forest and Lessons tabs (up to 8 bars, the first one always kept). The chart is saved with the game and cleared with a new Red Riding Hood.
- While the forest has changed, the Lessons tab offers 30, 100 or 300 *catch-up lessons* from the chosen teacher in the changed forest, on top of what she already knows. Afterwards her lessons count as up to date again and the catch-up card appears.
- **Measured** (16 forests, careful mother, 300 lessons, medium memory, home on the test trips; extra lessons count up):

  | | After the change | +30 | +100 | +300 |
  | --- | --- | --- | --- | --- |
  | Small change (5 tiles) | 55% | 67% | 78% | 85% |
  | Big change (15 tiles) | 36% | 62% | 79% | 86% |
  | Brand new forest | 18% | 62% | 75% | 87% |

  Before the change: 82%. A few catch-up lessons already help a lot, because most of what she learned (how to read her view) still works; after about 300 she is as good as before. She forgets little of the old forest while catching up (about 74–85% home there after 30–300 catch-up lessons in a 15-tile change, measured separately), so forgetting is not shown.

### Test: trip alone

- The user clicks a starting tile. The panel reads top to bottom: a one-line instruction ("Click a path tile to pick where she starts, then let her walk to grandma's house alone."), the buttons (Next step, Walk through, Instant run, Stop), the status line, her next move while walking, and the trip report when it ends. Energy, boldness, fog and her thoughts sit in their own "Settings (optional)" box below.
- At each step the model gives probabilities; the **boldness** dial (temperature) reshapes them, and one move is sampled.
- The trip ends at home, eaten or lost (energy reached zero).
- **Her thoughts** (on by default, "Her thoughts (just for fun)" checkbox): after some moves a thought bubble over her head says a line or two. Each thought is made up *after* the move is sampled, from the view she had and the move she took, so it can pair what she saw with what she did: "Scary wolf below me! Let's go down." She speaks in up, down, left and right, like the move arrows (up is north on the map): a den is "above me", "to my left" or "down on my right". Her confidence words follow the boldness-adjusted probability of the move she took: "definitely" from 75%, "probably" from 40%, "maybe" below. Code: `src/thoughts.ts`.
  - She speaks about events, roughly in this order: the trip's end (always: "Made it!", "I need a nap…", or the wolf line before she is eaten), walking into a tree (often), a wolf den she has not thought about yet (always, with the move), grandma's house coming into view (once), energy falling to half, a quarter and a tenth (once each), stepping into a swamp, standing where she has been twice before ("Am I going in circles?"), the smell of cake when the home hint is on, and now and then just the move ("Probably down.").
  - She waits at least 2 steps after a thought before the next event thought, and 6 before plain chatter, so most steps stay quiet. Each line is picked at random from a few variants, never the same one twice in a row.
  - Walk through goes at a slow pace (about 0.65 s a move) so you can follow her, and after a thought it waits until there has been time to read it (from 1.8 s for a short line to 4.5 s for a long one) before she moves on. While walking, the bubble stays for that reading time plus one move; the last thought of a trip stays until the next trip. Instant run shows no thoughts at all. Thoughts use their own randomness, so they never change her walk.

### Fixed internals (never user-set)

Learning rate, network size, reward values, curriculum pace and exploration during practice are fixed. They are shown read-only in the technical tab. The values live in `FIXED` in `src/train.ts`.

**Optimizer memory is not kept.** Lessons use Adam, which keeps running averages of past gradients. These start fresh with every round of lessons, after a reload and after an import; only the weights are kept. Each round therefore starts with a short warm-up of larger steps. This keeps saves and model files to the weights alone.

## User flow

The app is a row of tabs that tells the story in order: Forest, Lessons, Trip alone, Practice, Inside the model. Later tabs unlock when the earlier step is done, and the user can always go back. Practice is optional and sends her back to Trip alone, so users can compare her before and after.

| Tab | What happens | User controls |
| --- | --- | --- |
| 1. Forest | Generate or edit the forest; home is fixed | New forest, a forest code to type in and Generate (the page link always carries the forest too), tile editing (path, tree, swamp, wolf den), memory size (short / medium / long), home-hint toggle; after lessons: small change, big change, new forest with the same Red Riding Hood |
| 2. Lessons | Parents walk her home; the model trains per step | Teacher (mother / father / both / wolf in disguise / mother and sometimes the wolf), number of lessons, play or fast-forward; after a change: 30 / 100 / 300 catch-up lessons |
| 3. Trip alone | She walks from a chosen start using the model | Click the start tile, energy (step budget), boldness dial, Next step, Walk through (pause any time), Instant run or Stop (end the trip now, when she goes in circles or keeps bumping into trees), fog toggle, her thoughts toggle |
| 4. Practice (optional) | Her own runs, scored by a judge; then back to Trip alone to compare | Judge (Grandma / father / mother / crow / wolf), number of practice runs |
| 5. Inside the model | Numbers and model details for technical users | Read-only views, export or import the model |

The teacher and the judge are each picked from a drop-down list, with a card under it for the chosen one: its picture and a plain line for children ("Just come home safe, dear!"). The exact points a judge gives are not in the panel but in its LM corner card, listed under the card text (`CARD_DETAILS` in `src/explain.ts`): the panel is for children, the LM corner for numbers and technical hints.

**Rules between tabs**

- Trip alone and Practice stay locked until at least one round of lessons is done.
- Changing the memory size or the home hint requires new lessons; the app says so instead of silently retraining.
- Editing or changing the forest after training keeps the model but shows a note that her lessons are outdated, with changed tiles marked. This is the knowledge-cutoff experiment. Any new round of lessons brings her up to date.
- The trained model and the forest are saved in the browser, so a lesson can continue the next day.

## Visuals

All pictures are simple symbolic SVG shapes drawn for this project, with no tile packs and no external art. The focus stays on the concepts, and everything scales cleanly on a projector.

**Symbol rules**

- One clear shape per tile type: a triangle tree, a plain path, a marked wolf den, a small house with a heart for grandma, wavy blue water with reeds for a swamp, and a red hooded figure for Red Riding Hood (an original design).
- Shape plus colour, never colour alone, so colour-blind viewers can tell tiles apart.
- Symbols must read at small sizes, because the same symbols appear as tokens in the memory strip.
- Limited palette: greens and browns for the forest, red only for her and for danger, warm yellow for home, blue for swamp water. Each parent gets its own colour. The judges are figures too: Grandma (white bun, glasses, blue-grey shawl), the parents, a black crow with a yellow beak, and the wolf (his head as a judge; in grandma's shawl and bonnet as a teacher).

**Core displays**

- **Decision arrows:** four arrows around her, thickness showing probability; hover or tap shows the number. The boldness dial visibly flattens or sharpens them before a move is picked. When both parents taught her, arrows are tinted by which parent's habit they come from.
- **Memory strip:** along the bottom, small tiles alternating between view and move, sliding as she walks. It shows exactly what she remembers (her last steps, as many as her memory size, plus what she sees now) and nothing more; older steps are only a "…". Not shown on the Forest tab, where she is not walking.
- **Fog toggle:** hides everything except her 3 × 3 window, to show what she actually sees.
- **Bumps and splashes:** on Next step and Walk through, walking into a tree pops up a small "Ouch!" with a yellow bump star at the tree, and a swamp step sends up a few water drops around her feet. Both are just for fun and vanish within a second; Instant run skips them.
- **Thought bubble:** a white rounded bubble with two small circles trailing to her head, following her as she walks and kept inside the board (below her near the top edge, and when she sits down lost, so it does not cover the "lost in the woods" note). It is drawn above the fog and the outcome pictures.
- **Energy:** a small bar; as it drops she shows a sweat drop, and at zero she sits down (lost).
- **Coverage heatmap:** an overlay showing where lessons passed, "where she was taught".
- **Changed tiles:** a dashed yellow-and-black edge (shape and colour, no red) on tiles that differ from the forest she was taught on.
- **Lesson playback:** the parent walks ahead of her; in fast-forward, many faint footprint trails in the parent's colour build up.
- **Outcome chart:** a simple stacked chart of home, eaten and lost over the course of lessons or practice. It is friendlier than a loss curve. Each bar is the same 40 test trips from fixed starts. A job tests after every batch of 25 when short, and less often when long, so it adds about 20 bars (the last batch is always tested). Testing would otherwise take most of a long job's time.

**Outcomes, kept child-friendly**

- Home: hearts at the cottage, a small celebration.
- Eaten: a cartoon wolf pops up and the screen fades. Nothing graphic.
- Lost: she sits down, and a "lost in the woods" note appears.
- **How the trip went:** after every trip (home, eaten, lost, or cut short with Stop), the result also says how *tired* she is (energy used of her budget: still fresh, a bit tired, very tired, or worn out when lost), how *wet* (swamp steps: dry feet, wet feet, soaked) and how *scared* (different wolf dens she saw on the way: calm, a little scared, scared, very scared) and how *bumped* (moves into a tree, each a wrong guess that cost a step of energy and got her nowhere: no bumps, a bump or two for 1–2, a bumpy walk for 3–5, bumped all over). Each has its own symbol (a battery, a water drop, a wolf head, a tree with a yellow bump star). Its heading, "How was the trip for her?", has a "?" for the trip report card.

**LM corner cards ("?" buttons).** Each card gives one sentence or two of analogy, for example "Her memory strip is her context window: everything she can take into account right now." These cards carry the teaching for non-technical users. They are not shown in the panel on their own: a small round "?" (yellow, with a dark border) sits next to the control, heading or result it explains, and clicking it opens the card as a small popup ("LM corner") right there. The popup closes with ×, Escape or a click elsewhere, and follows its "?" when the panel is redrawn (during a trip on Walk through, for example). Inside a checkbox or radio label, the "?" opens the card without ticking the box. The texts live in `CARDS` in `src/explain.ts`; the popup is `src/ui/hint.ts`.

**Text outside the cards.** Panel text, buttons, the banner and the memory strip are written for older kids: short sentences, everyday words, no "model", "probability" or "token" jargon beyond what the game shows directly. Language-model comparisons and terms (knowledge cutoff, reward hacking and so on) go in the LM corner cards, opened by the "?" next to the text, not in the panel itself. The Inside the model tab is the exception: it is for technical users and uses the real terms.

**How real chatbots do it.** Most cards go on, in the same paragraph, to compare the idea with a real chatbot: one or two short sentences in everyday words, without technical terms beyond the ones the game teaches (tokens, temperature, hallucination and so on): a chatbot's world is text, it reads in tokens, it writes one word at a time and can't take a word back, people rate its answers, it may flatter you because praise gets rated highly. The analogy and the comparison are written as one text, with no separating line or heading, so the card reads as one short explanation that moves from her to chatbots. Each card text lives in `CARDS` in `src/explain.ts` and stays under 300 characters. (This replaces the earlier "How big models do it" dialog and, later, a separate "In a big model" part under a dashed line, so all the teaching sits in one place, next to the thing it explains.)

When something happens that a card explains, that card's "?" pulses (a soft yellow glow, five times; a steady ring with reduced motion) until it is opened or something newer happens. Entering a tab makes the "?" by its title pulse, so new users find the buttons; the Forest tab also says "Each ? shows the language-model idea behind it, and how real chatbots do it."

Where the "?" buttons are, and what makes them pulse:

| Tab | "?" next to | Card | Pulses when |
| --- | --- | --- | --- |
| All | Memory strip label | Context window | |
| All | Outdated banner | Knowledge cutoff, or out of training data for a brand new forest | |
| 1. Forest | Title | The forest as the model's world | Entering the tab |
| 1. Forest | Forest code | The same code gives the same forest: a fixed random seed | |
| 1. Forest | "Edit the forest" | You choose her world, as builders choose a model's training data | |
| 1. Forest | Swamp note | Swamp eats the energy budget | Painting a swamp before lessons |
| 1. Forest | "Her memory" | Context window | |
| 1. Forest | "Chosen before her lessons…" | Context length is fixed before training | Changing the memory size |
| 1. Forest | Smell of grandma's cake | More useful input | Toggling it |
| 1. Forest | "Change the forest after her lessons" | Knowledge cutoff | A change or hand edit after lessons |
| 1. Forest | "New forest, same Red Riding Hood" | Out of training data | Choosing it |
| 1. Forest, 2. Lessons | "Getting home since the forest changed" | Test trips as a benchmark | |
| 2. Lessons | Title | Lessons are pretraining | Entering the tab |
| 2. Lessons | Intro ("she guesses the next move…") and the "Watching…" line | Guess, compare, adjust: next-token training | Watching a lesson |
| 2. Lessons | "The forest changed" / "Since the forest changed" | Catch-up lessons | After catch-up lessons |
| 2. Lessons | "Who teaches her?" | The chosen teacher: training data and its values, the wolf (bad examples) or the mix (data poisoning) | Choosing a teacher; after lessons from both, the wolf or the mix |
| 2. Lessons | Number of lessons | More training data, diminishing returns | |
| 2. Lessons | Watch buttons and "She guessed … right" | Watching her learn: next-token accuracy rises with training | Stopping or finishing a row of watched lessons |
| 2. Lessons | "That lesson came from the wolf in disguise…" (after a watched lesson that ends at a den) | Bad examples are learned too | That lesson |
| 2. Lessons | "How she does alone" | Test trips as a benchmark | |
| 2. Lessons | Heatmap checkbox | What the training data covered | Toggling it; after lessons from one parent |
| 2. Lessons | Known weakness | Exposure bias | After a watched lesson |
| 3. Trip alone | Title and fog checkbox | A view is an input token | Entering the tab; toggling fog |
| 3. Trip alone | Instruction ("Click a path tile to pick where she starts…"); the card says how a move is picked by chance | Sampling | |
| 3. Trip alone | "In a swamp" in the status line (while she stands in one) | Swamp eats the energy budget | Her first swamp step on a trip |
| 3. Trip alone | "Ouch, a tree!" in the status line (right after she walks into a tree) | A wrong guess wastes a step | Her first bump into a tree on a trip |
| 3. Trip alone | "Smells cake" in the status line | More useful input | |
| 3. Trip alone | "Stopped after N steps." in the status line | Models can get stuck repeating themselves; chatbots have a Stop button and a length limit | Pressing Stop |
| 3. Trip alone | "Her thoughts" checkbox | Her thoughts come after the move, so they are not what made her choose. Real chatbots narrate their steps too, before the answer (which helps), but a stated reason is still not a look inside | Her first thought in a session (unless another card just pulsed); toggling it |
| 3. Trip alone | "Why did she do that?" | The card that fits the trip: home, hallucination, temperature, repetition, energy, swamp, reward hacking, the wolf's lessons or practice | The trip ends |
| 3. Trip alone | "How was the trip for her?" | Answers are rated on more than being right | |
| 3. Trip alone | "Her next move" (while walking) | Next-token probabilities | Choosing a start |
| 3. Trip alone | Energy, Boldness | Maximum output length, temperature | Moving the slider |
| 4. Practice | Title | Practice is fine-tuning from feedback | Entering the tab; starting practice |
| 4. Practice | "Who judges?" | The judge decides what she learns | |
| 4. Practice | The chosen judge's line (in the judge card) | The chosen judge's card, followed by how that judge scores a run, in points | Choosing a judge |
| 4. Practice | Watch buttons and "In the last run … gave it … points" | One score for a whole run, as in RLHF | Watching one run |
| 4. Practice | "Run … of …" line while watching | Sampling: each move picked by chance | |
| 4. Practice | "She practises from up to … steps" | Curriculum learning | |
| 4. Practice | "How she does alone" | Test trips as a benchmark | |
| 4. Practice | "Same … test trips: after lessons … after practice …" | Lessons first, then practice: the usual recipe | |
| 4. Practice | "What … taught her" (after practice) | Reward hacking, teacher versus judge, bad judge (wolf), fixing bad data, or the general judge card | Practice ends |
| 5. Inside the model | Title | The real numbers | Entering the tab |
| 5. Inside the model | Vocabulary, Training data, Look-alike tokens, Current input, Her latest trip, Network, Loss curves, Training compute, Fixed settings, Export and import | Vocabulary, token frequency, context-dependent tokens, one-hot inputs, uncertainty and sampling, weights, loss, training cost, hyperparameters, shared model files | |

After a trip, the "Why did she do that?" text is a small note at the bottom of "How was the trip for her?", with its "?" for the card that fits. When she walks into a den after wolf lessons or wolf practice, it says the wolf taught her.


**Layout.** Designed for a wide screen first: the forest large in the centre, a narrow side panel with the current tab's controls, and the memory strip at the bottom. A phone layout can come later.

## Technical tab: Inside the model

The last tab shows the real numbers behind the friendly visuals, for technical users. It is read-only except for export and import.

- **Vocabulary:** every input and output token with its ID, how often it came up in lessons (dashed when seen fewer than 5 times), "×n" for look-alike views and "≠" where the right move depends on the place.
- **Training data:** how many lesson predictions were made from each input token, as a rank-frequency bar chart (most common first), with how much the most common tenth of the tokens covers and how many were never or rarely seen. Counted from the heatmap: every lesson position but the last (home or a den) is one prediction.
- **Look-alike tokens:** views that occur in several places where no single move is the teacher's best at every place, for the careful mother and the hurried father (the wolf walks home like the father), the share of her lesson predictions made on them, and each such token with the teacher's best move at each of its places. Only memory, or the smell of cake, can tell these apart.
- **Current input:** the context window at the selected step, encoded as numbers.
- **Network:** its structure, with weights shown as a heatmap.
- **Loss curves:** per-step loss for lessons and average score for practice, next to the friendly outcome chart.
- **Probabilities:** the raw values before and after boldness (temperature) is applied.
- **Her latest trip:** uncertainty (entropy in bits, 0 to 2) at each step as a line chart, one square per step (filled when she took her most likely move, hollow when chance picked another), and the chance of exactly that walk at the boldness used (the product of the chosen moves' probabilities).
- **Training compute:** weights, training predictions (lessons plus practice) and training operations by the usual rule of thumb (6 × weights × predictions), next to Llama 3.1 405B's published numbers (405 billion weights, 15.6 trillion tokens, 3.8 × 10²⁵ operations). Step counts are kept in the stats as `lessonSteps` and `practiceSteps`; older saves without them estimate lesson steps from the heatmap, so no save version change was needed.
- **Fixed settings:** learning rate, rewards, curriculum and network size, shown read-only.
- **Export and import:** the trained model and forest as a file.

## Tech stack and constraints

A static TypeScript site hosted on GitHub Pages, with everything (generation, training, testing) running in the browser and no server.

- **Language and build:** TypeScript with Vite; every push to `main` is tested, built and deployed to GitHub Pages by a GitHub Actions workflow.
- **Rendering:** SVG for the symbols, arrows and memory strip; canvas for the weight heatmaps.
- **Training:** runs in a Web Worker so the page never freezes; the small network is hand-written, with no ML library.
- **Determinism:** a seeded random generator, so a forest code always produces the same forest.
- **Persistence:** forest and trained model saved in browser storage; forest code (and any edits) also carried in the page link.
- **Performance target:** a full round of lessons on a 15 × 15 forest finishes in seconds on an ordinary laptop.
- **Code structure:** world rules, model, training and UI kept as separate modules, so the game logic can be tested without the UI.
- **Accessibility:** colour is never the only signal; text readable from the back of a classroom.

## Scope

**Version 1 (done)**

- Forest generation, forest codes, tile editing, fixed home
- More routes per forest, and swamps that cost extra energy
- Memory size choice and the home-hint toggle
- Lessons with five teacher options, including the wolf in disguise and the mother mixed with a few wolf lessons
- Trip alone with arrows, memory strip, energy, boldness, fog and Next step, Walk through, Instant run or Stop
- Practice phase with automatic curriculum
- Coverage heatmap, outcome chart, LM corner cards
- Technical tab, browser save, export and import
- Changing the forest after lessons (small, big, brand new), changed-tile marks, catch-up lessons and the before/after chart
- Five practice judges (Grandma, father, mother, crow, wolf), with reward hacking from the crow and a ruined model from the wolf

### Later

- A crow teacher for Lessons (walks straight towards home and gets stuck): learning from a source that doesn't share your limits
- A simple "inside her head" network picture on the main screens
- Two models side by side for comparison
- Berry bush that restores energy (+15, once per trip), with her energy level as an extra input (a "how tired am I" sense, like a model knowing its remaining output budget). Parents never teach the detour, so only practice can discover it: fine-tuning learning behaviour that was never in the training examples
- Phone layout

### Open questions

- Whether to keep Adam's running averages with the model (smoother training across rounds and "Watch one lesson", but bigger saves and model files and a save-version bump), or keep resetting them each round as now.
- Exact default grid size and the three memory-size values, to be tuned once it runs.
- Pacing of the outcome animations.
- Whether a teacher's guide (one page of lesson flow for presenters) belongs in the repo.
