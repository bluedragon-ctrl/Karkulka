/** Tab 5, Inside the model: the real numbers behind the friendly pictures. */
import { Model, N_OUT, forward, parameterCount, softmax } from '../model';
import type { Walker } from '../sim';
import { FIXED, TrainStats } from '../train';
import { HINT_FEATS, SLOT_FEATS, VIEW_FEATS, buildVocabulary } from '../tokens';
import { Forest, MOVE_ARROWS, MOVE_NAMES, MOVES } from '../world';
import { lineChart } from './charts';
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
}

const fmt = (v: number, d = 3) => (Math.abs(v) < 5e-4 ? '0' : v.toFixed(d));

function section(title: string, intro: string, ...body: (Node | null)[]) {
  return h('section', { class: 'tech-section' }, h('h3', {}, title), h('p', { class: 'muted' }, intro), ...body);
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

export function renderTech(el: HTMLElement, ctx: TechContext) {
  const { forest, model, stats, walker } = ctx;
  const vocab = buildVocabulary(forest);
  el.replaceChildren();
  el.append(h('h2', {}, 'Inside the model'), h('p', { class: 'muted' }, 'The real numbers behind the friendly pictures. Everything here is read-only, apart from export and import.'));

  // Vocabulary
  const outToks = h('div', { class: 'vocab' }, ...MOVES.map((m) => h('span', { class: 'vocab-item' }, moveToken(m, 27), h('code', {}, `#${m}`), MOVE_NAMES[m])));
  const inToks = h('div', { class: 'vocab' }, ...vocab.map((v) => h('span', { class: 'vocab-item', title: `${v.places.length} place${v.places.length === 1 ? '' : 's'} look like this` }, viewToken(v.view, 8), h('code', {}, `#${v.id}`), v.places.length > 1 ? h('small', {}, `×${v.places.length}`) : null)));
  el.append(section('Vocabulary', `${N_OUT} output tokens (moves) and ${vocab.length} input tokens (every view that occurs in this forest). "×n" marks look-alike views that occur in n places.`,
    h('h4', {}, 'Output tokens'), outToks, h('h4', {}, 'Input tokens'), inToks));

  // Current input
  if (model && walker) {
    const n = walker.decisions.length;
    const k = Math.min(ctx.step, walker.done ? n - 1 : n);
    const d = k < n ? walker.decisions[k] : walker.decide();
    const x = d.input;
    const fw = forward(model, x);
    const tempered = softmax(fw.logits, ctx.boldness);
    const slider = h('input', { type: 'range', min: 0, max: walker.done ? n - 1 : n, value: k, oninput: (e: Event) => ctx.onStep(Number((e.target as HTMLInputElement).value)) });
    const rows: HTMLElement[] = [vectorRow('current view', x, 0, VIEW_FEATS)];
    let off = VIEW_FEATS;
    if (model.cfg.hint) { rows.push(vectorRow('home hint', x, off, HINT_FEATS)); off += HINT_FEATS; }
    for (let s = 1; s <= model.cfg.memory; s++, off += SLOT_FEATS) {
      rows.push(vectorRow(`${s} step${s === 1 ? '' : 's'} back`, x, off, SLOT_FEATS));
    }
    const hidden = h('span', { class: 'vec' }, ...Array.from(fw.h, (v, j) => h('span', { class: 'bit act', style: `background:${v >= 0 ? `rgba(230,120,0,${Math.abs(v)})` : `rgba(31,120,180,${Math.abs(v)})`}`, title: `h[${j}] = ${fmt(v)}` })));
    el.append(section('Current input', `The context window at step ${k + 1} of her latest trip, encoded as ${model.nIn} numbers. Each view is 8 tiles × 4 tile kinds (one-hot); each remembered step adds a "present" flag, a view and a move (${SLOT_FEATS} numbers).`,
      h('label', { class: 'row' }, 'Step ', slider, ` ${k + 1} / ${walker.done ? n : n + 1}`),
      h('div', { class: 'vec-block' }, ...rows),
      h('div', { class: 'vec-row' }, h('span', { class: 'vec-label' }, `hidden (${model.nH})`), hidden),
      probTable([
        { label: 'logits', values: fw.logits },
        { label: 'probabilities', values: softmax(fw.logits) },
        { label: `after boldness ${ctx.boldness.toFixed(1)}`, values: tempered },
      ])));
  } else {
    el.append(section('Current input', 'Send her on a trip alone to see the numbers she reads at each step.'));
  }

  // Network
  if (model) {
    el.append(section('Network', `${model.nIn} inputs → ${model.nH} hidden units (tanh) → ${N_OUT} outputs (softmax): ${parameterCount(model).toLocaleString('en')} numbers in total. Orange weights are positive, blue negative.`,
      h('div', { class: 'weights-wrap' },
        weightCanvas(model.w1, model.nH, model.nIn, 3, `input → hidden weights (${model.nH} × ${model.nIn})`),
        weightCanvas(model.w2, N_OUT, model.nH, 6, `hidden → output weights (${N_OUT} × ${model.nH})`))));
  } else {
    el.append(section('Network', 'No model yet: give her some lessons first.'));
  }

  el.append(section('Loss curves', 'Lessons: average per-step loss (cross-entropy against the parent\'s move; lower is better). Practice: average score per run from the judge (higher is better).',
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
    ['Score when lost', `−${FIXED.lostPenalty}, plus up to ${FIXED.partialCreditWeight} for ending closer (walking distance)`],
    ['Exploration during practice (boldness)', String(FIXED.practiceBoldness)],
    ['Curriculum', `start ${FIXED.curriculumStart} steps, +${FIXED.curriculumStep} when ${FIXED.curriculumThreshold * 100}% of the last ${FIXED.curriculumWindow} runs reach home`],
    ['Curriculum now', `${stats.radius} steps from home`],
    ['Test trips for the outcome chart', `${FIXED.evalStarts} fixed starts, boldness ${FIXED.evalBoldness}, energy ${FIXED.evalEnergy}`],
    ['Lessons / practice runs so far', `${stats.lessons} / ${stats.practiceRuns}`],
  ];
  el.append(section('Fixed settings', 'These are never set by the user.',
    h('table', { class: 'num-table fixed' }, h('tbody', {}, ...fixedRows.map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', {}, b)))))));

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden-input', onchange: (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) ctx.onImport(f);
  } });
  el.append(section('Export and import', 'Save the trained model and its forest as a file, or load one.',
    h('div', { class: 'row' },
      h('button', { onclick: ctx.onExport, disabled: !model }, 'Export model'),
      h('button', { onclick: () => fileInput.click() }, 'Import model'), fileInput)));
}
