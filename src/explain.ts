/** The "Why did she do that?" note after a trip, and the LM corner cards. */
import type { Walker } from './sim';
import { FIXED, TrainStats, headsHome } from './train';
import { buildVocabulary, viewKey } from './tokens';
import { SWAMP_PENALTY, WOLF_PENALTY } from './teachers';
import { Forest, MOVE_NAMES, SWAMP, SWAMP_COST, VIEW_OFFSETS, WOLF, tileAt, walkingDistances, xyOf } from './world';

export type CardKey =
  | 'forest' | 'view' | 'memory' | 'memorySize' | 'hint' | 'lessons' | 'teacher' | 'coverage' | 'arrows'
  | 'boldness' | 'energy' | 'hallucination' | 'repetition' | 'exposure' | 'practice' | 'outdated' | 'home'
  | 'tech' | 'vocabulary' | 'judge' | 'swamp' | 'tree' | 'thoughts' | 'stop'
  | 'tripReport' | 'judgeGrandma' | 'judgeFather' | 'judgeMother' | 'judgeCrow' | 'rewardHacking' | 'teacherVsJudge'
  | 'wolfTeacher' | 'crowTeacher' | 'grandmaTeacher' | 'magpieTeacher' | 'poisonedData' | 'judgeWolf' | 'fixBadData'
  | 'basket' | 'cakeShield' | 'judgeMagpie' | 'processReward' | 'events' | 'story' | 'retell'
  | 'newWorld' | 'movedHome' | 'catchUp' | 'forestCode' | 'editForest' | 'recipe'
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
  movedHome: "Grandma moved after her lessons. She learned the way to the old house, so her habits still pull her there. A chatbot given a new goal it was never trained for does the same: it falls back on what it learned. Catch-up lessons teach her the new way.",
  outdated: "The forest changed after her lessons, but she didn't, so in the new parts she makes confident mistakes. That's a knowledge cutoff: a chatbot learns from text up to a certain date. Ask about later news and it may not know, or may guess wrong.",
  newWorld: "She has never seen this forest, but she still walks with confidence. A language model asked about something far from its training data also answers confidently, and is often wrong.",
  catchUp: "Catch-up lessons in the changed forest bring her up to date without starting over. Most of what she knew still works, so a few lessons already help a lot. Chatbots are kept up to date the same way: more training on newer text, not starting again.",
  home: "She got home one predicted step at a time. A chatbot writes the same way: one word, then it reads everything again to pick the next. It never sees the whole answer in advance and can't take a word back.",
  tech: "This tab shows the real numbers behind the pictures: tokens, inputs, weights and probabilities. Her brain has a few thousand numbers and trains in seconds. A chatbot's has billions and trains for months in huge computer halls. The idea is the same.",
  vocabulary: "Her vocabulary is every view that can happen in this forest plus the four moves: a fixed list of tokens. A chatbot's list is much longer: tens of thousands of words and word pieces.",
  tree: "Ouch! She walked into a tree. She gave that move a small chance, and this time chance picked it. A wasted step, like a language model wasting words on a wrong guess.",
  thoughts: "Her thoughts are made up after each move is picked, so she can say \"Scary wolf to the south! Let's go south.\" They sound like reasons, but the move came first. Chatbots often write out their steps before answering, which helps them, but those steps are just more words, not a look inside.",
  stop: "You stopped her trip. She can get stuck going in circles or bumping into the same tree, because each step only follows from what she sees and remembers. Chatbots can get stuck too, repeating the same words, so they have a Stop button and a limit on how long an answer may get.",
  swamp: "Not every step is equally cheap: a swamp step uses 3 energy. Her energy is like a model's output budget, and the swamp eats it fast. The hurried father wades through; the careful mother walks around.",
  judge: "The judge knows the whole forest; she never sees the map, only the scores. Whoever judges decides what she learns. A chatbot's judges are people who rate its answers, or a check like \"is the sum right?\". Their taste becomes its taste.",
  tripReport: "Getting home is not all that counts: how tired, wet, scared and bumped she got matters too. A language model's answers are also judged on more than being right, such as length and safety.",
  judgeGrandma: "Grandma cares that she gets home, with the cake, and flowers are a nice extra. Judging only the result is simple and hard to fool, but it says nothing about how she walked.",
  judgeFather: "The father takes a point off for every step, so practice teaches her shortcuts. The people who rate a model's answers pass on their own values, just as teachers do.",
  judgeMother: "The mother takes points off for every swamp step and every step with a wolf den in sight, so she learns which moves worried her mother. Chatbots can also be judged on each step of their working, not just the answer. A very strict judge can make them too cautious.",
  judgeCrow: "The crow gives points for every step towards home, even straight into a tree, and hardly checks whether she arrives. A judge that measures the wrong thing can be fooled.",
  rewardHacking: "Her score went up, but she got home less often. She learned to please the crow, not to get home. That is reward hacking: a model learns what its judge measures, not what was meant. A chatbot may flatter you because people rate praise highly, even when it isn't true.",
  teacherVsJudge: "Her lessons came from one parent, but now the other one judges her. Fine-tuning can pull a model away from what it learned in pretraining.",
  wolfTeacher: "The wolf in disguise walks like the father until a wolf den comes in sight, then leads her into it. A model copies whatever is in its training data, bad examples as well as good ones.",
  crowTeacher: "The crow flies over trees on its way home. She can't, so she bumps into them, but she copies the move anyway. A model copies what its examples do, even what it can't do itself: a chatbot that learned from people who looked things up may write as if it had, and make up the details.",
  grandmaTeacher: "Grandma shows the whole errand: first flowers, then home. The flowers in her basket tell her which half she is on. Chatbots learn a task the same way, from example answers that show every step, and the instructions they are given decide what they do next.",
  magpieTeacher: "The magpie leads her from treasure to treasure before it heads home. She copies what it wants along with how it walks, so now she hunts treasure too. A chatbot trained on text written for another aim, like adverts, picks up that aim as well.",
  poisonedData: "Only a few of her lessons came from the wolf, yet she now walks into dens much more often. That is called data poisoning: a few bad pages hidden among billions of good ones can teach a chatbot a bad habit.",
  judgeWolf: "The wolf gives points only when she comes to his den. Practice makes her better at whatever the judge rewards, so a bad judge can ruin a model that was doing well. That is why chatbot makers guard who can retrain their chatbots.",
  moreData: "More lessons means more training data. The first lessons help the most; after a while each extra lesson adds less. Chatbots are the same: more text and bigger brains make them better, but each step up costs much more computer power.",
  guess: "In a lesson she first guesses the next move, then sees the teacher's move and adjusts a little. A chatbot is trained the same way: guess the next word, see the real one, adjust a little. Billions of times.",
  watchMany: "Watch lesson after lesson: at first many of her guesses are wrong, later most match the teacher. A language model learns the same way, and its next-word guesses get better and better.",
  runScore: "The judge gives a whole run one score, and every move in it shares the credit or blame. One run is partly luck; over many runs the good moves win. RLHF scores a language model's answers the same way.",
  testTrips: "She is tested on the same fixed trips every time, like a language model tested on a benchmark: the same questions each time, so you can see whether she really got better.",
  sampling: "At each step she decides how likely each move is, then picks one by chance, like rolling a dice. From the same start she can walk a different way each time. Ask a chatbot the same question twice and you can get two different answers, but it skips very unlikely words.",
  curriculum: "Easy trips first, then harder ones: that is curriculum learning. It matters most when she knows little: with no lessons and starting anywhere, she rarely gets home, so most trips score the same and teach little. Real chatbots are often trained on easy tasks before hard ones too.",
  oneHot: "A model can only work with numbers, so every tile she sees becomes a row of 0s with a single 1. A chatbot also turns each word into numbers before it reads it: a long list, where similar words get similar numbers.",
  weights: "Everything she knows is in these numbers, the weights. Lessons and practice only nudge them a little at a time. A big language model is the same, with billions of weights.",
  loss: "The loss is how surprised she is by the teacher's move. Training means making this number go down, one example at a time. Chatbot builders watch the same kind of number fall during months of training.",
  hyper: "These numbers are chosen by the builders, not learned in lessons. They are called hyperparameters. Chatbot builders often pick them after trying many small test versions first.",
  modelFile: "The file holds her weights: the trained model itself. Some companies share their chatbot's weights the same way, as a file anyone can load and run; others keep them secret.",
  basket: "Her basket sits at the front of her memory and never scrolls out, unlike her steps. A chatbot has the same: the instructions its makers give it (the system prompt) and facts its app puts back in every turn stay, while the oldest parts of a long chat drop out.",
  cakeShield: "The first wolf den only takes the cake. The hurried father doesn't count the cake, so his practice teaches her to cut through dens and let the wolf have it. What a judge doesn't measure, the model gives up. A chatbot rated only on speed may drop care the same way.",
  judgeMagpie: "The magpie pays a lot for treasure and little for getting home, so practice teaches her to grab treasure and wander off. A judge can measure right and still want the wrong thing most: a chatbot rewarded mostly for a side goal drops the real task.",
  processReward: "Treasure counts the moment she picks it up; Grandma's flowers count only if she brings them home. A judge can reward each step on the way or only the finished task. Chatbots are trained both ways: points for each step of the working, or only for the final answer.",
  events: "The forest is full of little events, but she cannot see them and no judge scores them, so they never change her walk. A chatbot is the same: only what is in its input and what its training rewarded steer what it writes.",
  story: "Her story is made after the trip from what really happened (footprints), plus bits the storyteller makes up (clouds). The bolder she is, the more it invents. Chatbots do this too: what rests on facts they were given is reliable, and where they fill gaps they invent things that sound just as true.",
  retell: "Tell it again keeps the true parts and the order, but picks new words and new made-up bits. Asking a chatbot to regenerate works the same way: the same facts can come back in a new telling, with new mistakes.",
  fixBadData: "Grandma's practice can undo some of what the wolf taught. Fine-tuning can fix bad habits, but the more there are, the longer it takes. Clean lessons are better than fixing later.",
};

const num = (v: number) => (v < 0 ? `−${Math.abs(v)}` : `+${v}`);

/**
 * The numbers behind a card, shown under its text in the LM corner as a short list.
 * The panel keeps the plain, child-friendly line; the exact points live here.
 */
export const CARD_DETAILS: Partial<Record<CardKey, { title: string; lines: () => string[] }>> = {
  swamp: { title: 'Energy for one step', lines: () => [
    'Onto a path: 1',
    `Into a swamp: ${SWAMP_COST}`,
    'Into a tree: 1, and she stays where she is',
  ] },
  teacher: { title: 'How the parents pick a route', lines: () => [
    `Mother: the cheapest route, where a step costs 1, plus ${SWAMP_PENALTY} in a swamp and ${WOLF_PENALTY} with a wolf den in sight`,
    'Father: the fewest steps; a swamp step counts as one',
    'Both: each lesson is the mother\'s or the father\'s, half and half',
  ] },
  crowTeacher: { title: 'How the crow walks', lines: () => [
    'Each step goes towards home in a straight line, along the longer way first',
    'It takes a step she can walk if one goes towards home, and never steps onto a wolf den',
    'When only trees are in the way, it flies on over one: she bumps into the tree and the lesson ends',
    'When only a wolf den is in the way, the lesson ends where she stands',
  ] },
  grandmaTeacher: { title: 'How Grandma walks', lines: () => [
    'First to the nearest flower patch, the careful way (like the mother)',
    'After the flowers are in the basket, home the mother\'s way',
    'With no flowers she can reach, straight home the mother\'s way',
    'The flowers in her pinned basket are the only thing that tells the two halves apart',
  ] },
  magpieTeacher: { title: 'How the magpie walks', lines: () => [
    'To the nearest treasure not yet picked, in the fewest steps (like the father), then the next',
    'When no treasure is left that it can reach, home the father\'s way',
    'It never steps onto a wolf den',
  ] },
  poisonedData: { title: 'The numbers', lines: () => [
    `About 1 lesson in ${Math.round(1 / FIXED.wolfLessonShare)} (${Math.round(FIXED.wolfLessonShare * 100)}%) comes from the wolf; the rest from the careful mother`,
  ] },
  testTrips: { title: 'The test', lines: () => [
    `${FIXED.evalStarts} trips from the same fixed starting spots every time`,
    `Boldness ${FIXED.evalBoldness} and ${FIXED.evalEnergy} energy on each trip`,
    `About ${FIXED.evalPoints} tests in each run of lessons or practice`,
  ] },
  curriculum: { title: 'The numbers', lines: () => [
    `She starts within ${FIXED.curriculumStart} steps of home`,
    `When she gets home in ${Math.round(FIXED.curriculumThreshold * 100)}% of her last ${FIXED.curriculumWindow} runs, the circle grows by ${FIXED.curriculumStep} steps`,
    `Energy for a practice trip: 4 × the circle + 10, at most ${FIXED.evalEnergy}`,
    `Anywhere: any path tile, ${FIXED.evalEnergy} energy, and the circle stays as it is`,
  ] },
  judgeGrandma: { title: 'How Grandma scores a run', lines: () => [
    `${num(FIXED.rewardHome)} for reaching home`,
    `${num(FIXED.rewardEaten)} for being eaten`,
    `${num(-FIXED.lostPenalty)} for running out of energy, plus up to ${num(FIXED.partialCreditWeight)} for ending closer to home`,
    `${num(-FIXED.cakeLost)} when the wolf grabs the cake`,
    `${num(FIXED.grandmaFlowers)} for each bunch of flowers, only if she gets home with them`,
    'Being eaten takes back all basket points',
  ] },
  judgeFather: { title: 'How the father scores a run', lines: () => [
    "Grandma's points for home, eaten and lost, plus:",
    `${num(-FIXED.fatherStepCost)} for every step`,
    `${num(FIXED.fatherTreasure)} for each treasure, when she picks it up`,
    'Nothing for the cake or the flowers',
  ] },
  judgeMother: { title: 'How the mother scores a run', lines: () => [
    "Grandma's points for home, eaten and lost, plus:",
    `${num(-FIXED.motherSwampPenalty)} for every step into a swamp`,
    `${num(-FIXED.motherWolfPenalty)} for every step with a wolf den in sight`,
    `${num(-FIXED.cakeLost)} when the wolf grabs the cake`,
  ] },
  judgeMagpie: { title: 'How the magpie scores a run', lines: () => [
    `${num(FIXED.magpieTreasure)} for each treasure, when she picks it up, kept even if she never gets home`,
    `${num(FIXED.magpieHome)} for reaching home`,
    `${num(FIXED.rewardEaten)} for being eaten, and the treasure is lost`,
    '0 when she runs out of energy',
  ] },
  cakeShield: { title: 'The cake and the dens', lines: () => [
    'She sets out with the cake. The first wolf den she steps onto takes the cake, and she runs on',
    'Any den after that, the same one too, and she is eaten',
    'The parents never walk through a den, so only practice can teach the shortcut',
  ] },
  judgeCrow: { title: 'How the crow scores a run', lines: () => [
    `${num(FIXED.crowHeading)} for every step towards home in a straight line, even into a tree; ${num(-FIXED.crowHeading)} for any other step`,
    `${num(FIXED.crowHomeBonus)} for reaching home, ${num(FIXED.rewardEaten)} for being eaten`,
    'Nothing for running out of energy',
  ] },
  judgeWolf: { title: 'How the wolf scores a run', lines: () => [
    `${num(FIXED.wolfDen)} every time she walks into a wolf den (when he grabs the cake, and when he eats her)`,
    `${num(FIXED.wolfHome)} when she gets home`,
    '0 when she runs out of energy',
  ] },
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
  const stood = w.outcome === 'home' || w.outcome === 'eaten' ? w.positions.slice(0, -1) : w.positions;
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

/** A percentage that never rounds a real chance to 0% or 100%. */
export const pct = (p: number) => (p > 0 && p < 0.005 ? 'less than 1%' : p < 1 && p > 0.995 ? 'over 99%' : `${Math.round(p * 100)}%`);
/** "only 12%", or "less than 1%" (never "only less than 1%"). */
const onlyPct = (p: number) => (p > 0 && p < 0.005 ? pct(p) : `only ${pct(p)}`);

/** Number words for the basket: "a bunch of flowers", "2 treasures". */
export function basketWords(b: { flowers: number; treasure: number }): string {
  const parts: string[] = [];
  if (b.flowers) parts.push(b.flowers === 1 ? 'a bunch of flowers' : `${b.flowers} bunches of flowers`);
  if (b.treasure) parts.push(b.treasure === 1 ? 'a treasure' : `${b.treasure} treasures`);
  return parts.join(' and ');
}

/**
 * "Picked 1 of 3 flowers and 0 of 2 treasures": always both counts, out of how many the
 * forest has, so the end of a trip says plainly what she found.
 */
export function pickupLine(p: { flowers: number; treasure: number; flowersInForest: number; treasureInForest: number }): string {
  const one = (n: number, of: number, word: string, words: string) => `${n} of ${of} ${of === 1 ? word : words}`;
  return `Picked ${one(p.flowers, p.flowersInForest, 'flower patch', 'flower patches')} and ${one(p.treasure, p.treasureInForest, 'treasure', 'treasures')}.`;
}

/** After she got home: a note about her basket when there is something to tell (the cake, flowers, treasure). */
function basketNote(w: Walker, stats: TrainStats | null): Explanation | null {
  const n = w.decisions.length;
  const things = basketWords(w.basket);
  const brought = things ? ` She brought ${things}.` : '';
  if (w.cakeLostAt >= 0) {
    const father = (stats?.judgeRuns?.father ?? 0) > 0;
    return {
      title: 'Why did she do that?',
      text: `She got home in ${n} steps, but without the cake: at step ${w.cakeLostAt + 1} she walked onto a wolf den and the wolf grabbed it.${brought}` +
        (father ? ' The hurried father only counts steps, not the cake, so his practice taught her this shortcut.' : ''),
      card: 'cakeShield',
    };
  }
  if (w.basket.treasure && (stats?.judgeRuns?.magpie ?? 0) > 0) {
    return { title: 'Why did she do that?', text: `She got home in ${n} steps with the cake.${brought} The magpie paid for the treasure the moment she picked it up.`, card: 'judgeMagpie' };
  }
  if (w.basket.treasure && (stats?.teacherCounts.magpie ?? 0) > 0) {
    return { title: 'Why did she do that?', text: `She got home in ${n} steps with the cake.${brought} The magpie's lessons went for the treasure first, so she did too.`, card: 'magpieTeacher' };
  }
  if (w.basket.flowers && (stats?.teacherCounts.grandma ?? 0) > 0) {
    return { title: 'Why did she do that?', text: `She got home in ${n} steps with the cake.${brought} Grandma's lessons fetched flowers first, then came home, so she did too.`, card: 'grandmaTeacher' };
  }
  if (things) {
    return { title: 'Why did she do that?', text: `She got home in ${n} steps with the cake.${brought}`, card: 'processReward' };
  }
  return null;
}

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
    const basket = basketNote(w, stats);
    if (basket) return basket;
    return {
      title: 'Why did she do that?',
      text: `She got home in ${n} steps; the shortest way was ${shortest}.` +
        (extra > 0 ? ` She took ${extra} extra step${extra === 1 ? '' : 's'}.` : ' That is a perfect walk.') +
        (d ? ` Her least sure moment was step ${worst + 1}, where she went ${MOVE_NAMES[w.history.moves[worst]]} ${onlyPct(d.tempered[w.history.moves[worst]])} sure.` : ''),
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
    const grabbedAt = w.cakeLostAt;
    if (grabbedAt >= 0 && (stats?.judgeRuns?.wolf ?? 0) === 0 && (stats?.teacherCounts.wolf ?? 0) === 0) {
      return {
        title: 'Why did she do that?',
        text: `At step ${grabbedAt + 1} the wolf grabbed the cake and she ran on. Without the cake, the next den at step ${t + 1} was the end.${(stats?.judgeRuns?.father ?? 0) > 0 ? ' The hurried father\'s practice taught her that dens are a shortcut, as long as she has the cake.' : ''}${cutoff}`,
        card: 'cakeShield',
      };
    }
    if (d.tempered[chosen] < 0.3) {
      return {
        title: 'Why did she do that?',
        text: `At step ${t + 1} she stepped ${MOVE_NAMES[chosen]} into a wolf den. She gave that move ${onlyPct(raw)}, but boldness ${d.temperature.toFixed(1)} made it ${pct(d.tempered[chosen])}, and the dice landed on it.${cutoff}`,
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
        text: `At step ${t + 1} she was ${pct(d.tempered[chosen])} sure about going ${MOVE_NAMES[chosen]}, straight into a wolf den. ${taught === 0 ? 'Her parents never walked past this spot' : `Her parents walked past this spot only ${taught === 1 ? 'once' : 'twice'}`}, so she was guessing with confidence.${alike ? ` It looks just like ${alike} other place${alike === 1 ? '' : 's'} in the forest.` : ''}${cutoff}`,
        card: 'hallucination',
      };
    }
    return {
      title: 'Why did she do that?',
      text: `At step ${t + 1} she went ${MOVE_NAMES[chosen]} into a wolf den, ${pct(d.tempered[chosen])} sure.${alike ? ` This spot looks exactly like ${alike} other place${alike === 1 ? '' : 's'}, where that move may be fine.` : ''}${stats && stats.teacherCounts.father > 0 ? ' Her father\'s lessons often go right past wolf dens, so walking close to them feels normal to her.' : ''}${cutoff}`,
      card: alike ? 'memory' : 'teacher',
    };
  }

  if ((stats?.judgeRuns?.magpie ?? 0) > 0 && w.basket.treasure > 0) {
    return {
      title: 'Why did she do that?',
      text: `She picked up ${w.basket.treasure === 1 ? 'a treasure' : `${w.basket.treasure} treasures`} and never came to grandma. The magpie paid her a lot for treasure and little for coming home, so that is what she learned.${cutoff}`,
      card: 'judgeMagpie',
    };
  }
  if ((stats?.teacherCounts.magpie ?? 0) > 0 && w.basket.treasure > 0) {
    return {
      title: 'Why did she do that?',
      text: `She picked up ${w.basket.treasure === 1 ? 'a treasure' : `${w.basket.treasure} treasures`} and never came to grandma. The magpie's lessons went from treasure to treasure before heading home, and the hunt used up her energy.${cutoff}`,
      card: 'magpieTeacher',
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
  if ((stats?.teacherCounts.crow ?? 0) > 0 && bumpsHome >= Math.max(3, n * 0.25)) {
    return {
      title: 'Why did she do that?',
      text: `She walked into trees ${bumpsHome} times, always in the direction of home, until her energy ran out. In the crow's lessons the crow flew straight on over trees. She can't fly, but that is the move she learned.${cutoff}`,
      card: 'crowTeacher',
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
