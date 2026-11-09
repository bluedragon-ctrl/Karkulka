/** Tab 6, Inside the model: the real numbers behind the friendly pictures. */
import type { CardKey } from '../explain';
import { Model, N_OUT, parameterCount, softmax } from '../model';
import type { Walker } from '../sim';
import { FIXED, TrainStats } from '../train';
import { BASKET_FEATS, ENERGY_FEATS, ENERGY_LEVELS, HINT_FEATS, PINNED_FEATS, ViewToken, buildVocabulary, slotFeats, viewFeats, viewKinds } from '../tokens';
import { Forest, MOVE_ARROWS, MOVE_NAMES, MOVES, SWAMP_COST } from '../world';
import { HUNTSMAN_ENERGY, SWAMP_PENALTY, WOLF_PENALTY } from '../teachers';
import {
  Ambiguous, BIG_MODEL, OPS_PER_WEIGHT, RARE, ambiguityByTeacher, chanceText, frequencySummary, sci, sup, tokenCounts, trainingCompute, tripMeasures,
} from '../measures';
import { lineChart, rankChart } from './charts';
import { h } from './dom';
import { COLORS, moveToken, viewToken } from './symbols';

export interface TechContext {
  forest: Forest;
  model: Model | null;
  stats: TrainStats;
  walker: Walker | null;
  boldness: number;
  step: number;
  onStep: (k: number) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  /** A "?" button that opens the LM corner card for `key`. */
  hint: (key: CardKey) => Node;
}

const fmt = (v: number, d = 3) => (Math.abs(v) < 5e-4 ? '0' : v.toFixed(d));

function section(title: string, hint: Node | null, intro: string, ...body: (Node | null)[]) {
  return h('section', { class: 'tech-section' }, h('h3', {}, title, hint), h('p', { class: 'muted' }, intro), ...body);
}

/** Diverging heatmap (blue negative, orange positive) of a weight matrix. */
function weightCanvas(w: Float32Array, rows: number, cols: number, cell: number, label: string): HTMLElement {
  const c = h('canvas', { width: cols * cell, height: rows * cell, class: 'weights', 'aria-label': label });
  const ctx = c.getContext('2d');
  if (ctx) {
    let max = 1e-6;
    for (const v of w) max = Math.max(max, Math.abs(v));
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const v = w[r * cols + k] / max;
        const a = Math.min(1, Math.abs(v));
        ctx.fillStyle = v >= 0 ? `rgba(230,120,0,${a})` : `rgba(31,120,180,${a})`;
        ctx.fillRect(k * cell, r * cell, cell, cell);
      }
    }
  }
  return h('figure', { class: 'weights-fig' }, c, h('figcaption', { class: 'muted' }, label));
}

function vectorRow(label: string, x: Float32Array, from: number, len: number) {
  const cells = h('span', { class: 'vec' });
  for (let i = from; i < from + len; i++) cells.append(h('span', { class: `bit ${x[i] ? 'on' : ''}`, title: `x[${i}] = ${x[i]}` }));
  return h('div', { class: 'vec-row' }, h('span', { class: 'vec-label' }, label), cells);
}

function probTable(rows: { label: string; values: ArrayLike<number> }[]) {
  return h('table', { class: 'num-table' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), ...MOVES.map((m) => h('th', {}, `${MOVE_ARROWS[m]} ${MOVE_NAMES[m]}`)))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, h('th', {}, r.label), ...MOVES.map((m) => h('td', {}, fmt(r.values[m])))))));
}

/** The context window at one step: the slider stays put while the numbers under it are redrawn. */
function currentInput(ctx: TechContext): HTMLElement {
  const { model, walker } = ctx;
  if (!model || !walker) return section('Current input', ctx.hint('oneHot'), 'Send her on a trip alone to see the numbers she reads at each step.');
  const n = walker.decisions.length;
  const last = walker.done ? n - 1 : n;
  const counter = h('span');
  const body = h('div');
  const VF = viewFeats(model.cfg);
  const SF = slotFeats(model.cfg);
  const kinds = model.cfg.wolfToken ? `${viewKinds(model.cfg)} kinds (the tile kinds and the walking wolf)` : `${viewKinds(model.cfg)} tile kinds`;
  const draw = (step: number) => {
    const k = Math.min(step, last);
    counter.textContent = ` ${k + 1} / ${last + 1}`;
    // Each decision keeps the numbers the model produced at the time, so nothing is recomputed.
    const d = k < n ? walker.decisions[k] : walker.decide();
    const x = d.input;
    const rows: HTMLElement[] = [vectorRow('basket (pinned)', x, 0, BASKET_FEATS), vectorRow('energy (pinned)', x, BASKET_FEATS, ENERGY_FEATS), vectorRow('current view', x, PINNED_FEATS, VF)];
    let off = PINNED_FEATS + VF;
    if (model.cfg.hint) { rows.push(vectorRow('home hint', x, off, HINT_FEATS)); off += HINT_FEATS; }
    for (let s = 1; s <= model.cfg.memory; s++, off += SF) {
      rows.push(vectorRow(`${s} step${s === 1 ? '' : 's'} back`, x, off, SF));
    }
    const hidden = h('span', { class: 'vec' }, ...Array.from(d.hidden, (v, j) => h('span', { class: 'bit act', style: `background:${v >= 0 ? `rgba(230,120,0,${Math.abs(v)})` : `rgba(31,120,180,${Math.abs(v)})`}`, title: `h[${j}] = ${fmt(v)}` })));
    body.replaceChildren(
      h('div', { class: 'vec-block' }, ...rows),
      h('div', { class: 'vec-row' }, h('span', { class: 'vec-label' }, `hidden (${model.nH})`), hidden),
      probTable([
        { label: 'logits', values: d.logits },
        { label: 'probabilities', values: d.raw },
        { label: `after boldness ${ctx.boldness.toFixed(1)}`, values: softmax(d.logits, ctx.boldness) },
      ]));
  };
  const k0 = Math.min(ctx.step, last);
  const slider = h('input', { type: 'range', min: 0, max: last, value: k0, oninput: (e: Event) => {
    const v = Number((e.target as HTMLInputElement).value);
    ctx.onStep(v);
    draw(v);
  } });
  draw(k0);
  return section('Current input', ctx.hint('oneHot'), `The context window at one step of her latest trip, encoded as ${model.nIn} numbers. First the pinned basket (${BASKET_FEATS} numbers: cake yes or no, flowers 0, 1 or 2+, treasure 0, 1 or 2+) and her energy (${ENERGY_FEATS} numbers: below ${ENERGY_LEVELS[0]}, ${ENERGY_LEVELS.slice(0, -1).map((l, k) => `${l}–${ENERGY_LEVELS[k + 1] - 1}`).join(', ')}, ${ENERGY_LEVELS.at(-1)} or more), which never scroll out. Each view is 8 tiles × ${kinds} (one-hot); each remembered step adds a "present" flag, a view and a move (${SF} numbers).`,
    h('label', { class: 'row' }, 'Step ', slider, counter), body);
}

const TEACHER_LABEL: Record<'mother' | 'father', string> = { mother: 'careful mother', father: 'hurried father' };

/** The parents whose look-alike tokens matter: the ones she learned from (the wolf walks home like the father), or both before any lessons. */
function parentsTaught(stats: TrainStats): ('mother' | 'father')[] {
  const c = stats.teacherCounts;
  const out: ('mother' | 'father')[] = [];
  if (c.mother > 0) out.push('mother');
  if (c.father > 0 || (c.wolf ?? 0) > 0) out.push('father');
  return out.length ? out : ['mother', 'father'];
}

/** How often each input token came up in lessons. */
function trainingData(counts: number[], stats: TrainStats, hint: (key: CardKey) => Node): HTMLElement {
  const sum = frequencySummary(counts);
  if (!sum.total) {
    return section('Training data', hint('tokenFreq'), stats.lessons ? 'No lessons in this forest yet: she was taught somewhere else.' : 'No lessons yet.');
  }
  const pct = Math.round(sum.topShare * 100);
  return section('Training data', hint('tokenFreq'),
    `${sum.total.toLocaleString('en')} lesson predictions over ${counts.length} input tokens. The most common tenth of the tokens make up ${pct}% of them. ` +
    `${sum.unseen} token${sum.unseen === 1 ? ' was' : 's were'} never seen and ${sum.rare} seen fewer than ${RARE} times (dashed in the vocabulary above): there she can only guess.`,
    h('div', { class: 'charts-2 one' }, rankChart(counts, COLORS.mother, 'lesson predictions per input token, most common first')));
}

function arrowsOf(moves: readonly number[]) { return moves.map((m) => MOVE_ARROWS[m]).join('/'); }

/** Look-alike tokens where the teacher's best move depends on the place. */
function lookAlikes(vocab: ViewToken[], counts: number[], amb: Record<'mother' | 'father', Map<number, Ambiguous>>, parents: ('mother' | 'father')[], hintOn: boolean, hint: (key: CardKey) => Node): HTMLElement {
  const multi = vocab.filter((v) => v.places.length > 1).length;
  const ids = new Set(parents.flatMap((t) => [...amb[t].keys()]));
  const total = counts.reduce((a, b) => a + b, 0);
  const onAmb = vocab.reduce((a, v, i) => a + (ids.has(v.id) ? counts[i] : 0), 0);
  const per = (['mother', 'father'] as const).map((t) => `${amb[t].size} for the ${TEACHER_LABEL[t]}`).join(', ');
  const intro = `${multi} of ${vocab.length} input tokens occur in more than one place. For some of them no single move is right at every place (${per}): ` +
    `the view alone can't tell her what to do, only her memory${hintOn ? ' or the smell of cake' : ''} can.` +
    (total ? ` ${Math.round((100 * onAmb) / total)}% of her lesson predictions were on such tokens.` : '');
  const lists = parents.map((t) => {
    const items = [...amb[t].values()];
    if (!items.length) return null;
    return h('div', {},
      h('h4', {}, `The ${TEACHER_LABEL[t]}'s best move at each place`),
      h('div', { class: 'vocab' }, ...items.map((a) => h('span', { class: 'vocab-item ambig', title: `${a.moves.length} places; best moves: ${a.moves.map(arrowsOf).join(', ')}` },
        viewToken(a.token.view, 8), h('code', {}, `#${a.token.id}`), h('span', { class: 'amb-moves' }, a.moves.map(arrowsOf).join(' '))))));
  });
  return section('Look-alike tokens', hint('ambiguous'), intro, ...lists);
}

/** How sure she was at each step of her latest trip, and how likely that exact walk was. */
function latestTrip(walker: Walker | null, hint: (key: CardKey) => Node): HTMLElement {
  const tm = walker ? tripMeasures(walker) : null;
  const n = tm?.entropy.length ?? 0;
  if (!walker || !tm || !n) return section('Her latest trip', hint('uncertainty'), 'Send her on a trip alone to see how sure she was at each step.');
  const avg = tm.entropy.reduce((a, b) => a + b, 0) / n;
  const cells = h('div', { class: 'step-cells' }, ...tm.top.map((top, t) => {
    const p = walker.decisions[t].tempered[walker.history.moves[t]];
    return h('span', { class: `step-cell ${top ? 'step-top' : 'step-other'}`, title: `step ${t + 1}: ${MOVE_NAMES[walker.history.moves[t]]}, ${Math.round(p * 100)}%${top ? ', her top move' : ', not her top move'}` });
  }));
  return section('Her latest trip', hint('uncertainty'),
    `${tm.topCount} of ${n} steps took her most likely move (filled squares)` +
    (n > tm.topCount ? `; ${n - tm.topCount === 1 ? 'one was' : `the other ${n - tm.topCount} were`} picked by chance against the odds (hollow). ` : '. ') +
    `Average uncertainty ${avg.toFixed(2)} bits (0 = sure, 2 = all four moves equally likely). Chance of exactly this walk at the boldness used: ${chanceText(tm.log2Chance)}${walker.done ? '' : ' so far'}.`,
    h('div', { class: 'charts-2 one' }, lineChart([{ points: tm.entropy.map((y, t) => ({ x: t + 1, y })), color: '#e07b00', label: 'uncertainty at each step (bits)' }], 'uncertainty', 2)),
    cells);
}

/** What her training cost, next to a big model with published numbers. */
function computeSection(model: Model | null, stats: TrainStats, hint: (key: CardKey) => Node): HTMLElement {
  if (!model) return section('Training compute', hint('compute'), 'No model yet: give her some lessons first.');
  const c = trainingCompute(model, stats);
  const preds = c.lessonSteps + c.practiceSteps;
  const ratio = c.ops > 0 ? Math.round(Math.log10(BIG_MODEL.ops / c.ops)) : null;
  return section('Training compute', hint('compute'),
    `Rule of thumb, as used for big models: about ${OPS_PER_WEIGHT} operations per weight for every prediction learned from (2 forward, 4 backward). ` +
    'Her inputs are mostly zeros, so her real count is lower.' + (c.estimated ? ' This save is older than the step counter, so some steps are estimated or missing.' : ''),
    h('table', { class: 'num-table' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Red Riding Hood'), h('th', {}, BIG_MODEL.name))),
      h('tbody', {},
        h('tr', {}, h('th', {}, 'Weights'), h('td', {}, sci(c.weights)), h('td', {}, sci(BIG_MODEL.weights))),
        h('tr', {}, h('th', {}, 'Training predictions'), h('td', { title: `lessons ${c.lessonSteps.toLocaleString('en')}, practice ${c.practiceSteps.toLocaleString('en')}` }, sci(preds)), h('td', {}, `${sci(BIG_MODEL.tokens)} tokens`)),
        h('tr', {}, h('th', {}, 'Training operations'), h('td', {}, sci(c.ops)), h('td', {}, sci(BIG_MODEL.ops))))),
    ratio !== null ? h('p', { class: 'muted' }, `Its training took about 10${sup(ratio)} times as many operations as hers so far.`) : null);
}

export function renderTech(el: HTMLElement, ctx: TechContext) {
  const { forest, model, stats } = ctx;
  const vocab = buildVocabulary(forest);
  const counts = tokenCounts(vocab, stats.coverage);
  const amb = ambiguityByTeacher(forest, vocab);
  const parents = parentsTaught(stats);
  const isAmb = (id: number) => parents.some((t) => amb[t].has(id));
  el.replaceChildren();
  el.append(h('h2', {}, 'Inside the model', ctx.hint('tech')), h('p', { class: 'muted' }, 'The real numbers behind the friendly pictures. Everything here is read-only, apart from export and import.'));

  // Vocabulary
  const outToks = h('div', { class: 'vocab' }, ...MOVES.map((m) => h('span', { class: 'vocab-item' }, moveToken(m, 27), h('code', {}, `#${m}`), MOVE_NAMES[m])));
  const inToks = h('div', { class: 'vocab' }, ...vocab.map((v, i) => h('span', {
    class: `vocab-item ${counts[i] < RARE ? 'unseen' : ''}`,
    title: `${v.places.length} place${v.places.length === 1 ? '' : 's'} look like this; seen ${counts[i]} time${counts[i] === 1 ? '' : 's'} in lessons${isAmb(v.id) ? '; the right move depends on the place' : ''}`,
  }, viewToken(v.view, 8), h('code', {}, `#${v.id}`),
  v.places.length > 1 ? h('small', {}, `×${v.places.length}`, isAmb(v.id) ? h('span', { class: 'amb-mark', 'aria-label': 'right move depends on the place' }, ' ≠') : null) : null,
  h('span', { class: 'seen' }, String(counts[i])))));
  el.append(section('Vocabulary', ctx.hint('vocabulary'), `${N_OUT} output tokens (moves) and ${vocab.length} input tokens (every view that occurs in this forest). "×n" marks look-alike views that occur in n places, "≠" those where the right move depends on the place. The number under each token is how often it came up in lessons; dashed ones were seen fewer than ${RARE} times.`,
    h('h4', {}, 'Output tokens'), outToks, h('h4', {}, 'Input tokens'), inToks));
  el.append(trainingData(counts, stats, ctx.hint), lookAlikes(vocab, counts, amb, parents, !!model?.cfg.hint, ctx.hint));

  el.append(currentInput(ctx), latestTrip(ctx.walker, ctx.hint));

  // Network
  if (model) {
    el.append(section('Network', ctx.hint('weights'), `${model.nIn} inputs → ${model.nH} hidden units (tanh) → ${N_OUT} outputs (softmax): ${parameterCount(model).toLocaleString('en')} numbers in total. Orange weights are positive, blue negative.`,
      h('div', { class: 'weights-wrap' },
        weightCanvas(model.w1, model.nH, model.nIn, 3, `input → hidden weights (${model.nH} × ${model.nIn})`),
        weightCanvas(model.w2, N_OUT, model.nH, 6, `hidden → output weights (${N_OUT} × ${model.nH})`))));
  } else {
    el.append(section('Network', ctx.hint('weights'), 'No model yet: give her some lessons first.'));
  }

  el.append(section('Loss curves', ctx.hint('loss'), 'Lessons: average per-step loss (cross-entropy against the parent\'s move; lower is better). Practice: average score per run from the judge that was chosen (higher is better, but a high score from the crow can mean reward hacking).',
    h('div', { class: 'charts-2' },
      lineChart([{ points: stats.lessonLoss, color: COLORS.mother, label: 'lesson loss' }], 'loss'),
      lineChart([{ points: stats.practiceScore, color: '#e07b00', label: 'practice score' }], 'score'))));

  const fixedRows: [string, string][] = [
    ['Context (memory)', model ? `${model.cfg.memory} view–move pairs` : '–'],
    ['Home hint input', model ? (model.cfg.hint ? 'on' : 'off') : '–'],
    ['Hidden units', String(FIXED.hidden)],
    ['Lesson learning rate (Adam)', String(FIXED.lessonLearningRate)],
    ['Practice learning rate (gradient descent, clipped)', String(FIXED.practiceLearningRate)],
    ['Reward: home / eaten', `${FIXED.rewardHome} / ${FIXED.rewardEaten}`],
    ['Score when lost', `−${FIXED.lostPenalty}, plus up to ${FIXED.partialCreditWeight} for ending closer (energy still needed to get home)`],
    ['Judges', `Grandma: the scores above. Father: also −${FIXED.fatherStepCost} per step. Mother: also −${FIXED.motherSwampPenalty} per swamp step, −${FIXED.motherWolfPenalty} per step with a den in sight. Crow: ±${FIXED.crowHeading} per step towards or away from home in a straight line, +${FIXED.crowHomeBonus} home, ${FIXED.rewardEaten} eaten, 0 lost. Magpie: +${FIXED.magpieTreasure} per treasure at pickup, +${FIXED.magpieHome} home, ${FIXED.rewardEaten} eaten, 0 lost. Huntsman: Grandma's home, eaten and lost scores, +${FIXED.huntsmanStep} per step walked if she gets home, +${FIXED.huntsmanDen} per den when it first comes in sight (taken back if eaten). Hedgehog: Grandma's home, eaten and lost scores, +${FIXED.hedgehogBerries} per berry bush eaten from (taken back if eaten). Wolf: +${FIXED.wolfDen} per step into a den (cake grabbed, eaten, or the wolf out), ${FIXED.wolfHome} home, 0 lost`],
    ['Basket points', `Grandma and mother: −${FIXED.cakeLost} when the wolf grabs the cake. Grandma: +${FIXED.grandmaFlowers} per bunch of flowers brought home. Father: +${FIXED.fatherTreasure} per treasure at pickup. Being eaten takes back all basket points`],
    ['Wolf out (an option)', `Each step onto a den on a trip alone or a practice run, the wolf is out with the chance set in Settings (never in lessons): nothing happens and she runs on. Father: +${FIXED.fatherDenShortcut} per step through a den while the wolf is out. Huntsman: +${FIXED.huntsmanDenInside} per den she looks inside while the wolf is out (once per den). Both taken back if eaten`],
    ['Wolf in disguise (teacher)', `Walks the father's route until a den is in her view, then takes the quickest way into it. "Mother, and sometimes the wolf": ${FIXED.wolfLessonShare * 100}% of lessons are the wolf's`],
    ['Grandma, magpie, huntsman and hedgehog (teachers)', `Grandma: to the nearest flower patch the mother's way, then home the mother's way. Magpie: to the nearest treasure not yet picked in the fewest steps, then the next, then home the father's way. Huntsman: to the nearest tile with a den not yet seen in sight, in the fewest steps, while he can still get her home on the energy she has left (his lessons start with ${HUNTSMAN_ENERGY}), then the next, then home the father's way. Hedgehog: while she has at least half her starting energy, to the nearest berry bush she can still get home from, then the next; below half, home the way that takes the least energy. None steps onto a den`],
    ['Crow (teacher)', 'Steps towards home in a straight line, the longer way first, onto any tile she can walk but a den. With only trees ahead it flies over one: the lesson ends with her move into the tree. With only a den ahead the lesson ends'],
    ['Practice credit', 'Reward to go: each move is credited with the points from that move to the end of the run, minus a running average (baseline), clipped to ±1'],
    ['Energy per step', `1 on path, ${SWAMP_COST} in a swamp, 1 for bumping into a tree`],
    ['Careful mother\'s extra cost', `+${WOLF_PENALTY} next to a wolf den, +${SWAMP_PENALTY} in a swamp (the father counts only steps)`],
    ['Exploration during practice (boldness)', String(FIXED.practiceBoldness)],
    ['Curriculum', `start ${FIXED.curriculumStart} steps, +${FIXED.curriculumStep} when ${FIXED.curriculumThreshold * 100}% of the last ${FIXED.curriculumWindow} runs reach home`],
    ['Curriculum now', `${stats.radius} steps from home (when practice starts close to home first)`],
    ['Test trips for the outcome chart', `${FIXED.evalStarts} fixed starts, boldness ${FIXED.evalBoldness}, the energy set in Settings; about ${FIXED.evalPoints} times per job (every batch of ${FIXED.chunk} in short jobs)`],
    ['Lessons / practice runs so far', `${stats.lessons} / ${stats.practiceRuns}`],
  ];
  el.append(computeSection(model, stats, ctx.hint));
  el.append(section('Fixed settings', ctx.hint('hyper'), 'These are never set by the user.',
    h('table', { class: 'num-table fixed' }, h('tbody', {}, ...fixedRows.map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', {}, b)))))));

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden-input', onchange: (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) ctx.onImport(f);
  } });
  el.append(section('Export and import', ctx.hint('modelFile'), 'Save the trained model and its forest as a file, or load one.',
    h('div', { class: 'row' },
      h('button', { onclick: ctx.onExport, disabled: !model }, 'Export model'),
      h('button', { onclick: () => fileInput.click() }, 'Import model'), fileInput)));
}
