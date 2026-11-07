/** The "Why did she do that?" note after a trip, and the LM corner cards. */
import type { Walker } from './sim';
import { TrainStats, headsHome } from './train';
import { buildVocabulary, viewKey } from './tokens';
import { Forest, MOVE_NAMES, SWAMP, SWAMP_COST, VIEW_OFFSETS, WOLF, tileAt, walkingDistances, xyOf } from './world';

export type CardKey =
  | 'forest' | 'view' | 'memory' | 'memorySize' | 'hint' | 'lessons' | 'teacher' | 'coverage' | 'arrows'
  | 'boldness' | 'energy' | 'hallucination' | 'repetition' | 'exposure' | 'practice' | 'outdated' | 'home'
  | 'tech' | 'vocabulary' | 'judge' | 'swamp' | 'tree' | 'thoughts' | 'stop'
  | 'tripReport' | 'judgeGrandma' | 'judgeFather' | 'judgeMother' | 'judgeCrow' | 'rewardHacking' | 'teacherVsJudge'
  | 'wolfTeacher' | 'poisonedData' | 'judgeWolf' | 'fixBadData'
  | 'newWorld' | 'catchUp' | 'forestCode' | 'editForest' | 'recipe'
  | 'compute' | 'tokenFreq' | 'ambiguous' | 'uncertainty'
  | 'moreData' | 'guess' | 'watchMany' | 'runScore' | 'testTrips' | 'sampling' | 'curriculum' | 'oneHot' | 'weights' | 'loss' | 'hyper' | 'modelFile';

export const CARDS: Record<CardKey, string> = {
  forestCode: "The same forest code always makes the same forest, so a whole class can share one forest and compare how their Red Riding Hoods do. Chatbot builders note their starting setup too, so they can run a training again and compare fairly.",
  editForest: "You decide what her world looks like, and so what she can learn from it. The people who build a chatbot do the same with its text: they take out junk, copies and harmful pages, and add more of what they want it to be good at.",
  recipe: "Lessons first, then practice. Lessons show her the way; practice teaches her to manage on her own, even after a wrong step. Chatbots are made the same way: first lots of reading, then example answers, then practice with people rating the answers.",
  compute: "Every guess she learns from costs a few sums for each of her weights. Add them all up and you get the cost of her training. Training a big chatbot takes billions of times more sums: thousands of special chips running for months.",
  tokenFreq: "Some views came up hundreds of times in her lessons, some never. She is good at the common ones and only guesses at the rare ones. In real text a few words like \"the\" are everywhere and most words are rare, so chatbots know common things well and rare things less.",
  ambiguous: "Some views look the same in different places, but the right move is different. Only remembering where she came from can tell them apart. Words do this too: \"play\" means something else in \"play football\" and \"a school play\". Only the words around it tell which.",
  uncertainty: "At some steps she is sure, at others she is torn. Mostly she takes her top choice, but now and then chance picks another, so every walk is a little different. A chatbot is the same: every word is a small gamble, so the chance of it writing one exact long answer twice is tiny.",
  forest: "The forest is her whole world, and she only ever sees a small piece of it at a time. A chatbot's world is text: books, websites and more, far more than anyone could read in a lifetime. It only knows what was in that text.",
  view: "What she sees around her (a 3 × 3 window) is one input token. A chatbot reads text in small pieces called tokens too: a word, part of a word, or a comma.",
  memory: "Her memory strip is her context window: everything she can take into account right now. A chatbot's context window holds your message and its answer so far; for each new word it looks back and picks out the parts that matter.",
  memorySize: "Memory size is fixed before training, like a model's context length. Changing it means training a new Red Riding Hood. A chatbot can remember a whole book or more, but there is always a limit.",
  hint: "The smell of grandma's cake gives her one more useful input, so she guesses better. A chatbot also answers better when you give it more useful information, like a clear question or a document to read.",
  lessons: "Lessons are pretraining: she learns by predicting the next move in many example walks. A chatbot first reads a huge amount of text, guessing each next word. Then people show it good example answers, so it learns to chat.",
  teacher: "Who teaches her shapes how she behaves. The people who build a chatbot choose what text it learns from, and that choice shapes how it talks and what it thinks is normal, biases included.",
  coverage: "The heatmap shows where she was taught, and it never covers everything equally. A chatbot's training text doesn't either: it knows a lot about common topics and less about rare ones, like small languages.",
  arrows: "The thickness of the arrows shows how likely each move is: these are the next-token probabilities. A chatbot gives a chance like this to every word it knows, not just four moves, each time it picks the next word.",
  boldness: "Boldness is temperature. Low boldness makes her pick the likeliest move; high boldness makes her take more chances. Chatbots have the same setting: low gives safe, plain answers; high gives more surprising ones, with more mistakes.",
  energy: "Energy is her step budget, like a model's maximum output length. When it runs out, she stops wherever she is, just as a chatbot's answer stops mid-way when it hits its length limit.",
  hallucination: "She walked confidently into danger in a place she was hardly taught. Ask a chatbot about something it hardly saw and it may still answer smoothly and confidently, and be wrong. That is called hallucination: sounding sure is not knowing.",
  repetition: "She went round in circles. With a short memory, look-alike places all seem the same. Words look alike too: \"bank\" can be a river bank or a money bank. A model that sees too few of the words around it gets confused and can repeat itself.",
  exposure: "Lessons were always perfect, so she never learned how to recover after a wrong step. A chatbot reading only finished text never sees its own slips either, so one wrong word can lead it astray. Practice on their own helps both.",
  practice: "Practice is fine-tuning from feedback: she tries on her own and each whole run is judged. A chatbot practises too: it writes its own answers, people rate them, and it leans towards the answers they liked. This is called RLHF.",
  outdated: "The forest changed after her lessons, but she didn't, so in the new parts she makes confident mistakes. That's a knowledge cutoff: a chatbot learns from text up to a certain date. Ask about later news and it may not know, or may guess wrong.",
  newWorld: "She has never seen this forest, but she still walks with confidence. A language model asked about something far from its training data also answers confidently, and is often wrong.",
  catchUp: "Catch-up lessons in the changed forest bring her up to date without starting over. Most of what she knew still works, so a few lessons already help a lot. Chatbots are kept up to date the same way: more training on newer text, not starting again.",
  home: "She got home one predicted step at a time. A chatbot writes the same way: one word, then it reads everything again to pick the next. It never sees the whole answer in advance and can't take a word back.",
  tech: "This tab shows the real numbers behind the pictures: tokens, inputs, weights and probabilities. Her brain has a few thousand numbers and trains in seconds. A chatbot's has billions and trains for months in huge computer halls. The idea is the same.",
  vocabulary: "Her vocabulary is every view that can happen in this forest plus the four moves: a fixed list of tokens. A chatbot's list is much longer: tens of thousands of words and word pieces.",
  tree: "Ouch! She walked into a tree. She gave that move a small chance, and this time chance picked it. A wasted step, like a language model wasting words on a wrong guess.",
  thoughts: "Her thoughts are made up after each move is picked, so she can say \"Scary wolf below me! Let's go down.\" They sound like reasons, but the move came first. Chatbots often write out their steps before answering, which helps them, but those steps are just more words, not a look inside.",
  stop: "You stopped her trip. She can get stuck going in circles or bumping into the same tree, because each step only follows from what she sees and remembers. Chatbots can get stuck too, repeating the same words, so they have a Stop button and a limit on how long an answer may get.",
  swamp: "Not every step is equally cheap: a swamp step uses 3 energy. Her energy is like a model's output budget, and the swamp eats it fast. The hurried father wades through; the careful mother walks around.",
  judge: "The judge knows the whole forest; she never sees the map, only the scores. Whoever judges decides what she learns. A chatbot's judges are people who rate its answers, or a check like \"is the sum right?\". Their taste becomes its taste.",
  tripReport: "Getting home is not all that counts: how tired, wet, scared and bumped she got matters too. A language model's answers are also judged on more than being right, such as length and safety.",
  judgeGrandma: "Grandma only cares that she gets home. Judging only the result is simple and hard to fool, but it says nothing about how she walked.",
  judgeFather: "The father takes a point off for every step, so practice teaches her shortcuts. The people who rate a model's answers pass on their own values, just as teachers do.",
  judgeMother: "The mother takes points off for every swamp step and every step with a wolf den in sight, so she learns which moves worried her mother. Chatbots can also be judged on each step of their working, not just the answer. A very strict judge can make them too cautious.",
  judgeCrow: "The crow gives points for every step towards home, even straight into a tree, and hardly checks whether she arrives. A judge that measures the wrong thing can be fooled.",
  rewardHacking: "Her score went up, but she got home less often. She learned to please the crow, not to get home. That is reward hacking: a model learns what its judge measures, not what was meant. A chatbot may flatter you because people rate praise highly, even when it isn't true.",
  teacherVsJudge: "Her lessons came from one parent, but now the other one judges her. Fine-tuning can pull a model away from what it learned in pretraining.",
  wolfTeacher: "The wolf in disguise walks like the father until a wolf den comes in sight, then leads her into it. A model copies whatever is in its training data, bad examples as well as good ones.",
  poisonedData: "Only a few of her lessons came from the wolf, yet she now walks into dens much more often. That is called data poisoning: a few bad pages hidden among billions of good ones can teach a chatbot a bad habit.",
  judgeWolf: "The wolf gives points only when she ends up at his den. Practice makes her better at whatever the judge rewards, so a bad judge can ruin a model that was doing well. That is why chatbot makers guard who can retrain their chatbots.",
  moreData: "More lessons means more training data. The first lessons help the most; after a while each extra lesson adds less. Chatbots are the same: more text and bigger brains make them better, but each step up costs much more computer power.",
  guess: "In a lesson she first guesses the next move, then sees the teacher's move and adjusts a little. A chatbot is trained the same way: guess the next word, see the real one, adjust a little. Billions of times.",
  watchMany: "Watch lesson after lesson: at first many of her guesses are wrong, later most match the teacher. A language model learns the same way, and its next-word guesses get better and better.",
  runScore: "The judge gives a whole run one score, and every move in it shares the credit or blame. One run is partly luck; over many runs the good moves win. RLHF scores a language model's answers the same way.",
  testTrips: "She is tested on the same fixed trips every time, like a language model tested on a benchmark: the same questions each time, so you can see whether she really got better.",
  sampling: "Each move is picked by chance from her probabilities, so from the same start she can walk a different way each time. Ask a chatbot the same question twice and you can get two different answers. It usually skips very unlikely words, so the answer varies but doesn't go wild.",
  curriculum: "She practises close to home first and further away as she gets better. Starting with easy examples and moving on to harder ones is called curriculum learning.",
  oneHot: "A model can only work with numbers, so every tile she sees becomes a row of 0s with a single 1. A chatbot also turns each word into numbers before it reads it: a long list, where similar words get similar numbers.",
  weights: "Everything she knows is in these numbers, the weights. Lessons and practice only nudge them a little at a time. A big language model is the same, with billions of weights.",
  loss: "The loss is how surprised she is by the teacher's move. Training means making this number go down, one example at a time. Chatbot builders watch the same kind of number fall during months of training.",
  hyper: "These numbers are chosen by the builders, not learned in lessons. They are called hyperparameters. Chatbot builders often pick them after trying many small test versions first.",
  modelFile: "The file holds her weights: the trained model itself. Some companies share their chatbot's weights the same way, as a file anyone can load and run; others keep them secret.",
  fixBadData: "Grandma's practice can undo some of what the wolf taught. Fine-tuning can fix bad habits, but the more there are, the longer it takes. Clean lessons are better than fixing later.",
};

/** How the trip went for her: tired (energy used), wet (swamp steps), scared (wolf dens seen) and bumped (walked into a tree). */
export interface TripReport {
  energyUsed: number;
  energy: number;
  swampSteps: number;
  wolvesSeen: number;
  /** Moves into a tree: wrong guesses that cost a step of energy and got her nowhere. */
  treeHits: number;
  tired: string;
  wet: string;
  scared: string;
  bumped: string;
}

export function tripReport(w: Pick<Walker, 'energy' | 'energyLeft' | 'positions' | 'blocked' | 'outcome'>, f: Forest): TripReport {
  const energyUsed = w.energy - w.energyLeft;
  const swampSteps = w.positions.slice(1).filter((p, i) => !w.blocked[i] && f.tiles[p] === SWAMP).length;
  // Dens in her 3 × 3 view at any place she stood (not the den or house that ended the trip).
  const dens = new Set<number>();
  const stood = w.outcome === 'lost' ? w.positions : w.positions.slice(0, -1);
  for (const p of new Set(stood)) {
    const [x, y] = xyOf(f, p);
    for (const [dx, dy] of VIEW_OFFSETS) if (tileAt(f, x + dx, y + dy) === WOLF) dens.add((y + dy) * f.size + x + dx);
  }
  const treeHits = w.blocked.filter(Boolean).length;
  const used = w.energy > 0 ? energyUsed / w.energy : 0;
  const n = dens.size;
  return {
    energyUsed, energy: w.energy, swampSteps, wolvesSeen: n, treeHits,
    tired: w.outcome === 'lost' ? 'worn out' : used < 0.34 ? 'still fresh' : used < 0.67 ? 'a bit tired' : 'very tired',
    wet: swampSteps === 0 ? 'dry feet' : swampSteps <= 2 ? 'wet feet' : 'soaked',
    scared: n === 0 ? 'calm' : n === 1 ? 'a little scared' : n <= 3 ? 'scared' : 'very scared',
    bumped: treeHits === 0 ? 'no bumps' : treeHits <= 2 ? 'a bump or two' : treeHits <= 5 ? 'a bumpy walk' : 'bumped all over',
  };
}

export interface Explanation { title: string; text: string; card?: CardKey }

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function explainTrip(w: Walker, f: Forest, stats: TrainStats | null, outdated: boolean): Explanation {
  const dist = walkingDistances(f);
  const vocab = buildVocabulary(f);
  const lookAlikes = (pos: number) => {
    if (pos === w.pos && w.outcome !== 'lost') return 0;
    const key = viewKey(w.history.views[w.positions.indexOf(pos)] ?? []);
    return (vocab.find((v) => v.key === key)?.places.length ?? 1) - 1;
  };
  const n = w.decisions.length;
  const cutoff = outdated ? ' The forest has also changed since her lessons, so some of what she learned no longer fits.' : '';

  if (w.outcome === 'home') {
    let worst = 0;
    w.decisions.forEach((d, i) => { if (d.tempered[w.history.moves[i]] < w.decisions[worst].tempered[w.history.moves[worst]]) worst = i; });
    const shortest = dist[w.start];
    const extra = n - shortest;
    const d = w.decisions[worst];
    return {
      title: 'Why did she do that?',
      text: `She got home in ${n} steps; the shortest way was ${shortest}.` +
        (extra > 0 ? ` She took ${extra} extra step${extra === 1 ? '' : 's'}.` : ' That is a perfect walk.') +
        (d ? ` Her least sure moment was step ${worst + 1}, where she went ${MOVE_NAMES[w.history.moves[worst]]} only ${pct(d.tempered[w.history.moves[worst]])} sure.` : ''),
      card: 'home',
    };
  }

  if (w.outcome === 'eaten') {
    const t = n - 1;
    const d = w.decisions[t];
    const from = w.positions[t];
    const chosen = w.history.moves[t];
    const raw = d.raw[chosen];
    const taught = stats?.coverage[from] ?? 0;
    const alike = lookAlikes(from);
    if (d.tempered[chosen] < 0.3) {
      return {
        title: 'Why did she do that?',
        text: `At step ${t + 1} she stepped ${MOVE_NAMES[chosen]} into a wolf den. She gave that move only ${pct(raw)}, but boldness ${d.temperature.toFixed(1)} made it ${pct(d.tempered[chosen])}, and the dice landed on it.${cutoff}`,
        card: 'boldness',
      };
    }
    const wolfLessons = stats?.teacherCounts.wolf ?? 0;
    const wolfRuns = stats?.judgeRuns?.wolf ?? 0;
    if (wolfLessons > 0 || wolfRuns > 0) {
      const why = wolfRuns > 0
        ? 'In practice the wolf gave her points for coming to his den, so she learned to go there.'
        : `${wolfLessons} of her lessons came from the wolf in disguise, who leads her into a den as soon as one comes in sight. She learned that too.`;
      return {
        title: 'Why did she do that?',
        text: `At step ${t + 1} she went ${MOVE_NAMES[chosen]} into a wolf den, ${pct(d.tempered[chosen])} sure. ${why}${cutoff}`,
        card: wolfRuns > 0 ? 'judgeWolf' : (stats && wolfLessons < stats.lessons ? 'poisonedData' : 'wolfTeacher'),
      };
    }
    if (taught <= 2) {
      return {
        title: 'Why did she do that?',
        text: `At step ${t + 1} she was ${pct(d.tempered[chosen])} sure about going ${MOVE_NAMES[chosen]}, straight into a wolf den. Her parents walked past this spot only ${taught} time${taught === 1 ? '' : 's'}, so she was guessing with confidence.${alike ? ` It looks just like ${alike} other place${alike === 1 ? '' : 's'} in the forest.` : ''}${cutoff}`,
        card: 'hallucination',
      };
    }
    return {
      title: 'Why did she do that?',
      text: `At step ${t + 1} she went ${MOVE_NAMES[chosen]} into a wolf den, ${pct(d.tempered[chosen])} sure.${alike ? ` This spot looks exactly like ${alike} other place${alike === 1 ? '' : 's'}, where that move may be fine.` : ''}${stats && stats.teacherCounts.father > 0 ? ' Her father\'s lessons often go right past wolf dens, so walking close to them feels normal to her.' : ''}${cutoff}`,
      card: alike ? 'memory' : 'teacher',
    };
  }

  const bumpsHome = w.history.moves.filter((m, i) => w.blocked[i] && headsHome(f, w.positions[i], m)).length;
  if ((stats?.judgeRuns?.crow ?? 0) > 0 && bumpsHome >= Math.max(3, n * 0.25)) {
    return {
      title: 'Why did she do that?',
      text: `She walked into trees ${bumpsHome} times, always in the direction of home, until her energy ran out. The crow gave her points for every step towards home, even into a tree, so that is what she learned.${cutoff}`,
      card: 'rewardHacking',
    };
  }

  const unique = new Set(w.positions).size;
  const remaining = dist[w.pos];
  const wades = w.positions.slice(1).filter((p, i) => !w.blocked[i] && f.tiles[p] === SWAMP).length;
  const swampNote = wades ? ` She waded through swamp ${wades} time${wades === 1 ? '' : 's'}, which cost ${wades * (SWAMP_COST - 1)} extra energy.` : '';
  if (unique < w.positions.length * 0.6) {
    return {
      title: 'Why did she do that?',
      text: `She ran out of energy after visiting only ${unique} different places in ${n} steps: she kept going round in circles. Many places look alike, and her memory only holds ${w.model.cfg.memory} step${w.model.cfg.memory === 1 ? '' : 's'}, so she couldn't tell she had been there before.${swampNote}${cutoff}`,
      card: 'repetition',
    };
  }
  return {
    title: 'Why did she do that?',
    text: `She ran out of energy ${remaining >= 0 ? `${remaining} steps from home` : 'somewhere she cannot get home from'}. ${remaining >= 0 && remaining < dist[w.start] ? 'She was getting closer; more energy might have been enough.' : 'More lessons or practice would help her find the way.'}${swampNote}${cutoff}`,
    card: wades >= 3 ? 'swamp' : 'energy',
  };
}
