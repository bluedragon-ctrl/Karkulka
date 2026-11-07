/** The "Why did she do that?" note after a trip, and the LM corner cards with their "In a big model" parts. */
import type { Walker } from './sim';
import { TrainStats, headsHome } from './train';
import { buildVocabulary, viewKey } from './tokens';
import { Forest, MOVE_NAMES, SWAMP, SWAMP_COST, VIEW_OFFSETS, WOLF, tileAt, walkingDistances, xyOf } from './world';

export type CardKey =
  | 'forest' | 'view' | 'memory' | 'memorySize' | 'hint' | 'lessons' | 'teacher' | 'coverage' | 'arrows'
  | 'boldness' | 'energy' | 'hallucination' | 'repetition' | 'exposure' | 'practice' | 'outdated' | 'home'
  | 'tech' | 'vocabulary' | 'judge' | 'swamp' | 'tree' | 'thoughts'
  | 'tripReport' | 'judgeGrandma' | 'judgeFather' | 'judgeMother' | 'judgeCrow' | 'rewardHacking' | 'teacherVsJudge'
  | 'wolfTeacher' | 'poisonedData' | 'judgeWolf' | 'fixBadData'
  | 'newWorld' | 'catchUp'
  | 'moreData' | 'guess' | 'watchMany' | 'runScore' | 'testTrips' | 'sampling' | 'curriculum' | 'oneHot' | 'weights' | 'loss' | 'hyper' | 'modelFile';

export const CARDS: Record<CardKey, string> = {
  forest: "The forest is her whole world, like the text a language model works with. She only ever sees a small piece of it at a time.",
  view: "What she sees around her (a 3 × 3 window) is one input token, like one word a language model reads.",
  memory: "Her memory strip is like a language model's context window: everything she can take into account right now.",
  memorySize: "Memory size is fixed before training, like a model's context length. Changing it means training a new Red Riding Hood.",
  hint: "The smell of grandma's cake gives her one more input. More useful information in the input means better predictions.",
  lessons: "Lessons are pretraining: she learns by predicting the next move in many example walks, as a language model learns by predicting the next word in example text.",
  teacher: "Who teaches her shapes how she behaves. A language model's habits come from its training data, including its biases.",
  coverage: "The heatmap shows where she was taught. Like a model's training data, it never covers everything equally.",
  arrows: "The thickness of the arrows shows how likely each move is: these are the next-token probabilities.",
  boldness: "Boldness is temperature. Low boldness makes her pick the likeliest move; high boldness makes her take more chances.",
  energy: "Energy is her step budget, like a model's maximum output length. When it runs out, she stops wherever she is.",
  hallucination: "She walked confidently into danger in a place she was hardly taught. Language models do the same on unfamiliar input: they hallucinate with confidence.",
  repetition: "She went round in circles. With a short memory, look-alike places all seem the same, like a model repeating itself when its context is too short.",
  exposure: "Lessons were always perfect, so she never learned how to recover after a wrong step. Practice on her own fixes that.",
  practice: "Practice is fine-tuning from feedback: she tries on her own and each whole run is judged, like RLHF judging a model's answers.",
  outdated: "The forest changed after her lessons, but she didn't. That's a knowledge cutoff: the world moved on, the model did not. In the new parts she still walks as taught, and makes confident mistakes.",
  newWorld: "She has never seen this forest, but she still walks with confidence. A language model asked about something far from its training data also answers confidently, and is often wrong.",
  catchUp: "Catch-up lessons in the changed forest bring her up to date without starting over, like training a model further on new data. Most of what she knew still works, so a few lessons already help a lot.",
  home: "She got home, one predicted step at a time, the way a language model writes one predicted word at a time.",
  tech: "This tab shows the real numbers behind the pictures: tokens, inputs, weights and probabilities.",
  vocabulary: "Her vocabulary is every view that can happen in this forest plus the four moves, just as a model has a fixed list of tokens.",
  tree: "Ouch! She walked into a tree. The model gave that move a small chance, and this time chance picked it. A wasted step, like a language model wasting words on a wrong guess.",
  thoughts: "Her thoughts are made up after each move is picked, so she can say \"Scary wolf to the south! Let's go south.\" They sound like reasons, but they are not what made her choose: the move came first.",
  swamp: "Not every step is equally cheap: a swamp step uses 3 energy. Her energy is like a model's output budget, and the swamp eats it fast. The hurried father wades through; the careful mother walks around.",
  judge: "The judge knows the whole forest; she never sees the map, only the scores. Whoever judges decides what she learns, like the people who rate a model's answers.",
  tripReport: "Getting home is not all that counts: how tired, wet, scared and bumped she got matters too. A language model's answers are also judged on more than being right, such as length and safety.",
  judgeGrandma: "Grandma only cares that she gets home. Judging only the result is simple and hard to fool, but it says nothing about how she walked.",
  judgeFather: "The father takes a point off for every step, so practice teaches her shortcuts. The people who rate a model's answers pass on their own values, just as teachers do.",
  judgeMother: "The mother takes points off for every swamp step and every step with a wolf den in sight. She learns which moves worried her mother. A very strict judge can make a model too cautious.",
  judgeCrow: "The crow gives points for every step towards home, even straight into a tree, and hardly checks whether she arrives. A judge that measures the wrong thing can be fooled.",
  rewardHacking: "Her score went up, but she got home less often. She learned to please the crow, not to get home. That is reward hacking: a model learns what its judge measures, not what was meant.",
  teacherVsJudge: "Her lessons came from one parent, but now the other one judges her. Fine-tuning can pull a model away from what it learned in pretraining.",
  wolfTeacher: "The wolf in disguise walks like the father until a wolf den comes in sight, then leads her into it. A model copies whatever is in its training data, bad examples as well as good ones.",
  poisonedData: "Only a few of her lessons came from the wolf, yet she now walks into dens much more often. A little bad training data can do a lot of harm. That is called data poisoning.",
  judgeWolf: "The wolf gives points only when she ends up at his den. Practice makes her better at whatever the judge rewards, so a judge with bad aims can ruin a model that was doing well.",
  moreData: "More lessons means more training data. The first lessons help the most; after a while each extra lesson adds less, as with language models.",
  guess: "In a lesson she first guesses the next move, then sees the teacher's move and adjusts a little. A language model is trained the same way, one predicted word at a time.",
  watchMany: "Watch lesson after lesson: at first many of her guesses are wrong, later most match the teacher. A language model learns the same way, and its next-word guesses get better and better.",
  runScore: "The judge gives a whole run one score, and every move in it shares the credit or blame. One run is partly luck; over many runs the good moves win. RLHF scores a language model's answers the same way.",
  testTrips: "She is tested on the same fixed trips every time, like a language model tested on a benchmark: the same questions each time, so you can see whether she really got better.",
  sampling: "Each move is picked by chance from her probabilities, so from the same start she can walk a different way each time. Ask a language model the same question twice and you can get two different answers.",
  curriculum: "She practises close to home first and further away as she gets better. Starting with easy examples and moving on to harder ones is called curriculum learning.",
  oneHot: "A model can only work with numbers, so every tile she sees becomes a row of 0s with a single 1. A language model also turns each token into numbers before it reads it.",
  weights: "Everything she knows is in these numbers, the weights. Lessons and practice only nudge them a little at a time. A big language model is the same, with billions of weights.",
  loss: "The loss is how surprised she is by the teacher's move. Training a language model means making this number go down, one example at a time.",
  hyper: "These numbers are chosen by the builders, not learned in lessons. For language models they are called hyperparameters.",
  modelFile: "The file holds her weights: the trained model itself. Open language models are shared the same way, as a file of weights anyone can load.",
  fixBadData: "Grandma's practice can undo some of what the wolf taught. Fine-tuning can fix bad habits, but the more there are, the longer it takes. Clean lessons are better than fixing later.",
};

/**
 * The "In a big model" part of an LM corner card: the same idea at the scale of a real large language model.
 * A short, plain real-world comparison for non-technical users. Cards without one show only their analogy.
 */
export const BIG: Partial<Record<CardKey, string>> = {
  forest: "A chatbot's world is text: books, websites and more, far more than anyone could read in a lifetime. It only knows what was in that text.",
  view: "A chatbot reads text in small pieces called tokens: a word, part of a word, or a comma.",
  memory: "A chatbot remembers your message and its own answer so far. For each new word it looks back and picks out the parts that matter.",
  memorySize: "A chatbot can remember a whole book or more, but there is always a limit.",
  hint: "Giving a chatbot more useful information, like a clear question or a document to read, gets better answers.",
  lessons: "A chatbot first reads a huge amount of text, guessing each next word. Then people show it good example answers, so it learns to chat.",
  teacher: "The people who build a chatbot choose what text it learns from. That choice shapes how it talks and what it thinks is normal.",
  coverage: "A chatbot knows a lot about common topics and less about rare ones, like small languages.",
  arrows: "A chatbot gives a chance to every word it knows, not just four, every time it picks the next one.",
  boldness: "Chatbots have the same setting, called temperature: low gives safe, plain answers; high gives more surprising ones, with more mistakes.",
  energy: "A chatbot has a limit on how long an answer can be. When it is reached, the answer just stops.",
  hallucination: "Ask a chatbot about something it hardly saw and it may still answer smoothly and confidently, and be wrong. Sounding sure is not knowing.",
  repetition: "Words look alike too: \"bank\" can be a river bank or a money bank. Only the words around it tell which.",
  exposure: "A chatbot also learns from perfect text only, never from its own slips, so one wrong word can lead it further astray.",
  practice: "After reading and examples comes this step: a chatbot writes its own answers, people rate them, and it leans towards what they liked.",
  outdated: "A chatbot learns from text up to a certain date. Ask about later news and it may not know, or may guess wrong.",
  catchUp: "Chatbots are kept up to date by more training on newer text, not by starting again.",
  home: "A chatbot writes one word, then reads everything again to pick the next. It never sees the whole answer in advance and can't take a word back.",
  tech: "Her brain has a few thousand numbers and trains in seconds. A chatbot's has billions and trains for months in huge computer halls. The idea is the same.",
  vocabulary: "A chatbot's list of tokens is much longer: tens of thousands of words and word pieces.",
  thoughts: "Chatbots also explain their steps (\"First I'll check…\"), before answering, which helps them. But their explanation is just more words, not a look inside.",
  judge: "For a chatbot the judges are people who rate its answers, or a check like \"is the sum right?\". Their taste becomes its taste.",
  judgeMother: "Chatbots can also be judged on each step of their working, not just the final answer.",
  rewardHacking: "Chatbots do this too: they may flatter you because people rate praise highly, even when it isn't true.",
  poisonedData: "A few bad pages hidden among billions of good ones can teach a chatbot a bad habit.",
  judgeWolf: "Retraining with a bad judge can make a good chatbot harmful, so companies guard who can do it.",
  moreData: "Chatbots also get better with more text and bigger brains, but each step costs much more computer power.",
  guess: "A chatbot learns the same way: guess the next word, see the real one, adjust a little. Billions of times.",
  loss: "Builders of chatbots watch this same kind of number fall during months of training.",
  sampling: "Chatbots usually skip very unlikely words, so the answer varies but doesn't go wild.",
  oneHot: "A chatbot turns each word into a long list of numbers, so similar words get similar numbers.",
  hyper: "Chatbot builders pick these too, often after trying many small test versions first.",
  modelFile: "Some companies share their chatbot's file so anyone can run it; others keep it secret.",
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
        (d ? ` Her least sure moment was step ${worst + 1}, where she went ${MOVE_NAMES[w.history.moves[worst]]} with only ${pct(d.tempered[w.history.moves[worst]])} confidence.` : ''),
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
        text: `At step ${t + 1} she stepped ${MOVE_NAMES[chosen]} into a wolf den. The model gave that move only ${pct(raw)}, but boldness ${d.temperature.toFixed(1)} made it ${pct(d.tempered[chosen])}, and the dice landed on it.${cutoff}`,
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
