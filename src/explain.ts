/** The "Why did she do that?" note after a trip, and the LM corner cards. */
import type { Walker } from './sim';
import type { TrainStats } from './train';
import { buildVocabulary, viewKey } from './tokens';
import { Forest, MOVE_NAMES, SWAMP, SWAMP_COST, walkingDistances } from './world';

export type CardKey =
  | 'forest' | 'view' | 'memory' | 'memorySize' | 'hint' | 'lessons' | 'teacher' | 'coverage' | 'arrows'
  | 'boldness' | 'energy' | 'hallucination' | 'repetition' | 'exposure' | 'practice' | 'outdated' | 'home'
  | 'tech' | 'vocabulary' | 'judge' | 'swamp';

export const CARDS: Record<CardKey, string> = {
  forest: "The forest is her whole world, like the text a language model works with. She only ever sees a small piece of it at a time.",
  view: "What she sees around her (a 3 × 3 window) is one input token, like one word a language model reads.",
  memory: "Her memory strip is like a language model's context window: everything she can take into account right now.",
  memorySize: "Memory size is fixed before training, like a model's context length. Changing it means training a new Red Riding Hood.",
  hint: "The smell of grandma's cake gives her one more input. More useful information in the input means better predictions.",
  lessons: "Parents' lessons are pretraining: she learns by predicting the next move in many example walks, as a language model learns by predicting the next word in example text.",
  teacher: "Who teaches her shapes how she behaves. A language model's habits come from its training data, including its biases.",
  coverage: "The heatmap shows where she was taught. Like a model's training data, it never covers everything equally.",
  arrows: "The thickness of the arrows shows how likely each move is: these are the next-token probabilities.",
  boldness: "Boldness is temperature. Low boldness makes her pick the likeliest move; high boldness makes her take more chances.",
  energy: "Energy is her step budget, like a model's maximum output length. When it runs out, she stops wherever she is.",
  hallucination: "She walked confidently into danger in a place she was hardly taught. Language models do the same on unfamiliar input: they hallucinate with confidence.",
  repetition: "She went round in circles. With a short memory, look-alike places all seem the same, like a model repeating itself when its context is too short.",
  exposure: "Lessons were always perfect, so she never learned how to recover after a wrong step. Practice on her own fixes that.",
  practice: "Practice is fine-tuning from feedback: she tries on her own and each whole run is judged, like RLHF judging a model's answers.",
  outdated: "The forest changed after her lessons, but she didn't. That's a knowledge cutoff: the world moved on, the model did not.",
  home: "She got home, one predicted step at a time, the way a language model writes one predicted word at a time.",
  tech: "This tab shows the real numbers behind the pictures: tokens, inputs, weights and probabilities.",
  vocabulary: "Her vocabulary is every view that can happen in this forest plus the four moves, just as a model has a fixed list of tokens.",
  swamp: "Not every step is equally cheap: a swamp step uses 3 energy. Her energy is like a model's output budget, and the swamp eats it fast. The hurried father wades through; the careful mother walks around.",
  judge: "The judge knows the whole forest and scores each run by walking distance. She never sees the map, only the score.",
};

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
