# Red Riding Hood LM — Design

This file is the source of truth for the game's design. Update it in the same pull request as any change to how the game behaves. It started as a design spec written on claude.ai, which is now kept only as a historical reference.

**Status:** version 1, her basket, and the [forest events and her story](#forest-events-and-her-story) are built and live at https://bluedragon-ctrl.github.io/Karkulka/. The planned [events that change her basket, and new places each trip](#next-events-that-change-her-basket-and-new-places-each-trip-planned), the [Later](#later) list and the [Open questions](#open-questions) at the end are what's next.

## Purpose and audience

A browser game that teaches how language models work: Red Riding Hood learns to walk home through a forest, one predicted step at a time, the way a language model writes one predicted token at a time.

- **Audience:** older kids and adults without a technical background. A final tab serves technical users.
- **Setting:** a classroom projector or a personal laptop, in a desktop browser. The UI is in English.
- **Goal:** after one session, a non-technical person can explain tokens, context window, next-token probabilities, temperature, training data, hallucination and fine-tuning in their own words, using the game as the example.
- **Not a goal:** pathfinding. She never sees the whole forest, so the demo is about prediction from limited context, not planning.

## Core concept

Every step is a token. What she sees around her is an input token, and the move she makes is an output token. Her context is the recent alternating sequence of both, exactly like a transcript:

`[cake] [flowers] [treasure] | [view] [move] [view] [move] [view] → next move?`

The three basket tokens at the front are **pinned**: they describe what is in her basket now and never scroll out, unlike the views and moves (see [Her basket](#her-basket)). The model reads this context and outputs a probability for each of the four moves. One move is sampled, she takes it, sees a new view, and the loop repeats until she is home, eaten or out of energy.

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
| Her thoughts ("Scary wolf to the south! Let's go south."), made up after the move is picked | Models narrating their steps ("First I'll check…"). Theirs come before the answer and help, because they join the context; hers come after and do not. Either way, an account of one's reasons is more generated words, not a look at how the choice was made. "Definitely" or "maybe" follow the probability |
| Lessons from a teacher | Pretraining on example text |
| Choice of teacher (fewest steps vs. safe and dry) | Training data and the values of whoever made it |
| The wolf in disguise as a teacher (looks like the father until a den is in sight) | Bad examples in the training data are learned just like good ones |
| "Mother, and sometimes the wolf" (1 lesson in 5) | Data poisoning: a little bad data does a lot of harm |
| Grandma as a teacher (flowers first, then home; only the flowers in her pinned basket tell her which half of the errand she is on) | Example answers that show a whole task, step by step (supervised fine-tuning), and the state kept in the context deciding what comes next |
| The magpie as a teacher (from treasure to treasure, then home) | Training data carries the aims of whoever made it: a model learns what the examples want, not only how they go |
| The crow as a teacher (flies on over a tree, where she can only bump into it) | Learning from examples made by someone who can do things the model can't: it copies moves it cannot make, like a chatbot writing as if it had looked something up |
| Lessons to add | Amount of training data |
| Coverage heatmap | What the training data covered |
| Practice on her own, judged by outcome | Fine-tuning from feedback (RLHF-style) |
| One score per watched run, shared by all its moves | A reward for one whole answer: noisy alone, a clear direction over many |
| Tired, wet, scared and bumped after a trip | Answers are rated on more than being right: length, safety, wasted words |
| Choice of judge (Grandma, father, mother, crow, magpie, wolf) | Whoever rates the answers shapes the fine-tuned model, values included |
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
| Moving grandma's house after lessons | A new goal the model was never trained for: it falls back on old habits |
| Catch-up lessons in the changed forest | Training a model further on new data instead of starting over |
| Each move picked by chance; starting again from the same tile walks differently | Sampling: the same prompt can give different answers |
| Test trips from the same fixed starts (outcome chart) | A benchmark: the same questions every time, to measure progress |
| Practice starting near home, moving outward (or anywhere, to compare) | Curriculum learning: easy examples first |
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
| Basket squares pinned at the front of her memory | The system prompt and the state an app puts back in every turn: they never scroll out of the context |
| The father lets the wolf have the cake for a shortcut | What the reward does not measure, the model gives up |
| The magpie: treasure instead of grandma's house | A reward that values a side goal above the task: the model drops the task |
| Treasure paid at pickup, flowers only when home | Process rewards versus outcome rewards |
| Hidden forest events: things she cannot see and no judge scores | What is not in the input and not rewarded never changes what a model does |
| The trip story, made after the trip from her trip record | An answer built from the facts in the context |
| Made-up parts of the story (clouds), more when bold | Hallucination, and temperature making it wilder |
| Made-up events borrowed from this forest | Believable hallucinations, built from things the model knows |
| "Tell it again" | Regenerating an answer: the same facts, a new telling |
| Real-chatbot comparison in the LM corner cards | The same ideas at real scale: training data, tokenizers, attention, pretraining, supervised fine-tuning, RLHF, transformers |

## Forest and world rules

One forest is generated in advance, with grandma's house at a fixed spot (the generator always puts it in the same place, so a forest code always gives the same forest). The player can move the house with the "Grandma's house" brush in the forest editor; the old spot becomes path. All training and testing happen in that forest.

**Grid.** Square tiles, 15 × 15 (readable on a projector, fast to train).

**Tile types**

| Tile | Passable | Effect |
| --- | --- | --- |
| Path or meadow | Yes | Normal step: 1 energy |
| Tree | No | A move into it is blocked; she stays put and the step still costs 1 energy |
| Swamp | Yes | A step into it costs 3 energy instead of 1 |
| Wolf den | Yes | The first den she steps onto takes the cake: she stands on the den and runs on. Any den after that (the same one too) eats her and the trip ends |
| Flowers | Yes | 1 energy; she picks them the first time she steps on the patch (once per trip) |
| Treasure | Yes | 1 energy; she picks it up the first time she steps on it (once per trip) |
| Grandma's house | Yes | She is home and the trip ends |
| Outside the map | No | Treated like a tree |

**Generator rules**

- Every path or swamp tile can reach home without crossing a wolf den.
- The layout produces several look-alike spots (crossings, straight corridors), because those are what make memory matter. Typically a quarter to a half of the walkable tiles (about 38% on average) share their view with another place.
- There are many routes home: about 20 loops per forest. Single trees and wolf dens are never placed where they would close off a route.
- 4–6 swamp patches go where the hurried father's shortest route crosses them and a dry detour exists, so the two parents choose differently.
- Wolf dens (about 8) go where the two parents' routes part ways the most.
- **Basket tiles** are placed after the rest of the forest, from their own seeded stream (`basket:` + code), so the rest of each forest stays as it was:
  - Up to 3 *shortcut dens* go into gaps between two paths (a tree with walkable tiles on opposite sides) where walking through saves at least 4 steps, the biggest savings first, never next to another den or home. A den is only kept if it does not send the careful mother through more swamps (a den in sight makes her detour). Tiles that were trees become dens, so every path still reaches home without crossing one. About 2 per forest; a den shortcut exists on 26% of the test trips and saves 4 steps on average (16 forest codes).
  - 2–3 flower patches and 2–3 treasures go on path tiles off both parents' routes (tiles no parent steps onto on the way home from anywhere: dead ends and side loops), at least 3 steps from home, never side by side. The first one goes next to a den when it can, so taking it is a real risk; every forest measured has one.
  - Adding the basket changed every forest code (the old dens, swamps and maze are the same; some trees became dens and some paths became items). How often the parents disagree stays the same (31.5 tiles on average over 32 codes, before and after), and the mother wades through swamps on slightly fewer routes than before.
- Each forest has a short **forest code** (a seed), shareable as a link so a whole class can use the same forest.
- The user can edit tiles by hand, grandma's house included (its brush moves the house); edits travel in the link too. Saved and linked tiles find home from the house tile, so old links and saves still work. Moving the house after lessons shows the "moved home" card: she still heads for the old spot, like a model given a goal it was never trained for. Editing after training marks her lessons as outdated (the knowledge-cutoff lesson).
- **Changing the forest after her lessons.** Once she has had lessons, the Forest tab offers *Small change* (5 tiles), *Big change* (15 tiles) and *New forest, same Red Riding Hood*. A change turns random tiles (never home) into another kind of tile, and only keeps a change that leaves every path and swamp able to reach home. It is seeded by the forest code and the current tiles, so the same forest always gets the same change. A brand new forest gets a new random code and clears the heatmap, since she was taught nowhere there.
- Changed tiles get a dashed yellow-and-black edge on every tab until she has new lessons. A brand new forest is not marked; the banner says the whole forest is new to her.

**What she sees.** A 3 × 3 window centred on her: the 8 surrounding tiles. She never sees coordinates or the whole map.

**Vocabulary.** Input tokens are her views; each view is the 8 tiles around her, each one of 7 tile kinds. Output tokens are the 4 moves. In theory 7⁸ ≈ 5.8 million views are possible, so the technical tab lists only the views that actually occur in the current forest (typically 75–95).

**Optional home hint.** A toggle adds one extra input: the rough direction home (8 compass sectors), framed as "the smell of grandma's cake". It is off by default and used as an experiment: more information in the input means better decisions.

**Outcomes of a trip**

- **Home:** she reached grandma's house (with or without the cake).
- **Eaten:** she stepped onto a wolf den without the cake (the whole basket is lost).
- **Lost:** her energy (the step budget) ran out first.

## Model and learning

One small neural network learns in two phases, mirroring how real LLMs are built: first by imitating examples, then by practising and being judged on the outcome.

**The model.** Input: the pinned basket (8 numbers: cake yes / no, flowers 0 / 1 / 2+, treasure 0 / 1 / 2+, one-hot each) and the context window (the last N views and moves) encoded as numbers, one-hot per tile and per move. Output: a probability for each of the 4 moves. One hidden layer of 48 units; it trains in seconds in the browser. Only one model exists at a time.

**Memory size.** Chosen before training as short, medium or long: 1, 3 or 6 view–move pairs. Changing it means training a new Red Riding Hood, as with real models.

### Phase 1: lessons (pretraining)

- A teacher walks her from a random starting tile. A parent always walks her home from a random starting tile along a proper path. Each walk is one lesson (one "story").
- **Per-step loss:** at every step the model predicts the next move, compares it with what the parent did, and adjusts its weights.
- **Lessons to add** is the user's training-amount control. It sits under a "Give her more lessons" heading and a "So far: 2586 lessons (father 2586)" line, so it is clear the slider adds on top of what she already had.
- **Three ways to give lessons:**
  - *Watch one lesson:* one lesson, slowly, step by step (380 ms a step).
  - *Watch lessons in a row* (starts Quick, 120 ms a step): lesson after lesson up to the number of lessons, until Stop. A speed switch (Slow 380 ms, Quick 120 ms, Fast 40 ms a step, where she jumps instead of gliding) changes the speed while they play, and Pause holds her on the current step until Go on. She learns from each lesson when it ends, on the main thread through the same `learnFromLesson` as the worker, and is tested every 5 lessons and when the row ends or is stopped. Stop keeps the finished lessons; a lesson cut off half-way is not learned. After each lesson the panel says how many of the teacher's moves she guessed right (her most likely move) before learning from it, so users see her guesses improve.
  - *Do N lessons:* all lessons at once in a Web Worker, drawing faint trails.
  - **Run controls** (the same on Lessons and Practice): idle, the big "Do 540 lessons" button (its number follows the slider while it is dragged), and below it a smaller "Or watch: [One lesson] [Watch lessons]" line; Watch lessons plays the same 540 one after another. While anything runs, those buttons are replaced in the same spot by a box with Pause / Go on (watching only), Fast-forward (watching a row only: the finished ones are kept and the rest are done quickly in the Web Worker, so a row that feels too long can be finished without watching), Stop and the speed switch (watching only), the progress bar on its own line below ("Lesson 13 of 100, 2599 so far", or "412 of 1000 lessons, 2998 so far" when running them all at once), then what the arrows mean and the last-lesson line. So the way to stop is right where it was started. The buttons are kept across panel redraws, so a click is never lost while she trains.
- **Choice of teacher**, with a one-line explanation card for each:
  - *Careful mother:* safe, dry routes that keep away from wolf dens and swamps, even if longer.
  - *Hurried father:* the fewest steps, even right past wolf dens and straight through swamps.
  - *Both:* a mix of lessons; her arrows visibly split where the two disagree.
  - *The wolf in disguise:* walks the father's route until a wolf den comes into her 3 × 3 view, then takes the quickest way into it. About two thirds of his lessons end at a den (measured over 16 forest codes); the rest look exactly like the father's. Drawn in grandma's shawl and bonnet with grey ears and snout showing; his lesson trail is den brown.
  - *Mother, and sometimes the wolf:* the careful mother, with 1 lesson in 5 secretly the wolf's (data poisoning).
  - *Crow:* heads for home as the crow flies, along the longer way first. It takes a step she can walk if one goes towards home (never onto a den, which it sees from the sky). When only trees are in the way it flies on over one: her move into the tree is the lesson's last move, she bumps and stays, and the lesson ends (`stuck` on the walk). When only a wolf den is in the way the lesson ends where she stands. Over 24 forest codes, from every start: 38% of crow lessons reach home, 52% end at a tree, 10% before a den; they are short (6.6 moves on average). It is drawn as the crow judge's figure, sitting on the tree when it flies over one; its trail is crow black. After a watched crow lesson that ends at a tree the panel says so ("The crow flew on over a tree…"). The crow is also a judge: the judge rewards steps towards home, the teacher shows them.
- The parents never walk through a den, and never detour for flowers or treasure: to them an item is ordinary path (the wolf in disguise too). If one lies on their way, they walk over it and it goes into her basket, by the same rule as on a trip alone, so the lesson's basket tokens show what really happens on that tile. The generator puts items off both parents' routes, so in a generated forest this only happens after the forest is edited or changed. The wolf's lessons still end at the first den.
  - *Grandma:* first to the nearest flower patch the careful way, then home the mother's way (straight home if no flowers can be reached). Her lessons are the only ones where the same view needs a different move before and after a pickup, so the flowers in her pinned basket tell the two halves apart. Drawn as the Grandma judge; her trail is her shawl's blue-grey.
  - *Magpie:* to the nearest treasure not yet picked, in the fewest steps (like the father), then the next, and home the father's way when none is left that it can reach. Drawn as the magpie judge; its trail is its tail's blue.
  - After one watched Grandma or magpie lesson, its card pulses. With them, the teachers are the same cast as the judges (the wolf comes in disguise).
- **Grandma and the magpie, measured** (24 forest codes, 300 lessons, medium memory, 40 test trips each). Lessons from every start: Grandma's fetch flowers in 95% and take 33.5 moves on average; the magpie's pick 2.4 treasures and take 43.3 moves. After 300 lessons: Grandma only: home 97%, 0.89 bunches of flowers brought home per trip; magpie only: home 97%, 2.08 treasures per trip (mother only: home 89%, 0.02 flowers, 0.04 treasure; father only: home 96%, 0.01 flowers, 0.02 treasure). Their long errands take her through more of the forest, so she gets home as often as with the father. With the same context, setting the pinned flowers token to 0 or 1 changes her next move by 8.4% on average after Grandma's lessons, against about 1% after the other teachers': she uses her basket when the lessons need it.
- **Crow lessons, measured** (24 forest codes, 300 lessons, medium memory, 40 test trips each): crow only: home 38%, eaten 4%, lost 57%, and 84% of her moves are into trees (father only: home 96%, 24% into trees; mother only: home 89%, 31%). She learned the crow's straight line and its move into trees, which she cannot make.
- **Measured effect** (16 forest codes, 300 lessons, medium memory, 120 test trips each): mother only: home 93%, eaten 1%. Mother and sometimes the wolf: home 76%, eaten 19%. Wolf only: home 23%, eaten 65%. (Before the basket: 81 / 14, 46 / 50 and 24 / 75. The cake now saves her at the first den, so the mother's lessons and a little poisoning hurt less; a lot of poisoning still ruins her.)
- **Known weakness, shown on purpose:** lessons are always correct, so she never learns how to recover after a wrong step (exposure bias). Phase 2 fixes this.

### Phase 2: practice on her own (fine-tuning, optional)

- She walks alone from a starting tile, sampling her own moves, until home, eaten or lost.
- **Feedback per move:** the judge gives points to the moves of a run; the run's score is their sum. Each move is credited with the points from that move to the end of the run ("reward to go", policy-gradient style), so a judge that cares about the way she walks can blame the move that stepped into the swamp, not the whole run.
- **Choice of judge**, with a card for each. The judge knows the whole forest; she does not. The point values are fixed (in `FIXED`):
  - *Grandma (default):* the result, with the cake. +1 for reaching home, −1 for being eaten, −0.3 for running out of energy, plus up to +0.5 partial credit for ending closer to home. Closeness is measured as the energy still needed to walk home (swamps count extra; a den tile counts from its cheapest neighbour plus the step onto it, never through another den, since without the cake that would eat her). −0.5 when the wolf grabs the cake, +0.3 for each bunch of flowers, only when she gets home with them (an outcome reward).
  - *Hurried father:* Grandma's points for home, eaten and lost, −0.05 for every step, and +0.1 for each treasure at pickup. Nothing for the cake or flowers.
  - *Careful mother:* Grandma's points for home, eaten and lost, −0.3 for every step into a swamp, −0.25 for every step with a wolf den in sight, and −0.5 when the wolf grabs the cake.
  - *Magpie:* +1 for each treasure at pickup, kept even if she never gets home (a process reward), +0.2 for reaching home, −1 for being eaten, 0 for running out of energy. Measures right but wants the wrong thing most.
  - *Crow:* judges from the sky, as the crow flies. +0.08 for every move that heads towards home in a straight line, even into a tree, −0.08 for any other move; +0.2 for reaching home, −1 for being eaten, nothing for running out of energy (from the sky it can't tell she is tired). Bumping towards home forever earns more than walking home, so with enough practice she learns to walk into trees: reward hacking, shown on purpose.
  - *Wolf:* wants her at his den, not home. +1 for every step into a den (the one where he only grabs the cake too), −0.5 for getting home, 0 for running out of energy. Practice with the wolf ruins a good model on purpose: after the mother's 300 lessons, 1000 runs with the wolf take her from 93% home to 42% (eaten 24%, lost 34%). Paying only for being eaten worked before the basket (81% → 9%), but with the cake shield that needs two dens and she fell only to 66%, so the cake grab pays too. An earlier version also paid +0.1 for every step with a den in sight; she then mostly loitered near dens until her energy ran out, which told the story less clearly, so it was dropped.
- **Being eaten is always bad:** it takes back every good basket point a judge gave in that run (flowers, treasure), so no treasure makes it worth it. A lost cake still counts, so losing the cake and then being eaten is worse than being eaten with it. Way-of-walking points (steps, swamps, headings) stay. (Measured on 8 forest codes, 300 lessons then 3000 runs with Grandma, before and after the lost cake started to count: father's lessons home 99.4% / 99.1%, mother's 99.4% / 99.4%; home without the cake 1.3% / 1.3% and 1.9% / 2.8%, within noise.)
- **Undoing the wolf's lessons with Grandma** (same setup): after "mother, and sometimes the wolf", home goes from 76% to 93% with 1000 practice runs and to 96% with 3000. After wolf-only lessons it only gets from 23% to 48% (1000) and 56% (3000). A little bad data can be fixed later; a lot is hard to undo.
- **What the basket judges teach** (16 forest codes, medium memory, 300 lessons, practice close to home first, 120 test trips):

  | Lessons, then practice | Home | Home without the cake | Flowers home per 100 trips | Treasure per 100 trips |
  | --- | --- | --- | --- | --- |
  | Father's lessons, no practice | 92% | 5% | 2 | 1 |
  | + 8000 runs with Grandma | 100% | 2% | 4 | 0 |
  | + 8000 runs with the father | 100% | 10% | 3 | 1 |
  | + 3000 runs with the magpie | 88% | 7% | 2 | 12 |
  | + 8000 runs with the magpie | 73% (lost 27%) | 10% | 2 | 34 |
  | Mother's lessons + 8000 runs with Grandma | 99% | 1% | 4.3 | 1 |
  | Same, but Grandma pays nothing for flowers | 99% | 1% | 0.8 | 1 |

  The father's practice learns to cut through dens and let the wolf have the cake (5× as often as Grandma's at 8000 runs; at 3000 runs 7% against 3%). The magpie's practice grabs treasure and wanders off: home falls and lost rises the longer she practises. Flowers paid only on delivery are a small effect (dead ends are rarely near her way), but clear against a Grandma who doesn't pay for them; paying +1 a bunch brought more flowers (12 per 100) but also lost the cake more often (9%), because flowers then outweighed the cake.
- **After practice**, the panel compares the judge's average score at the start and end of the round with her home rate on the test trips, and what she brings on 10 test trips before and after the round (flowers brought home, treasure picked, home without the cake). A watched run's line names what she picked ("In the last run she got home (she picked 2 treasures). The magpie gave it +2.20 points."). If the score went up while she got home less often, it says so and shows the reward-hacking card; a trip alone then explains the bumping ("she walked into trees towards home…").
- **Curriculum (automatic), or anywhere:** a "Where does she start?" switch on the Practice tab. *Close to home first* (default): practice starts within 3 steps of home (walking distance), and the circle grows by 2 steps when she gets home in 70% of her last 30 runs; her energy is 4 × the circle + 10, at most the test-trip energy. The circle is outlined on the board. *Anywhere in the forest*: any path tile, test-trip energy, no outline, and the circle doesn't grow. The switch itself is the explanation: comparing the two on the test trips shows why easy examples first helps. It's saved with the settings, not the model, and can't be changed while training runs. Measured on 8 forest codes (KARKULKA, A1–G7; medium memory, mother's lessons, then 1000 runs with Grandma; home on the test trips): with no lessons, close-first reaches 18% home and anywhere 5%; after 30 lessons both reach 68% (from 40%); after 300 lessons 94% and 95% (from 88%). So the curriculum matters when she knows little, and the card says so rather than promising it always helps.
- **Runs to add** is the user's control for this phase, under a "Let her practise more" heading and a "So far: N practice runs" line, as on Lessons.
- **Three ways to practise**, like the lessons: *One run* (slow) and *Watch runs* (starts Quick, with Fast-forward for the rest; the "What … taught her" summary then still covers the whole row, the watched runs too), with the same run controls (Pause, Stop, speed switch, progress bar) and a test every 5 runs; and *Do N runs* in the Web Worker. A watched run shows her arrows at the practice boldness, the start flag and her trail inside the curriculum outline. When it ends she learns from it through the same `learnFromRun` as the worker, and the panel says how it ended and the judge's points for it ("In the last run she got home. Grandma gave it +1.00 points."). A row that ends or is stopped gets the same "What … taught her" summary as a worker round.

### After the forest changes: catch-up lessons

- Before the first change after her lessons, the app tests her on the test trips (three rounds of the 40 fixed starts) and keeps the result as "Before the change". It tests her again after each change button, after hand edits (when the user leaves the Forest tab or starts lessons), and after each round of lessons that follows. The results appear as labelled bars, "Getting home since the forest changed", in the Forest and Lessons tabs (up to 8 bars, the first one always kept). The chart is saved with the game and cleared with a new Red Riding Hood.
- While the forest has changed, the Lessons tab offers 30, 100 or 300 *catch-up lessons* from the chosen teacher in the changed forest, on top of what she already knows. Afterwards her lessons count as up to date again and the catch-up card appears.
- **Measured** (16 forests, careful mother, 300 lessons, medium memory, home on the test trips; extra lessons count up):

  | | After the change | +30 | +100 | +300 |
  | --- | --- | --- | --- | --- |
  | Small change (5 tiles) | 82% | 90% | 92% | 97% |
  | Big change (15 tiles) | 61% | 80% | 90% | 94% |
  | Brand new forest | 26% | 65% | 88% | 92% |

  Before the change: 93% (measured again with the basket; before it, the rows read 55 / 67 / 78 / 85, 36 / 62 / 79 / 86 and 18 / 62 / 75 / 87 from 82%). A few catch-up lessons already help a lot, because most of what she learned (how to read her view) still works; after about 300 she is as good as before. She forgets little of the old forest while catching up (about 74–85% home there after 30–300 catch-up lessons in a 15-tile change, measured separately), so forgetting is not shown.

### Test: trip alone

- The user clicks a starting tile. The panel reads top to bottom: a one-line instruction ("Click a path tile to pick where she starts, then let her walk to grandma's house alone."), the buttons (Next step, Walk through, Instant run, Stop), the status line, her next move while walking, and the trip report when it ends. Energy, boldness, fog and her thoughts sit in their own "Settings (optional)" box below.
- At each step the model gives probabilities; the **boldness** dial (temperature) reshapes them, and one move is sampled.
- The trip ends at home, eaten or lost (energy reached zero).
- **Her thoughts** (on by default, "Her thoughts (just for fun)" checkbox): after some moves a thought bubble over her head says a line or two. Each thought is made up *after* the move is sampled, from the view she had and the move she took, so it can pair what she saw with what she did: "Scary wolf to the south! Let's go south." She speaks in compass words, as on a map: up the screen is north, down is south, left is west and right is east. A den is "to the north", "to the west" or "to the south-east", and she goes "north" or "east". Her confidence words follow the boldness-adjusted probability of the move she took: "definitely" from 75%, "probably" from 40%, "maybe" below. Code: `src/thoughts.ts`.
  - She speaks about events, roughly in this order: the trip's end (always: "Made it!", "I need a nap…", or the wolf line before she is eaten), her basket (always: "The wolf grabbed the cake! I ran away.", "Flowers for Grandma!", "Ooh, treasure!"), a [forest event](#forest-events-and-her-story) that just happened (always, after the 2-step gap: "Who's there? Just an owl."), walking into a tree (often), a wolf den she has not thought about yet (always, with the move), grandma's house coming into view (once), energy falling to half, a quarter and a tenth (once each), stepping into a swamp, standing where she has been twice before ("Am I going in circles?"), the smell of cake when the home hint is on, and now and then just the move ("Probably down.").
  - She waits at least 2 steps after a thought before the next event thought, and 6 before plain chatter, so most steps stay quiet. Each line is picked at random from a few variants, never the same one twice in a row.
  - Walk through goes at an easy pace (about 0.43 s a move) so you can follow her, and after a thought it adds a small pause (0.6 s to 1.4 s, longer for longer thoughts) before she moves on. While walking, the bubble stays long enough to read (from 1.8 s for a short line to 4.5 s for a long one), so it keeps showing for a few moves; the last thought of a trip stays until the next trip. Instant run shows no thoughts at all. Thoughts use their own randomness, so they never change her walk.

- **Forest events and her story.** On the way she meets hidden forest events (an owl, a frog…): a pop-up word and a thought, but never a change to her walk. After every trip, also one cut short with Stop, a "Her story" box under the trip report retells it, with true sentences (footprints) and made-up ones (clouds), more of them the bolder she is, and a "Tell it again" button. See [Forest events and her story](#forest-events-and-her-story).

### Fixed internals (never user-set)

Learning rate, network size, reward values, curriculum pace and exploration during practice are fixed. They are shown read-only in the technical tab. The values live in `FIXED` in `src/train.ts`.

**Optimizer memory is not kept.** Lessons use Adam, which keeps running averages of past gradients. These start fresh with every round of lessons, after a reload and after an import; only the weights are kept. Each round therefore starts with a short warm-up of larger steps. This keeps saves and model files to the weights alone.

## User flow

The app is a row of tabs that tells the story in order: Forest, Lessons, Trip alone, Practice, Inside the model. Later tabs unlock when the earlier step is done, and the user can always go back. Practice is optional and sends her back to Trip alone, so users can compare her before and after.

| Tab | What happens | User controls |
| --- | --- | --- |
| 1. Forest | Generate or edit the forest; home is fixed | New forest, a forest code to type in and Generate, all on one line (the page link always carries the forest too), tile editing (path, tree, swamp, wolf den, flowers, treasure), memory size (short / medium / long), home-hint toggle, "Things happen in the forest" (events) toggle and "Show events" (testing); after lessons: small change, big change, new forest with the same Red Riding Hood |
| 2. Lessons | Parents walk her home; the model trains per step | Teacher (mother / father / both / wolf in disguise / mother and sometimes the wolf / crow / Grandma / magpie), lessons to add, watch them or give them all at once; after a change: 30 / 100 / 300 catch-up lessons |
| 3. Trip alone | She walks from a chosen start using the model | Click the start tile, energy (step budget), boldness dial, Next step, Walk through (pause any time), Instant run or Stop (end the trip now, when she goes in circles or keeps bumping into trees), fog toggle, her thoughts toggle, "Show events" (testing); after a trip, "Tell it again" under her story |
| 4. Practice (optional) | Her own runs, scored by a judge; then back to Trip alone to compare | Judge (Grandma / father / mother / crow / magpie / wolf), number of practice runs |
| 5. Inside the model | Numbers and model details for technical users | Read-only views, export or import the model |

The teacher and the judge are each picked from a drop-down list, with a card under it for the chosen one: its picture and a plain line for children ("Just come home safe, dear!"). The exact points a judge gives are not in the panel but in its LM corner card, listed under the card text (`CARD_DETAILS` in `src/explain.ts`): the panel is for children, the LM corner for numbers and technical hints. The same rule holds on every tab: panel lines stay plain ("A swamp can be crossed, but it is slow and tiring.", "Now and then she walks the same test trips alone…"), and the numbers sit in a short list under the LM corner card: energy per step (swamp card), how the parents pick a route and the half-and-half mix (teacher card), the wolf's share of lessons (data poisoning card), what the test trips are (test trips card), and how the practice circle grows (curriculum card). Results of her own trips and training (steps, energy left, scores, home rates) stay in the panel. The Inside the model tab is for technical users and keeps its numbers.

**Rules between tabs**

- Trip alone and Practice stay locked until at least one round of lessons is done.
- Changing the memory size or the home hint requires new lessons; the app says so instead of silently retraining.
- Editing or changing the forest after training keeps the model but shows a note that her lessons are outdated, with changed tiles marked. This is the knowledge-cutoff experiment. Any new round of lessons brings her up to date.
- The trained model and the forest are saved in the browser, so a lesson can continue the next day.

## Visuals

All pictures are simple symbolic SVG shapes drawn for this project, with no tile packs and no external art. The focus stays on the concepts, and everything scales cleanly on a projector.

**Symbol rules**

- One clear shape per tile type: a triangle tree, a plain path, a marked wolf den, a small house with a heart for grandma, wavy blue water with reeds for a swamp, three white flowers with pink middles on stems, a violet cut gem for treasure (yellow is home's, red is hers and danger's), and a red hooded figure for Red Riding Hood (an original design). Her cake is a round brown cake with white icing and a pink cherry.
- Shape plus colour, never colour alone, so colour-blind viewers can tell tiles apart.
- Symbols must read at small sizes, because the same symbols appear as tokens in the memory strip.
- Limited palette: greens and browns for the forest, red only for her and for danger, warm yellow for home, blue for swamp water. Each parent gets its own colour. The judges are figures too: Grandma (white bun, glasses, blue-grey shawl), the parents, a black crow with a yellow beak, a black-and-white magpie with a blue tail and a small gem, and the wolf (his head as a judge; in grandma's shawl and bonnet as a teacher). Grandma, the crow and the magpie are the same figures as teachers and as judges.

**Core displays**

- **Decision arrows:** four arrows around her, thickness showing probability; hover or tap shows the number. The boldness dial visibly flattens or sharpens them before a move is picked. When both parents taught her, arrows are tinted by which parent's habit they come from.
- **Memory strip:** along the bottom, small tiles alternating between view and move, sliding as she walks. It shows exactly what she remembers (her basket, her last steps, as many as her memory size, plus what she sees now) and nothing more; older steps are only a "…". Her basket is three squares at the left end in a gold box marked "pinned" (the cake, crossed out once the wolf took it; flowers and treasure with a count 0, 1 or 2+); the scrolling squares move past them. Not shown on the Forest tab, where she is not walking.
- **Fog toggle:** hides everything except her 3 × 3 window, to show what she actually sees.
- **Bumps and splashes:** on Next step and Walk through, walking into a tree pops up a small "Ouch!" with a yellow bump star at the tree, and a swamp step sends up a few water drops around her feet. The wolf grabbing the cake, flowers and treasure pop up a short word over her ("The wolf took the cake!", "Flowers!", "Treasure!"). Both are just for fun and vanish within a second; Instant run skips them.
- **Forest events:** an event that happens pops up its word over her ("Hoo-hoo!", "Ribbit!") the same way, a row above a basket word on the same step. The spots themselves are never drawn, except as kind numbers in small white circles with a dark border while "Show events" is on.
- **Her story:** a box under the trip report; each true sentence starts with a small brown footprint, each made-up one with a grey dashed cloud and is set in italics.
- **Thought bubble:** a white rounded bubble with two small circles trailing to her head, following her as she walks and kept inside the board (below her near the top edge, and when she sits down lost, so it does not cover the "lost in the woods" note). It is drawn above the fog and the outcome pictures.
- **Energy:** a small bar; as it drops she shows a sweat drop, and at zero she sits down (lost).
- **Coverage heatmap:** an overlay showing where lessons passed, "where she was taught".
- **Changed tiles:** a dashed yellow-and-black edge (shape and colour, no red) on tiles that differ from the forest she was taught on.
- **Lesson playback:** the parent walks ahead of her; when they are given all at once, many faint footprint trails in the parent's colour build up.
- **Outcome chart:** a simple stacked chart of home, home without the cake (hatched yellow, shown in the legend once it happens), eaten and lost over the course of lessons or practice. It is friendlier than a loss curve. Each bar is the same 40 test trips from fixed starts. A job tests after every batch of 25 when short, and less often when long, so it adds about 20 bars (the last batch is always tested). Testing would otherwise take most of a long job's time.

**Outcomes, kept child-friendly**

- Home: hearts at the cottage, a small celebration.
- Eaten: a cartoon wolf pops up and the screen fades. Nothing graphic.
- Lost: she sits down, and a "lost in the woods" note appears.
- **How the trip went:** after every trip (home, eaten, lost, or cut short with Stop), the result also says how *tired* she is (energy used of her budget: still fresh, a bit tired, very tired, or worn out when lost), how *wet* (swamp steps: dry feet, wet feet, soaked) and how *scared* (different wolf dens she saw on the way: calm, a little scared, scared, very scared) and how *bumped* (moves into a tree, each a wrong guess that cost a step of energy and got her nowhere: no bumps, a bump or two for 1–2, a bumpy walk for 3–5, bumped all over). Each has its own symbol (a battery, a water drop, a wolf head, a tree with a yellow bump star). A last row, *Basket*, says what she has at the end ("the cake and a bunch of flowers", "no cake, but 2 treasures", "lost with her" when eaten), how many she picked out of how many the forest has ("picked 1 of 3 flower patches and 2 of 2 treasures", counted even if the wolf ate her afterwards) and when the wolf grabbed the cake, with a "?" for the process-versus-outcome card. The result line at the end of every trip also says the counts ("Home after 23 steps! Picked 1 of 3 flower patches and 0 of 2 treasures."). When she gets home without the cake the result line says so ("Home after 23 steps, without the cake!"), and while she walks without it the status line warns "no cake: the next den is the end!". Its heading, "How was the trip for her?", has a "?" for the trip report card.

**LM corner cards ("?" buttons).** Each card gives one sentence or two of analogy, for example "Her memory strip is her context window: everything she can take into account right now." These cards carry the teaching for non-technical users. They are not shown in the panel on their own: a small round "?" (yellow, with a dark border) sits next to the control, heading or result it explains, and clicking it opens the card as a small popup ("LM corner") right there. The popup closes with ×, Escape or a click elsewhere, and follows its "?" when the panel is redrawn (during a trip on Walk through, for example). Inside a checkbox or radio label, the "?" opens the card without ticking the box. The texts live in `CARDS` in `src/explain.ts`; the popup is `src/ui/hint.ts`.

**Text outside the cards.** Panel text, buttons, the banner and the memory strip are written for older kids: short sentences, everyday words, no "model", "probability" or "token" jargon beyond what the game shows directly. Language-model comparisons and terms (knowledge cutoff, reward hacking and so on) go in the LM corner cards, opened by the "?" next to the text, not in the panel itself. The Inside the model tab is the exception: it is for technical users and uses the real terms.

**How real chatbots do it.** Most cards go on, in the same paragraph, to compare the idea with a real chatbot: one or two short sentences in everyday words, without technical terms beyond the ones the game teaches (tokens, temperature, hallucination and so on): a chatbot's world is text, it reads in tokens, it writes one word at a time and can't take a word back, people rate its answers, it may flatter you because praise gets rated highly. The analogy and the comparison are written as one text, with no separating line or heading, so the card reads as one short explanation that moves from her to chatbots. Each card text lives in `CARDS` in `src/explain.ts` and stays under 300 characters. (This replaces the earlier "How big models do it" dialog and, later, a separate "In a big model" part under a dashed line, so all the teaching sits in one place, next to the thing it explains.)

When something happens that a card explains, that card's "?" pulses (a soft yellow glow, five times; a steady ring with reduced motion) until it is opened or something newer happens. Entering a tab makes the "?" by its title pulse, so new users find the buttons; the Forest tab also says "Each ? shows the language-model idea behind it, and how real chatbots do it."

Where the "?" buttons are, and what makes them pulse:

| Tab | "?" next to | Card | Pulses when |
| --- | --- | --- | --- |
| All | Memory strip label | Context window | |
| All | Pinned basket squares | Pinned tokens: the system prompt and app state never scroll out | |
| All | Outdated banner | Knowledge cutoff, or out of training data for a brand new forest | |
| 1. Forest | Title | The forest as the model's world | Entering the tab |
| 1. Forest | Forest code | The same code gives the same forest: a fixed random seed | |
| 1. Forest | "Edit the forest" | You choose her world, as builders choose a model's training data | |
| 1. Forest | (no own "?"; moving the house) | "Moved home" card after lessons; the "Edit the forest" card before | Painting with the house brush |
| 1. Forest | (no own "?"; flowers and treasure brushes) | | |
| 1. Forest | Swamp note | Swamp eats the energy budget | Painting a swamp before lessons |
| 1. Forest | "Her memory" | Context window | |
| 1. Forest | "Chosen before her lessons…" | Context length is fixed before training | Changing the memory size |
| 1. Forest | Smell of grandma's cake | More useful input | Toggling it |
| 1. Forest | "Things happen in the forest" | Hidden events never change her walk: only input and reward steer a model | Toggling it |
| 1. Forest | "Change the forest after her lessons" | Knowledge cutoff | A change or hand edit after lessons |
| 1. Forest | "New forest, same Red Riding Hood" | Out of training data | Choosing it |
| 1. Forest, 2. Lessons | "Getting home since the forest changed" | Test trips as a benchmark | |
| 2. Lessons | Title | Lessons are pretraining | Entering the tab |
| 2. Lessons | Intro ("she guesses the next move…") and the "Watching…" line | Guess, compare, adjust: next-token training | Watching a lesson |
| 2. Lessons | "The forest changed" / "Since the forest changed" | Catch-up lessons | After catch-up lessons |
| 2. Lessons | "Who teaches her?" | The chosen teacher: training data and its values, the wolf (bad examples), the mix (data poisoning), the crow (copying moves she cannot make), Grandma (example answers that show the whole task) or the magpie (data carries its makers' aims) | Choosing a teacher; after lessons from anyone but one parent alone; after one watched Grandma or magpie lesson |
| 2. Lessons | Lessons to add | More training data, diminishing returns | |
| 2. Lessons | Watch buttons and "She guessed … right" | Watching her learn: next-token accuracy rises with training | Stopping or finishing a row of watched lessons |
| 2. Lessons | "That lesson came from the wolf in disguise…" (after a watched lesson that ends at a den) | Bad examples are learned too | That lesson |
| 2. Lessons | "The crow flew on over a tree…" (after a watched crow lesson that ends at a tree) | Copying moves she cannot make | That lesson |
| 2. Lessons | "How she does alone" | Test trips as a benchmark | |
| 2. Lessons | Heatmap checkbox | What the training data covered | Toggling it; after lessons from one parent |
| 2. Lessons | Known weakness | Exposure bias | After a watched lesson |
| 3. Trip alone | Title and fog checkbox | A view is an input token | Entering the tab; toggling fog |
| 3. Trip alone | Instruction ("Click a path tile to pick where she starts…"); the card says how a move is picked by chance | Sampling | |
| 3. Trip alone | "In a swamp" in the status line (while she stands in one) | Swamp eats the energy budget | Her first swamp step on a trip |
| 3. Trip alone | "Ouch, a tree!" in the status line (right after she walks into a tree) | A wrong guess wastes a step | Her first bump into a tree on a trip |
| 3. Trip alone | "Smells cake" in the status line | More useful input | |
| 3. Trip alone | "No cake: the next den is the end!" in the status line | The cake and the dens: what the judge doesn't measure is given up | The wolf grabbing the cake |
| 3. Trip alone | "Basket: …" in the trip report | Process rewards (treasure at pickup) versus outcome rewards (flowers at home) | |
| 3. Trip alone | "Stopped after N steps." in the status line | Models can get stuck repeating themselves; chatbots have a Stop button and a length limit | Pressing Stop |
| 3. Trip alone | "Her thoughts" checkbox | Her thoughts come after the move, so they are not what made her choose. Real chatbots narrate their steps too, before the answer (which helps), but a stated reason is still not a look inside | Her first thought in a session (unless another card just pulsed); toggling it |
| 3. Trip alone | "Why did she do that?" | The card that fits the trip: home, hallucination, temperature, repetition, energy, swamp, reward hacking, the crow's lessons (she keeps walking into trees towards home), the wolf's lessons or practice, the cake given up, the magpie (as judge or teacher), Grandma's lessons (home with flowers), or process versus outcome rewards | The trip ends |
| 3. Trip alone | "How was the trip for her?" | Answers are rated on more than being right | |
| 3. Trip alone | "Her story" | An answer built from the facts it was given (footprints) plus made-up parts (clouds): hallucination, wilder when bold | The first story in a session; a story with a made-up part (unless a more telling "Why did she do that?" card just pulsed) |
| 3. Trip alone | "Tell it again" | Regenerating: the same facts, a new telling, new mistakes | |
| 3. Trip alone | "Her next move" (while walking) | Next-token probabilities | Choosing a start |
| 3. Trip alone | Energy, Boldness | Maximum output length, temperature | Moving the slider |
| 4. Practice | Title | Practice is fine-tuning from feedback | Entering the tab; starting practice |
| 4. Practice | "Who judges?" | The judge decides what she learns | |
| 4. Practice | The chosen judge's line (in the judge card) | The chosen judge's card, followed by how that judge scores a run, in points | Choosing a judge |
| 4. Practice | Watch buttons and "In the last run … gave it … points" | One score for a whole run, as in RLHF | Watching one run |
| 4. Practice | "Run … of …" line while watching | Sampling: each move picked by chance | |
| 4. Practice | "Where does she start?" and the line under it | Curriculum learning, and what happens without it | Changing the switch |
| 4. Practice | "How she does alone" | Test trips as a benchmark | |
| 4. Practice | "Same … test trips: after lessons … after practice …" | Lessons first, then practice: the usual recipe | |
| 4. Practice | "What … taught her" (after practice) | Reward hacking, teacher versus judge, bad judge (wolf), the magpie, the cake given up (father, when she gets home without it in over 5% of test trips and at least 5 points more often than before this practice), fixing bad data, or the general judge card | Practice ends |
| 5. Inside the model | Title | The real numbers | Entering the tab |
| 5. Inside the model | Vocabulary, Training data, Look-alike tokens, Current input, Her latest trip, Network, Loss curves, Training compute, Fixed settings, Export and import | Vocabulary, token frequency, context-dependent tokens, one-hot inputs, uncertainty and sampling, weights, loss, training cost, hyperparameters, shared model files | |

After a trip, the "Why did she do that?" text is a small note at the bottom of "How was the trip for her?", with its "?" for the card that fits. When she walks into a den after wolf lessons or wolf practice, it says the wolf taught her.


**Layout.** Designed for a wide screen first: the forest square as large as the window height allows, with the memory strip under it, and a side panel with the current tab's controls. The forest column is only as wide as the square; the panel takes the rest of the width (at least 432px, at most 720px, so its text stays readable), and the pair is centred on very wide screens. A phone layout can come later.

## Technical tab: Inside the model

The last tab shows the real numbers behind the friendly visuals, for technical users. It is read-only except for export and import.

- **Vocabulary:** every input and output token with its ID, how often it came up in lessons (dashed when seen fewer than 5 times), "×n" for look-alike views and "≠" where the right move depends on the place.
- **Training data:** how many lesson predictions were made from each input token, as a rank-frequency bar chart (most common first), with how much the most common tenth of the tokens covers and how many were never or rarely seen. Counted from the heatmap: every lesson position but the last (home or a den) is one prediction.
- **Look-alike tokens:** views that occur in several places where no single move is the teacher's best at every place, for the careful mother and the hurried father (the wolf walks home like the father), the share of her lesson predictions made on them, and each such token with the teacher's best move at each of its places. Only memory, or the smell of cake, can tell these apart.
- **Current input:** the context window at the selected step, encoded as numbers: the pinned basket first, then the current view, the home hint and the remembered steps.
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

**Her basket (done)**

- Cake, flowers and treasure, with the basket pinned at the front of her context; shortcut dens and basket tiles in the generator; the magpie judge and basket points for Grandma, the parents and the wolf. Rules, judges and measurements are in the sections above.

**Crow, Grandma and magpie teachers (done)**

- The crow, Grandma and the magpie as teachers, so the teachers are the same cast as the judges. Each has its card and its "Why did she do that?" note; the crow also a warning after a watched lesson that ends at a tree. Rules and measurements are under Phase 1.

**Forest events and her story (done)**

- Hidden forest events from a data file, seeded per forest; pop-up words and thoughts on a trip alone; her story after each trip with true and made-up parts by boldness, and "Tell it again". Rules and measurements are in [Forest events and her story](#forest-events-and-her-story).

### Her basket

She carries a basket. What is in it is shown to the model as **pinned tokens**: three inputs at the front of her context that never scroll out, unlike the views and moves in her memory. This is the split real chatbots have between the conversation, which scrolls out of the context window when it gets too long, and the system prompt and the state their software puts back in every turn, which stay.

| Item | Pinned token | Rule | Who pays | Lesson |
| --- | --- | --- | --- | --- |
| Cake | yes / no | She starts with it. The first den she steps onto takes it; any den after that eats her | Grandma and the mother take points off when it is lost; the father does not care | What the judge does not count gets given up: the father's practice learns "shortcut through the den, the wolf can have the cake" |
| Flowers | 0 / 1 / 2+ | Stepping on a patch picks them, once per trip | Grandma, only when she gets home with them | Outcome reward: points only for the finished task |
| Treasure | 0 / 1 / 2+ | Stepping on it picks it up, once per trip | The father a little, the magpie a lot, at pickup, kept even if she never gets home | Process reward, and a judge that measures right but wants the wrong thing most |

Three kinds of judge problem sit side by side, each with its own card: the **crow** measures badly (reward hacking), the **magpie** measures right but wants the wrong thing most, and the **father** measures right but does not measure everything.

- Tiles do not change during a trip (a picked patch stays and simply counts once), so distance maps, views and the vocabulary stay fixed per trip. On the board only, a picked patch or treasure is drawn faded until the trip ends (on a trip alone, a watched practice run and a watched lesson); her view still shows it as before.
- Shortcuts through dens can only come from practice: no teacher shows them. Detours for flowers or treasure come from practice with the parents' and the wolf's lessons, which never show them (a parent may walk over an item that lies on the way, but never goes out of the way for one), or from Grandma's and the magpie's lessons, which do: the same behaviour learned from examples or from a judge.
- Code: `BasketState`, `Basket` and the step rules in `src/world.ts`; the pinned inputs in `encodeContext` (`src/tokens.ts`); the basket points in `judgeRewards` (`src/train.ts`); placement in `placeBasketTiles` (`src/forest.ts`).
- Save version 3: older saves and model files no longer load; edited-forest links use a new `map3` parameter (older `map` links open the forest from its code, unedited). Tiles are 7 kinds; `packTiles` fits 8.

**Tried and dropped.** The plan had a "Basket in memory" switch (like the home hint): with it off, she would only have the pickup in her scrolling memory and with short memory walk back to emptied spots. Measured (16 codes, father's lessons, short memory, 3000 magpie or 8000 father runs), it made no clear difference: trips that walk back onto a picked spot were 1% or fewer either way, and home, eaten and lost matched within a point. So the switch was dropped and the basket is always pinned. For the same reason the planned mapping rows "same view, different move with or without the cake" and "forgetting she already picked something up" were not added: next to a den, her chance of stepping in was 9.3% with the cake and 8.8% without after 8000 father runs (7.3% for both before practice), so she barely uses the cake token. Losing the cake is too rare in practice for her to learn what it means. Grandma's lessons are different: there the flowers token decides her next move (see Phase 1).

**Not measured again with the basket:** the curriculum numbers and the share of the wolf's lessons that end at a den.

### Forest events and her story

The forest is full of little events she cannot see: an owl, a frog, an empty hut. They are hidden, they never change her walk or any judge's points, and walking through one makes it happen. After every trip alone a short **trip story** retells what happened, from her trip record and the events she met, mixed with bits the storyteller **makes up**. True parts and made-up parts carry different marks, and the bolder she is, the more is made up.

This is the game's clearest hallucination lesson. The storyteller is like a chatbot answering from what it was given: the trip record is the facts in its input, and where it fills in from imagination it says things that sound just as true. At medium boldness it borrows events from this forest that she never reached (believable lies, the hardest to spot, like real hallucinations, which are built from things the model knows); at high boldness it adds pure fantasy (temperature). A second lesson sits with the events themselves: she cannot see them and nobody scores them, so they never change what she does, just as only a model's input and what its training rewarded steer what it writes.

**Rules**

- **Placement.** Each forest gets 18 event spots (`SPOT_COUNT`). Measured over 32 forest codes after 100 lessons from either parent (default energy and boldness, the 40 test-trip starts), an average trip meets 2.2 events: none on 14% of trips, 1 on 24%, 2 on 24%, 3 on 18%, 4 or more on 20%. (12 spots, as first proposed, gave 1.6.) The number of spots does not grow with the cast: as more kinds are added, each forest gets a different mix of them. Spots come from their own seeded stream, `story:` + code + size, worked out from the current tiles: the same forest code always has the same events in the same spots, so a class can compare ("did yours meet the owl?"). Forest codes, the tiles, saves and links do not change. Editing or changing the forest works the placement out again from the new tiles, so a spot whose tile is no longer walkable drops out and other spots may move.
- **Spots first, then kinds.** Placement first picks the spots from the tiles alone (shuffled path and swamp tiles, taken one by one while none is within another's 3 × 3 view), then gives each spot a kind that fits its place and is not used yet in this forest, from a second seeded stream (`storyKinds:` + code + size, one draw per spot). A kind with its own place goes first, and the "anywhere" kinds fill the rest, so they do not take the rarer spots. Adding or removing kinds in the data file never moves the spots, only changes which events sit on some of them. It still changes the events of existing forest codes; say so in the pull request that changes the cast. A spot where no unused kind fits stays empty.
- **Where they go.** On path or swamp tiles only, never on a den, home, flowers or treasure; at most one spot of each kind per forest; no two spots within each other's 3 × 3 view. Each kind has a place it fits (see the data file below), so stories hang together: a frog by a swamp, paw prints near a den, a hut in a quiet corner, Grandma's cat near the house.
- **Measured placement** (32 forest codes): 16.2 of the 18 spots get a kind on average. The hut and the mole (quiet corners only, about 3 free per forest) are left out of 23 and 22 of the 32 forests, Grandma's cat of 7, the echo of 4, the frog of 2 and the paw prints of 1; every other kind is in every forest. So the hut and the mole are the rare finds.
- **What sets one off.** Most events happen when she steps onto the spot (not when she starts there, and not when she stays on it after bumping into a tree). Sound events (*hear* in the cast) happen when the spot comes into her 3 × 3 view (one already in view at the start waits until it comes into view again). Each spot happens at most once per trip.
- **Same spot, varying outcome.** How an event turns out is picked when it happens, from its 2–3 versions (the owl asks a riddle, or is fast asleep), using the story's own randomness. Like her thoughts, events and the story never use the walk's randomness, so they never change her walk.
- **No effect on anything else.** `step()`, her views, the vocabulary, lessons, practice and every judge's points stay as they are (a test walks the same trips with and without events and compares the positions and every judge's points). Events happen on a trip alone only; lessons and practice (watched or not) ignore them.
- **Events on or off.** A checkbox in the Forest tab's options, "Things happen in the forest", on by default, kept in the browser save with the other settings (not in links; no save-version bump, a missing setting means on). With it off there are no event spots, pop-ups or event thoughts, and the story tells only her own trip (start, basket, wolf, swamps, bumps, ending) and its made-up parts.
- **"Show events" button (for testing).** On the Forest tab (under the checkbox) and the Trip alone tab (in the settings box), shown while events are on. It toggles each spot's kind number on its tile, in a small white circle with a dark border at the tile's lower right, drawn above the fog; hovering a number names the event. It is off by default and not saved. Event spots are otherwise never drawn on the board. It may be removed or hidden once the events are well tested.

**During the trip** (Next step and Walk through; Instant run skips both, but the story still has the events)

- A short pop-up word over her when an event happens ("Hoo-hoo!", "Ribbit!"), like "Flowers!", gone within a second; above a basket word when both happen on the same step.
- A thought line, treated like a basket event: always worth a thought, but keeping the 2-step gap after her last thought. An event that has to wait gets its turn within 3 steps, or is forgotten.

**The story after the trip**

- A "Her story" box under "How was the trip for her?", with a "?" for the story card, on every trip end (home, eaten, lost, or Stop).
- Built from the trip record, in order: an opening (where she set out: "by a muddy swamp", "from a quiet dead end", "not far from a wolf den"), one sentence for each event she met, in the version that happened, her basket (flowers, treasure, the wolf grabbing the cake), at most one sentence each about swamps and bumps, made-up sentences slipped in anywhere in between, and the ending ("And at last she knocked on Grandma's door.", "…sat down under a tree for a long nap.", the wolf, nothing graphic, or "And there the story stops, somewhere in the forest." after Stop). It closes with one line naming who shaped her: the judge she practised with most if she had practice, otherwise the teacher she had most lessons from ("The magpie had taught her that shiny things matter most.").
- At most 7 sentences before the closing line. When there is more to tell, the sound events go first (the last ones first), then the bumps, then the swamp, leaving room for the made-up parts expected at this boldness, so a retelling keeps the same true parts; if it is still too long, fewer made-up parts (at least one). The ending, the basket, the wolf and the events she stepped on always stay, even if that makes it longer.
- **Marks.** Each true sentence starts with a small brown footprint, each made-up one with a grey dashed cloud and is set in italics (shape plus colour, plus the type). A line under the story counts them ("7 true, 1 made up"; the closing line counts as true).
- **What may be made up.** Only extra happenings in the middle. The start, the basket, the wolf and the ending always come from the record, so a made-up part never changes how the trip ended.
- **How much is made up.** The boldness set when the story is told (0.1–2.5, 0.7 by default):
  - below 0.5: nothing;
  - 0.5 up to 1.2: borrowed events: on average 0.5 made-up sentences at 0.7 (one in every other story) and 1 at 1.0. A borrowed event is a kind placed in this forest that she did not meet on this trip (with events off, any kind from the cast), told in one of its versions;
  - from 1.2: borrowed events and pure fantasy, more of both as boldness rises: on average 4 / 3 at 1.2 up to 4 at 2.5 (capped by the story length), with fantasy a growing share (0 at 1.2, 60% at 2.5).
  - **Measured** (32 forest codes, 100 lessons from either parent, 2560 trips at the default energy and boldness 0.7, each story told at every boldness): 0.3: 0% made up; 0.7: 8% of sentences (0.50 per story, in 50% of stories); 1.0: 14% (1.00 per story); 1.5: 24% (1.81 per story, 0.26 of them fantasy); 2.5: 38% (3.02 per story, 1.82 fantasy), about 3 of the 7 story sentences.
- **Tell it again.** A button under the story tells the same trip again at the boldness set now: the true parts, how each event turned out and their order stay; the wording and the made-up parts are new. Walking again from the same tile makes a different trip, so a different story.
- The story's "?" pulses at the first story in a session, and when a story has a made-up part unless the trip's "Why did she do that?" card (other than the plain "home" one) just did.

**The event data file.** The cast will grow, so it lives in its own data file, `src/data/storyEvents.json`, not in code: adding an event means adding an entry there, with no code change, as long as it uses a place and a trigger the code already knows. The code imports it (Vite reads JSON directly; `tsconfig.json` has `resolveJsonModule`), so it is built into the page and the game still needs no server.

- Each entry: `id` (the kind number), `name`, `fits` (one of the places below), `trigger` (`step` or `hear`), `versions` (2 or more story sentences), `thoughts` (1 or more lines in her voice), `popup` (one short word or two). The file also holds the `fantasy` sentences and all other story wording (`openings` per place, `basket`, `swamp`, `bumps`, `endings`, and the `shapedBy` closing lines per teacher and judge), so all story wording is in one place.
- Places the code knows: `anywhere`, `swamp` (a swamp, or a path next to one), `den` (within 2 steps of a den, counted along the grid), `home` (within 4 steps of home, walking), `deadEnd` (one way out, or a quiet corner off both parents' routes: true dead ends are rare, about 0.3 per forest, so the quiet corners the basket items use count too), `corridor` (two ways out, straight), `crossing` (3–4 ways out, not in a meadow), `open` (3–4 ways out, crossings and meadows). A way out is any neighbour that is not a tree or the map edge. The story's opening uses the first place that fits her start, in the order den, swamp, home, dead end, crossing, open, corridor, anywhere. A new place needs a few lines of code (`placeTests` in `src/storyEvents.ts`), an `openings` entry and a line here.
- **Kind numbers are permanent.** A new event takes the next free number; numbers are never reused or renumbered, so the number the "Show events" button draws always means the same event. A removed event leaves a gap.
- A test checks the file (`checkStoryData`): unique ids, a known place and trigger for each, at least 2 versions and 1 thought, short pop-ups (16 characters at most), no empty strings, and every story list filled. A wrong entry fails `npm test`, not the game.
- Later, if it ever helps: a `weight` for rare events, and events that only some versions of the forest offer.

**The cast.** Numbers are the kind numbers the "Show events" button draws.

| # | Event | Fits | Set off | Versions (story sentence) | Pop-up |
| --- | --- | --- | --- | --- | --- |
| 1 | Owl | Anywhere | Hear | An owl hooted "Who-who?" from high in a tree. / An owl asked her a riddle, and she got it right. / An owl was fast asleep and snored softly. | Hoo-hoo! |
| 2 | Frog | Swamp, or path next to one | Step | A frog on a lily pad croaked hello. / A frog sang her a bubbly song. / A frog jumped right over her boots. | Ribbit! |
| 3 | Empty hut | Dead end (one way out) | Step | She found a tiny empty hut with a mossy roof. / She peeked into a little hut: just a broom and a teapot. / A little hut had a sign on the door: "Back soon". | A hut! |
| 4 | Paw prints | Within 2 steps of a den | Step | She spotted big paw prints in the mud and walked a bit faster. / She counted the paw prints in the mud: far too many! | Paw prints! |
| 5 | Growl in the bushes | Within 2 steps of a den | Hear | Something growled in the bushes. / Something growled in the bushes; it was only a grumpy badger. | Grrr… |
| 6 | Grandma's cat | Within 4 steps of home | Step | Grandma's cat came to meet her, purring. / Grandma's cat walked with her for a while. / Grandma's cat watched her from a stump and yawned. | Meow! |
| 7 | Squirrel | Anywhere | Step | A squirrel dropped a nut on her hood. / A squirrel raced her along the path and won. | A squirrel! |
| 8 | Mushroom ring | Open ground (a crossing or meadow, 3–4 ways out) | Step | She found a ring of mushrooms and hopped around it once. / She stood in a ring of mushrooms and made a wish. | Mushrooms! |
| 9 | Butterflies | Open ground | Step | A cloud of yellow butterflies danced around her. / A butterfly sat on her basket for a ride. | Butterflies! |
| 10 | Woodcutter | Anywhere | Hear | Far away, someone was chopping wood. / She heard someone chopping wood and whistling a tune. | Chop, chop! |
| 11 | Lost mitten | Anywhere | Step | She found a lost blue mitten and hung it on a twig for its owner. / She found a tiny mitten, much too small for her. | A mitten! |
| 12 | Hedgehog | Corridor (two ways out, straight) | Step | A hedgehog crossed the path, very slowly. / A hedgehog rolled into a ball when it saw her. | A hedgehog! |
| 13 | Deer | Open ground | Step | A deer looked up at her, then bounded away. / A deer and her fawn were nibbling grass. | A deer! |
| 14 | Fallen log | Corridor | Step | She balanced along a fallen log. / She climbed over a fallen log covered in moss. | Wobble! |
| 15 | Rain shower | Anywhere | Step | A little rain shower came, and she waited under a big leaf. / A short rain fell, and then a rainbow came out. | Rain! |
| 16 | Mole | Dead end | Step | A mole popped out of the ground, blinked and went back down. / A mole poked its nose out of a molehill. | A mole! |
| 17 | Echo | Crossing (3–4 ways out) | Step | She shouted "Hello!" and the forest shouted back. / She sang a song, and the echo sang along. | Hello-o-o! |
| 18 | Woodpecker | Anywhere | Hear | A woodpecker drummed: knock, knock, knock. / A woodpecker was busy making a new door in a tree. | Knock knock! |

Fantasy sentences (from boldness 1.2): "A dragon asked her the way to the sea." / "She rode a goose over the treetops for a while." / "A talking mushroom told her a joke." / "The trees bowed to let her pass." / "She found a door in a tree, and behind it the mice were having a tea party." / "The moon came out at noon to say hello." Each event also has one or two thought lines in her voice ("Who's there? Just an owl.", "A hut! Nobody home.").

**Code**

- `src/data/storyEvents.json`: the cast and all story wording.
- `src/storyEvents.ts`: loads, types and checks the data file, the place tests, seeded placement (`eventSpotTiles`, then `placeStoryEvents`), and what a trip sets off (`eventsSetOff`, and `EventTracker` step by step, which picks each event's version); no DOM.
- `src/story.ts`: `tellStory` builds the story from the trip record, the events met, the boldness and the story's own randomness, with each sentence marked true or made up; no DOM.
- `src/thoughts.ts`: says an event's thought line. `src/explain.ts`: the events, story and "Tell it again" cards. `src/ui/app.ts`: the checkbox, the "Show events" button, the pop-up words and the story box; `src/ui/board.ts`: the event numbers layer; `src/ui/symbols.ts`: the footprint and cloud marks.
- Settings: `events: true` by default. "Show events" is not saved.

### Next: events that change her basket, and new places each trip (planned)

Not built yet. This is the plan; move each part into [Forest events and her story](#forest-events-and-her-story) and the sections above when it is built, and replace the proposed numbers with measured ones.

**Idea.** A few new forest events do something to her basket: a fox snatches the cake, Grandma's neighbour gives her flowers, a magpie drops a treasure. Every event so far stays harmless. The two kinds side by side make one lesson from both ends: the owl is not in her input, so her walk does not change; the fox changes what is pinned in her memory (the basket tokens), so her next steps change. After Grandma's lessons, flowers from the neighbour make her turn for home as if she had done the errand herself; without the cake, the next den is the end.

This is a chatbot reading whatever lands in its context: a search result, a pasted text, a tool's answer. It acts on it, true or not, and a planted instruction (prompt injection) steers it the same way.

**Events stay optional.** Basket events are forest events, so the same Forest tab checkbox, "Things happen in the forest", turns them off with all the others; there is no second switch. With it off a trip alone is exactly as before: no spots, no pop-ups, no effects, and the story tells only her own trip. Lessons, practice and the test trips never have events, whether the checkbox is on or off, so the charts and every measured number stay comparable.

**Fixed places or new each trip.** A second checkbox under "Things happen in the forest", shown while it is on: "New places every trip", off by default.

- *Off (fixed, as now):* the events sit in the same places for every trip in a forest code, so a class can compare ("did yours meet the owl?"), and "Show events" shows them on the Forest tab before any trip.
- *On (new each trip):* each trip alone places the events afresh when she starts, by the same rules (spots first, then kinds that fit, one per kind, none within another's view), from the story's own randomness instead of the forest code. Nobody can learn where the fox lives; it is a real surprise every time. Like asking a chatbot the same question twice and its search bringing back different pages: it acts on whatever it gets this time.
- In both modes events stay out of lessons, practice and test trips, so this changes nothing she learns or any measured number. Either way she cannot see the events, and the walk's randomness is never touched: a trip from the same start with the same walk randomness walks the same in both modes, except where a basket event changes her basket.
- "Show events": with fixed places, as now. With new places, the Forest tab button is hidden (there is nothing to show before a trip; a muted line says "The events move to new places on every trip.") and the Trip alone button shows this trip's places once she has started.
- Made-up parts of her story borrow from the events placed for this trip (fixed or new), so a borrowed event is still one that "was in the forest" that time.
- Kept in the browser save with the other settings (not in links; a missing setting means off; no save-version bump). It is not part of the forest, so a forest link always opens with each user's own choice.
- Its card (draft, under 300 characters): "Off, the owl always lives in the same tree. On, the events move every trip, so you never know what she will meet. A chatbot's world is like that too: the same question can bring back different search results, and it works with whatever it gets."
- Code: `placeStoryEvents` takes the seed label (`story:` + code + size for fixed places, a random number from the story's randomness for new ones); the trip keeps its own placement for the story and "Show events".

**Rules**

- **Trip alone only.** Effects never happen in lessons (the teachers would have to react to events she cannot see), in practice (the judges would score luck: flowers from the neighbour would earn Grandma's points, and a cake taken by the fox would cost −0.5 blamed on her own moves) or on test trips. So she never trained on them: a stolen cake in mid-forest is new to her, like a model meeting something its training never showed.
- **The effect belongs to the kind, not the version.** The fox always takes the cake; only the wording varies. Whether an event happens depends only on where she walks, so the walk stays reproducible from the walk's own randomness; the story's randomness still picks only the wording.
- **Effects the code knows** (a new data-file field, `effect`, like places and triggers):
  - `takeCake`: the cake is gone (the basket's cake token turns to no), exactly as when the wolf grabs it, so the next den eats her. Without the cake there is nothing to take: the event still happens, told with one of its `quiet` versions ("The fox sniffed her empty basket and trotted off."), and nothing changes.
  - `giveFlowers`: one bunch of flowers into her basket (the flowers token counts up, 0 / 1 / 2+), as if she had picked a patch.
  - `giveTreasure`: one treasure into her basket.
- **When it takes effect.** Right after the step that sets it off, before her next move: the basket she reads at the next step already shows it (in the memory strip's pinned squares too).
- **Placement.** The same spots and the same rules as the other events: the new kinds only change which events sit on some spots, never the spots themselves. Adding them changes the events of existing forest codes; say so in the pull request.
- **No save-version bump.** No new tile kind and no new model input: the cake, flowers and treasure tokens already exist.

**The new kinds (draft, for review).** The next free kind numbers.

| # | Event | Fits | Set off | Effect | Versions (story sentence) | Quiet versions | Pop-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 19 | Sly fox | Within 2 steps of a den | Step | `takeCake` | A sly fox pretended to be lost, and while she showed it the way, it ran off with the cake. / A fox snatched the cake from her basket and vanished into the bushes. | The fox sniffed her empty basket and trotted off. | A fox! |
| 20 | Grandma's neighbour | Within 4 steps of home | Step | `giveFlowers` | Grandma's neighbour waved from her garden and gave her a bunch of flowers. / A kind old neighbour picked some flowers for Grandma and put them in her basket. | | Flowers! |
| 21 | Magpie's gift | Open ground | Step | `giveTreasure` | A magpie dropped something shiny into her basket: a treasure! / A magpie gave her a glittering stone, then flew away laughing. | | Shiny! |

Thoughts in her voice: "Hey! My cake!", "Thank you! Flowers for Grandma.", "Ooh, shiny!".

**What it changes elsewhere**

- **Her basket on a trip.** `Walker` gets the event effects applied after each step (a small hook it calls with the step's positions), and records them as `effects` (step and effect), so the trip record, the status line ("no cake: the next den is the end!" also after the fox), the trip report and the memory strip all show them. The trip report's basket row names the source: "the fox took the cake at step 7", "picked 1 of 3 flower patches, plus a bunch from Grandma's neighbour". The "picked … of …" counts stay pickups from tiles only.
- **Why did she do that?** When she is eaten after the fox took the cake: "The fox took the cake at step 7, so the next wolf den was the end." When she heads home right after the neighbour's flowers after Grandma's lessons: a note that the flowers in her basket told her the errand was done.
- **Her story.** An effect event she met is always told (like the basket and the wolf), in the version that happened, and stands in for a basket sentence. A made-up part is never an effect event: a borrowed "the fox stole her cake" would contradict how she arrived, and made-up parts never change the basket or the ending.
- **Pop-ups and thoughts** as for the other events; the cake pop-up uses the crossed-out cake icon, the gifts the flower and gem icons.
- **Tests change.** "A trip walks the same with events on and off" holds for the harmless events only. New tests: an effect kind changes the basket at the right step and only once; `takeCake` without the cake changes nothing; a trip with effect events is reproducible from the same walk randomness and spots; with events off nothing differs from before; lessons, practice and test trips never apply effects; a made-up sentence is never an effect event.

**Mapping row (to add when built)**

| In the game | In a language model |
| --- | --- |
| A fox takes the cake, a neighbour gives flowers: events that change her pinned basket, so her next steps change | Text that lands in a chatbot's context (a search result, a tool's answer, a prompt injection) steers what it writes, true or not |
| "New places every trip": events move between trips | The same question can bring back different search results; the model works with whatever it gets |

**LM corner card (draft, under 300 characters).** *Basket events* (by "Things happen in the forest" too, and on the status line or story after one; pulses at the first basket event in a session): "The owl doesn't change her walk, but the fox does: it changed her basket, which she reads at every step. A chatbot is the same: whatever lands in its context, a search result or a planted instruction, steers what it writes, true or not."

**Numbers to measure** (32 forest codes, 100 lessons from the mother, from the father and from Grandma, default energy and boldness): how often each new kind is placed and met per trip; home, home without the cake and eaten with events on against off (the fox's cost); after Grandma's lessons, how often she turns for home within 3 steps of the neighbour's flowers, against a trip where she has picked them herself. Put the numbers in the pull request.

**Build order** (each step its own commit; the design doc updated as parts are built)

1. New places every trip: the checkbox and its card, placement from a seed label, the trip's own placement for "Show events" and the story, and tests (the same seed gives the same placement; new places differ between trips; fixed places are unchanged).
2. Data and effects: the `effect` field and `quiet` versions in the data file and its test, the three kinds, the effect hook in `Walker` and `effects` on the trip, and the tests above.
3. Trip alone: pop-ups, thoughts, the status line, the trip report's basket row, "Why did she do that?", and the basket-events card.
4. The story: effect events always told, never borrowed.
5. Measure (also: events met per trip with new places against fixed), then move the finished parts into [Forest events and her story](#forest-events-and-her-story) and the sections above.

**Not in this plan.** Events that change her energy (a snack, a stumble): energy is not in her input, so she cannot react to them, and on short trips ±5 energy rarely changes how a trip ends. They fit better with the berry bush below, once energy is a pinned token she can sense.

### Later

- A simple "inside her head" network picture on the main screens
- Two models side by side for comparison
- Berry bush that restores energy (+15, once per trip), with her energy level as an extra pinned token in her basket (a "how tired am I" sense, like a model knowing its remaining output budget); it would be the 8th and last tile kind the link format fits. Parents never teach the detour, so only practice can discover it: fine-tuning learning behaviour that was never in the training examples. With energy pinned, forest events that change her energy (a snack, a stumble) would also become worth adding, since she could then sense them
- Phone layout
- A pickup action: a fifth output, "pick up", instead of picking items up just by stepping on them. It is like a chatbot choosing to call a tool instead of writing the next word, and each pickup becomes a choice a judge can reward on its own. Costs: the model's outputs, vocabulary and save files change (a save-version bump), and it needs an energy cost per pickup, a decision whether the parents ever demonstrate it, and the judges' basket points measured again

### Open questions

- Whether to keep Adam's running averages with the model (smoother training across rounds and "Watch one lesson", but bigger saves and model files and a save-version bump), or keep resetting them each round as now.
- Exact default grid size and the three memory-size values, to be tuned once it runs.
- Pacing of the outcome animations.
- Whether a teacher's guide (one page of lesson flow for presenters) belongs in the repo.
