/** The app: five tabs that tell the story in order. */
import { CARDS, CardKey, explainTrip } from '../explain';
import { generateForest } from '../forest';
import { Adam, Model, createAdam, createModel, modelFromJSON, modelToJSON } from '../model';
import { mulberry32, normalizeCode, randomCode } from '../rng';
import { Walker, predictAt } from '../sim';
import * as store from '../storage';
import { LessonWalk, Teacher, TeacherChoice, costToHome, teacherMoves, walkLesson } from '../teachers';
import { MEMORY_PAIRS, MemorySize, ModelConfig } from '../tokens';
import { FIXED, TrainStats, chooseTeacher, evaluate, learnFromLesson, newStats, startTiles } from '../train';
import { runTraining } from '../workerTypes';
import {
  Forest, HOME, MOVES, MOVE_ARROWS, MOVE_NAMES, PATH, SWAMP, SWAMP_COST, TREE, Tile, WOLF, copyForest, homeSector, unreachableTiles,
  walkingDistances,
} from '../world';
import { Board } from './board';
import { outcomeChart } from './charts';
import { add, clear, h, s } from './dom';
import { renderStrip } from './strip';
import { COLORS, parentFigure, tileSymbol } from './symbols';
import { renderTech } from './tech';

type TabId = 'forest' | 'lessons' | 'trip' | 'practice' | 'inside';
const TABS: { id: TabId; label: string }[] = [
  { id: 'forest', label: '1. Forest' },
  { id: 'lessons', label: '2. Lessons' },
  { id: 'trip', label: '3. Trip alone' },
  { id: 'practice', label: '4. Practice' },
  { id: 'inside', label: '5. Inside the model' },
];

interface Settings {
  memory: MemorySize;
  hint: boolean;
  teacher: TeacherChoice;
  lessons: number;
  practice: number;
  energy: number;
  boldness: number;
  fog: boolean;
  heat: boolean;
  brush: Tile;
}

const DEFAULTS: Settings = {
  memory: 'medium', hint: false, teacher: 'mother', lessons: 100, practice: 500,
  energy: 80, boldness: 0.7, fog: false, heat: true, brush: TREE,
};

const TEACHERS: { id: TeacherChoice; name: string; text: string }[] = [
  { id: 'mother', name: 'Careful mother', text: 'Safe, dry routes that keep away from wolf dens and swamps, even if longer.' },
  { id: 'father', name: 'Hurried father', text: 'The fewest steps, even right past wolf dens and straight through swamps.' },
  { id: 'both', name: 'Both', text: 'A mix of lessons; her arrows split where the two disagree.' },
];

const OUTCOME_COLORS: Record<string, string> = { home: '#c99700', eaten: COLORS.danger, lost: COLORS.lost, mother: COLORS.mother, father: COLORS.father };

interface Job { kind: 'lessons' | 'practice' | 'watch'; done: number; total: number; cancel: () => void }

export class App {
  forest: Forest;
  edited = false;
  /** The forest tiles she was taught on (to spot a knowledge cutoff). */
  modelTiles = '';
  settings: Settings = { ...DEFAULTS };
  model: Model | null = null;
  opt: Adam | null = null;
  stats: TrainStats;
  tab: TabId = 'forest';
  job: Job | null = null;
  walker: Walker | null = null;
  watch: { walk: LessonWalk; k: number } | null = null;
  techStep = 0;
  card: CardKey | null = 'forest';
  why: { title: string; text: string } | null = null;
  private auto: number | null = null;
  private saveTimer: number | null = null;
  private rng = mulberry32((Math.random() * 2 ** 32) >>> 0);

  // DOM
  private tabsEl = h('nav', { class: 'tabs', role: 'tablist' });
  private banner = h('div', { class: 'banner', hidden: true });
  private stage = h('div', { class: 'stage' });
  private boardWrap = h('div', { class: 'board-wrap' });
  private panel = h('aside', { class: 'panel' });
  private panelBody = h('div', { class: 'panel-body' });
  private cardEl = h('div', { class: 'lm-card', 'aria-live': 'polite' });
  private stripEl = h('div', { class: 'strip' });
  private techEl = h('div', { class: 'tech', hidden: true });
  private board: Board;

  constructor(root: HTMLElement) {
    root.append(
      h('header', { class: 'top' },
        h('div', { class: 'title' }, h('h1', {}, 'Red Riding Hood LM'), h('p', {}, 'She walks home one predicted step at a time, the way a language model writes one predicted token at a time.')),
        this.tabsEl),
      this.banner,
      this.stage,
    );
    this.stage.append(h('div', { class: 'main-col' }, this.boardWrap, this.stripEl), this.panel, this.techEl);
    this.panel.append(this.panelBody, this.cardEl);
    this.board = new Board(this.boardWrap);
    this.board.onTileDown = (i) => this.onTile(i, false);
    this.board.onTileDrag = (i) => this.onTile(i, true);

    this.forest = generateForest('KARKULKA');
    this.stats = newStats(this.forest);
    this.restore();
    this.board.setForest(this.forest);
    this.render();
  }

  // ---------- state helpers ----------

  get trained() { return !!this.model && this.stats.lessons > 0; }
  get outdated() { return this.trained && this.modelTiles !== store.packTiles(this.forest.tiles); }

  private markTrained() { this.modelTiles = store.packTiles(this.forest.tiles); }
  get busy() { return this.job !== null; }

  private configFromSettings(): ModelConfig {
    return { memory: MEMORY_PAIRS[this.settings.memory], hint: this.settings.hint, hidden: FIXED.hidden };
  }

  private ensureModel(): Model {
    if (!this.model) {
      this.model = createModel(this.configFromSettings(), this.rng);
      this.opt = createAdam(this.model);
      this.stats = newStats(this.forest);
    }
    return this.model;
  }

  private resetModel() {
    this.stopTrip();
    this.model = null;
    this.opt = null;
    this.stats = newStats(this.forest);
    this.walker = null;
    this.why = null;
    this.board.clearTrails();
  }

  private restore() {
    const link = store.readLink();
    const saved = store.load();
    if (saved) {
      Object.assign(this.settings, saved.settings);
      const f: Forest = generateForest(saved.forest.code, saved.forest.size);
      if (saved.forest.tiles.length === f.tiles.length) f.tiles = saved.forest.tiles;
      this.forest = f;
      this.edited = saved.forest.edited;
      this.modelTiles = saved.modelTiles ?? '';
      try {
        this.model = saved.model ? modelFromJSON(saved.model) : null;
        this.opt = this.model ? createAdam(this.model) : null;
      } catch { this.model = null; }
      this.stats = this.model && saved.stats ? saved.stats : newStats(this.forest);
    }
    if (link) {
      const code = normalizeCode(link.code);
      const linked = generateForest(code);
      if (link.tiles) {
        const tiles = store.unpackTiles(link.tiles, linked.tiles.length);
        if (tiles) { tiles[linked.home] = HOME; linked.tiles = tiles; }
      }
      const same = linked.code === this.forest.code && linked.tiles.every((t, i) => t === this.forest.tiles[i]);
      if (!same) {
        this.forest = linked;
        this.edited = !!link.tiles;
        this.resetModel();
      }
    }
    this.updateLink();
  }

  private saveSoon() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      store.save({
        version: 2,
        forest: { code: this.forest.code, size: this.forest.size, tiles: this.forest.tiles, edited: this.edited },
        modelTiles: this.modelTiles,
        settings: { ...this.settings },
        model: this.model ? modelToJSON(this.model) : null,
        stats: this.model ? this.stats : null,
      });
    }, 400);
  }

  private updateLink() {
    history.replaceState(null, '', store.forestLink(this.forest, this.edited));
  }

  private showCard(key: CardKey) {
    this.card = key;
    this.renderCard();
  }

  // ---------- forest ----------

  private setForest(f: Forest, edited: boolean) {
    if (this.trained && !confirm('A new forest means new lessons. Her current training will be cleared. Continue?')) return false;
    this.forest = f;
    this.edited = edited;
    this.resetModel();
    this.board.setForest(f);
    this.updateLink();
    this.saveSoon();
    this.render();
    return true;
  }

  private onTile(i: number, drag: boolean) {
    if (this.busy) return;
    if (this.tab === 'forest') this.paint(i);
    else if (this.tab === 'trip' && !drag) this.chooseStart(i);
  }

  private paint(i: number) {
    const brush = this.settings.brush;
    if (i === this.forest.home || this.forest.tiles[i] === brush) return;
    this.forest.tiles[i] = brush;
    this.edited = true;
    this.walker = null;
    this.board.updateTile(i, brush);
    if (this.trained) this.showCard('outdated');
    else if (brush === SWAMP) this.showCard('swamp');
    this.updateLink();
    this.saveSoon();
    this.renderBanner();
    this.renderPanel();
  }

  private undoEdits() {
    this.forest.tiles = generateForest(this.forest.code, this.forest.size).tiles;
    this.edited = false;
    this.walker = null;
    this.board.setForest(this.forest);
    this.updateLink();
    this.saveSoon();
    this.render();
  }

  private changeMemoryOrHint(apply: () => void) {
    const before = { ...this.settings };
    apply();
    if (this.model && (this.model.cfg.memory !== MEMORY_PAIRS[this.settings.memory] || this.model.cfg.hint !== this.settings.hint)) {
      if (this.trained && !confirm('This needs a new Red Riding Hood: her memory and senses are fixed before training. Her lessons will be cleared and she needs new ones. Continue?')) {
        this.settings = before;
      } else this.resetModel();
    }
    this.saveSoon();
    this.render();
  }

  // ---------- lessons ----------

  private startLessons() {
    const model = this.ensureModel();
    this.stopTrip();
    const stats = structuredClone(this.stats);
    const total = this.settings.lessons;
    const job = runTraining(
      { kind: 'lessons', model, forest: copyForest(this.forest), stats, count: total, seed: (this.rng() * 2 ** 32) >>> 0, teacher: this.settings.teacher },
      (p) => {
        if (!this.job) return;
        this.job.done = p.done;
        this.stats = p.stats;
        for (const path of p.paths) this.board.addTrail(path.positions, OUTCOME_COLORS[path.tag], 0.1);
        this.renderBoard();
        this.renderPanel();
      },
    );
    this.job = { kind: 'lessons', done: 0, total, cancel: job.cancel };
    this.render();
    job.result.then(({ model: m, stats: st }) => {
      this.model = m;
      this.opt = createAdam(m);
      this.stats = st;
      this.markTrained();
      this.job = null;
      this.saveSoon();
      this.showCard(this.settings.teacher === 'both' ? 'teacher' : 'coverage');
      this.render();
    }).catch(() => { this.job = null; this.render(); });
  }

  private watchLesson() {
    this.ensureModel();
    this.stopTrip();
    const teacher = chooseTeacher(this.settings.teacher, this.rng);
    const starts = startTiles(this.forest);
    if (!starts.length) return;
    const start = starts[Math.floor(this.rng() * starts.length)];
    const walk = walkLesson(this.forest, teacher, costToHome(this.forest, teacher), start, this.rng);
    this.watch = { walk, k: 0 };
    this.board.clearTrails();
    const timer = window.setInterval(() => {
      if (!this.watch) return;
      this.watch.k++;
      if (this.watch.k > walk.history.moves.length) finish();
      else this.renderBoard();
    }, 380);
    const finish = () => {
      clearInterval(timer);
      if (!this.watch || !this.model || !this.opt) return;
      const loss = learnFromLesson(this.model, this.opt, walk, this.stats);
      this.markTrained();
      this.stats.lessonLoss.push({ x: this.stats.lessons, y: loss });
      this.stats.lessonEval.push(evaluate(this.model, this.forest, this.stats.lessons));
      this.board.addTrail(walk.positions, OUTCOME_COLORS[teacher], 0.35);
      this.watch = null;
      this.job = null;
      this.saveSoon();
      this.showCard('exposure');
      this.render();
    };
    this.job = { kind: 'watch', done: 0, total: 1, cancel: () => { clearInterval(timer); this.watch = null; this.job = null; this.render(); } };
    this.showCard('lessons');
    this.render();
  }

  // ---------- trip alone ----------

  private chooseStart(i: number) {
    if (!this.model || !this.trained) return;
    if (this.forest.tiles[i] !== PATH) return;
    this.stopTrip();
    this.walker = new Walker(this.forest, this.model, i, this.settings.energy, this.settings.boldness, this.rng);
    this.why = null;
    this.techStep = 0;
    this.board.clearFx();
    this.showCard('arrows');
    this.render();
  }

  private stepTrip() {
    const w = this.walker;
    if (!w || w.done) return;
    w.temperature = this.settings.boldness;
    w.step();
    if (this.forest.tiles[w.pos] === SWAMP && !w.blocked[w.t - 1] && this.card !== 'swamp' && !w.positions.slice(0, -1).some((p) => this.forest.tiles[p] === SWAMP)) this.showCard('swamp');
    this.techStep = w.decisions.length;
    if (w.done) this.finishTrip();
    this.renderBoard();
    this.renderStripNow();
    this.renderPanel();
  }

  private finishTrip() {
    const w = this.walker!;
    this.stopAuto();
    const e = explainTrip(w, this.forest, this.stats, this.outdated);
    this.why = e;
    if (e.card) this.showCard(e.card);
    if (w.outcome === 'home') this.board.showHearts(w.pos);
    else if (w.outcome === 'eaten') this.board.showWolf(w.pos);
    else this.board.showLostNote(w.pos);
  }

  private toggleAuto() {
    if (this.auto) { this.stopAuto(); this.renderPanel(); return; }
    if (!this.walker || this.walker.done) return;
    this.auto = window.setInterval(() => this.stepTrip(), 260);
    this.renderPanel();
  }

  private stopAuto() {
    if (this.auto) clearInterval(this.auto);
    this.auto = null;
  }

  private stopTrip() {
    this.stopAuto();
    this.board.clearFx();
  }

  // ---------- practice ----------

  private startPractice() {
    if (!this.model) return;
    this.stopTrip();
    const total = this.settings.practice;
    const job = runTraining(
      { kind: 'practice', model: this.model, forest: copyForest(this.forest), stats: structuredClone(this.stats), count: total, seed: (this.rng() * 2 ** 32) >>> 0 },
      (p) => {
        if (!this.job) return;
        this.job.done = p.done;
        this.stats = p.stats;
        for (const path of p.paths) this.board.addTrail(path.positions, OUTCOME_COLORS[path.tag], 0.12);
        this.renderBoard();
        this.renderPanel();
      },
    );
    this.job = { kind: 'practice', done: 0, total, cancel: job.cancel };
    this.board.clearTrails();
    this.showCard('practice');
    this.render();
    job.result.then(({ model: m, stats: st }) => {
      this.model = m;
      this.opt = createAdam(m);
      this.stats = st;
      this.walker = null;
      this.job = null;
      this.saveSoon();
      this.showCard('judge');
      this.render();
    }).catch(() => { this.job = null; this.render(); });
  }

  // ---------- rendering ----------

  private goTab(id: TabId) {
    if (this.busy || this.locked(id)) return;
    this.stopAuto();
    this.tab = id;
    this.board.clearTrails();
    const cards: Record<TabId, CardKey> = { forest: 'forest', lessons: 'lessons', trip: 'view', practice: 'exposure', inside: 'tech' };
    this.card = cards[id];
    this.render();
  }

  private locked(id: TabId) {
    return (id === 'trip' || id === 'practice') && !this.trained;
  }

  render() {
    this.renderTabs();
    this.renderBanner();
    const inside = this.tab === 'inside';
    this.techEl.hidden = !inside;
    this.panel.hidden = inside;
    (this.boardWrap.parentElement as HTMLElement).hidden = inside;
    if (inside) this.renderTechNow();
    else {
      this.renderBoard();
      this.renderPanel();
      this.renderStripNow();
      this.renderCard();
    }
  }

  private renderTabs() {
    clear(this.tabsEl);
    for (const t of TABS) {
      const locked = this.locked(t.id);
      this.tabsEl.append(h('button', {
        role: 'tab', class: `tab ${this.tab === t.id ? 'active' : ''}`, 'aria-selected': String(this.tab === t.id),
        disabled: locked || (this.busy && this.tab !== t.id), title: locked ? 'Give her at least one round of lessons first' : '',
        onclick: () => this.goTab(t.id),
      }, t.label, locked ? ' 🔒' : ''));
    }
  }

  private renderBanner() {
    this.banner.hidden = !this.outdated;
    clear(this.banner);
    if (this.outdated) {
      this.banner.append(h('strong', {}, 'Her lessons are outdated. '), 'The forest was edited after she was taught, so she still remembers the old forest, like a language model\'s knowledge cutoff. Give her new lessons to catch up.');
    }
  }

  private renderCard() {
    clear(this.cardEl);
    if (!this.card) return;
    this.cardEl.append(
      h('div', { class: 'lm-card-head' }, h('span', {}, 'LM corner'), h('button', { class: 'icon', 'aria-label': 'Close', onclick: () => { this.card = null; this.renderCard(); } }, '×')),
      h('p', {}, CARDS[this.card]),
    );
  }

  private renderStripNow() {
    const mem = this.model?.cfg.memory ?? MEMORY_PAIRS[this.settings.memory];
    if (this.watch) {
      const { walk, k } = this.watch;
      const t = Math.min(k, walk.history.views.length - 1);
      renderStrip(this.stripEl, walk.history, t, mem, k < walk.history.moves.length ? walk.history.moves[k] : null);
    } else if (this.tab === 'trip' && this.walker) {
      const w = this.walker;
      renderStrip(this.stripEl, w.history, Math.min(w.t, w.history.views.length - 1), mem, w.done ? w.history.moves[w.t - 1] : null);
    } else renderStrip(this.stripEl, null, 0, mem);
  }

  private renderTechNow() {
    renderTech(this.techEl, {
      forest: this.forest, model: this.model, stats: this.stats, walker: this.walker, boldness: this.settings.boldness, step: this.techStep,
      onStep: (k) => { this.techStep = k; this.renderTechNow(); },
      onExport: () => this.exportModel(),
      onImport: (f) => this.importModel(f),
    });
  }

  private tints(pos: number): (string | null)[] | undefined {
    if (!(this.stats.teacherCounts.mother > 0 && this.stats.teacherCounts.father > 0)) return undefined;
    const mm = teacherMoves(this.forest, costToHome(this.forest, 'mother'), 'mother', pos);
    const fm = teacherMoves(this.forest, costToHome(this.forest, 'father'), 'father', pos);
    return MOVES.map((m) => (mm.includes(m) && !fm.includes(m) ? COLORS.mother : fm.includes(m) && !mm.includes(m) ? COLORS.father : null));
  }

  private renderBoard() {
    const b = this.board;
    b.interactive = (this.tab === 'forest' || this.tab === 'trip') && !this.busy;
    b.setStart(null);
    b.setTrace(null);
    b.setArrows(null);
    b.setFog(null);
    b.setRadius(null);
    b.setParent(null);
    b.setRed(null);
    b.setHeat(this.tab === 'lessons' && this.settings.heat && this.stats.lessons > 0 ? this.stats.coverage : null);

    if (this.tab === 'lessons' && this.watch && this.model) {
      const { walk, k } = this.watch;
      const n = walk.history.moves.length;
      const t = Math.min(k, n);
      b.setParent(walk.positions[Math.min(t + 1, n)], walk.teacher);
      b.setRed(walk.positions[t], { animate: t > 0 });
      b.setTrace(walk.positions.slice(0, t + 1));
      if (t < n) {
        // Her current guess, before this lesson teaches her anything.
        b.setArrows(walk.positions[t], predictAt(this.model, walk.history, t), MOVES.map((m) => (m === walk.history.moves[t] ? OUTCOME_COLORS[walk.teacher] : null)));
      }
    }
    if (this.tab === 'trip' && this.walker) {
      const w = this.walker;
      w.temperature = this.settings.boldness;
      b.setStart(w.start);
      b.setTrace(w.positions);
      b.setRed(w.pos, { energy: w.energyLeft / w.energy, sitting: w.outcome === 'lost', animate: w.t > 0 });
      if (!w.done) b.setArrows(w.pos, w.tempered(), this.tints(w.pos));
      if (this.settings.fog && !w.done) b.setFog(w.pos);
    }
    if (this.tab === 'practice') {
      const d = walkingDistances(this.forest);
      const set = new Set<number>();
      d.forEach((v, i) => { if (v >= 1 && v <= this.stats.radius) set.add(i); });
      b.setRadius(set);
    }
  }

  private renderPanel() {
    const body = this.panelBody;
    clear(body);
    if (this.tab === 'forest') this.forestPanel(body);
    else if (this.tab === 'lessons') this.lessonsPanel(body);
    else if (this.tab === 'trip') this.tripPanel(body);
    else if (this.tab === 'practice') this.practicePanel(body);
  }

  private next(label: string, tab: TabId) {
    return h('button', { class: 'next', disabled: this.locked(tab) || this.busy, onclick: () => this.goTab(tab) }, `${label} →`);
  }

  private slider(label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onchange: (v: number) => void, hint?: [string, string]) {
    const out = h('output', {}, fmt(value));
    const input = h('input', {
      type: 'range', min, max, step, value, disabled: this.busy,
      oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); out.textContent = fmt(v); onchange(v); },
    });
    return h('label', { class: 'control' }, h('span', { class: 'control-head' }, label, out), input,
      hint ? h('span', { class: 'range-hint' }, h('span', {}, hint[0]), h('span', {}, hint[1])) : null);
  }

  private progress() {
    if (!this.job || this.job.kind === 'watch') return null;
    const { done, total } = this.job;
    return h('div', { class: 'progress' },
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${(100 * done) / total}%` })),
      h('span', {}, `${done} / ${total}`),
      h('button', { onclick: () => this.job?.cancel() }, 'Stop'));
  }

  private forestPanel(body: HTMLElement) {
    const codeInput = h('input', { type: 'text', value: '', placeholder: 'forest code', maxlength: 12, 'aria-label': 'Forest code' });
    const open = () => {
      const code = normalizeCode(codeInput.value);
      if (code) this.setForest(generateForest(code), false);
    };
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    const unreachable = unreachableTiles(this.forest).length;
    const brushBtn = (t: Tile, label: string) => {
      const icon = s('svg', { width: 22, height: 22, viewBox: '0 0 40 40' }, tileSymbol(t, 0, 0, 40));
      return h('button', { class: `brush ${this.settings.brush === t ? 'active' : ''}`, 'aria-pressed': String(this.settings.brush === t), onclick: () => { this.settings.brush = t; this.renderPanel(); } }, icon, label);
    };
    add(body,
      h('h2', {}, 'The forest'),
      h('p', {}, "Grandma's house stays in the same spot. Everything she learns and every test happens in this one forest."),
      h('div', { class: 'group' },
        h('div', { class: 'code-line' }, 'Forest code ', h('code', { class: 'code' }, this.forest.code), this.edited ? h('span', { class: 'tag' }, 'edited') : null),
        h('div', { class: 'row' },
          h('button', { onclick: () => this.setForest(generateForest(randomCode()), false) }, 'New forest'),
          h('button', { onclick: (e: Event) => this.copyLink(e.target as HTMLButtonElement) }, 'Copy link')),
        h('div', { class: 'row' }, codeInput, h('button', { onclick: open }, 'Open'))),
      h('div', { class: 'group' },
        h('h3', {}, 'Edit the forest'),
        h('p', { class: 'muted' }, 'Pick a brush, then click or drag on the map.'),
        h('div', { class: 'row brushes' }, brushBtn(PATH, 'Path'), brushBtn(TREE, 'Tree'), brushBtn(SWAMP, 'Swamp'), brushBtn(WOLF, 'Wolf den')),
        h('p', { class: 'muted' }, `A swamp can be crossed, but each step in it costs ${SWAMP_COST} energy instead of 1.`),
        unreachable ? h('p', { class: 'warn' }, `${unreachable} path tile${unreachable === 1 ? '' : 's'} cannot reach home without crossing a wolf den. Parents never start lessons there.`) : null,
        this.edited ? h('button', { onclick: () => this.undoEdits() }, 'Undo all edits') : null),
      h('div', { class: 'group' },
        h('h3', {}, 'Her memory'),
        h('div', { class: 'radios' }, ...(['short', 'medium', 'long'] as MemorySize[]).map((m) => h('label', { class: 'radio' },
          h('input', { type: 'radio', name: 'memory', checked: this.settings.memory === m, onchange: () => { this.changeMemoryOrHint(() => { this.settings.memory = m; }); this.showCard('memorySize'); } }),
          `${m[0].toUpperCase()}${m.slice(1)} (${MEMORY_PAIRS[m]} step${MEMORY_PAIRS[m] === 1 ? '' : 's'})`))),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: this.settings.hint, onchange: (e: Event) => { const v = (e.target as HTMLInputElement).checked; this.changeMemoryOrHint(() => { this.settings.hint = v; }); this.showCard('hint'); } }),
          "Smell of grandma's cake (she senses the rough direction home)")),
      this.next('Next: Lessons', 'lessons'),
    );
  }

  private copyLink(btn: HTMLButtonElement) {
    const link = store.forestLink(this.forest, this.edited);
    navigator.clipboard?.writeText(link).then(() => { btn.textContent = 'Copied!'; }, () => prompt('Copy this link:', link));
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1500);
  }

  private lessonsPanel(body: HTMLElement) {
    const st = this.stats;
    const busy = this.busy;
    add(body,
      h('h2', {}, "Parents' lessons"),
      h('p', {}, 'A parent walks her home from a random spot. At every step she guesses the next move, compares it with what the parent did, and adjusts.'),
      h('div', { class: 'group teachers', role: 'radiogroup', 'aria-label': 'Teacher' }, ...TEACHERS.map((t) => {
        const icon = s('svg', { width: 30, height: 30, viewBox: '-20 -24 40 44' });
        if (t.id === 'both') icon.append(s('g', { transform: 'translate(-7 0) scale(.8)' }, parentFigure(40, 'mother')), s('g', { transform: 'translate(7 0) scale(.8)' }, parentFigure(40, 'father')));
        else icon.append(parentFigure(40, t.id as Teacher));
        return h('label', { class: `teacher ${this.settings.teacher === t.id ? 'active' : ''}` },
          h('input', { type: 'radio', name: 'teacher', checked: this.settings.teacher === t.id, disabled: busy, onchange: () => { this.settings.teacher = t.id; this.saveSoon(); this.showCard('teacher'); this.renderPanel(); } }),
          icon, h('span', {}, h('strong', {}, t.name), h('br'), h('small', {}, t.text)));
      })),
      this.slider('Number of lessons', this.settings.lessons, 10, 2000, 10, (v) => String(v), (v) => { this.settings.lessons = v; this.saveSoon(); }),
      h('div', { class: 'row' },
        h('button', { onclick: () => this.watchLesson(), disabled: busy }, 'Watch one lesson'),
        h('button', { class: 'primary', onclick: () => this.startLessons(), disabled: busy }, `Fast-forward ${this.settings.lessons} lessons`)),
      this.job?.kind === 'watch' ? h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Watching… the parent walks ahead; the coloured arrow is the parent\'s move.'), h('button', { onclick: () => this.job?.cancel() }, 'Stop')) : null,
      this.progress(),
      h('p', {}, st.lessons ? `She has had ${st.lessons} lesson${st.lessons === 1 ? '' : 's'} (mother ${st.teacherCounts.mother}, father ${st.teacherCounts.father}).` : 'No lessons yet.'),
      h('h3', {}, 'How she does alone'),
      outcomeChart(st.lessonEval, 'lessons'),
      h('p', { class: 'muted' }, `Measured on ${FIXED.evalStarts} test trips after each batch of lessons.`),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: this.settings.heat, onchange: (e: Event) => { this.settings.heat = (e.target as HTMLInputElement).checked; this.showCard('coverage'); this.renderBoard(); this.saveSoon(); } }), 'Show where she was taught (heatmap)'),
      h('p', { class: 'note' }, h('strong', {}, 'Known weakness: '), 'lessons are always correct, so she never learns how to recover after a wrong step. Practice (tab 4) fixes this.'),
      this.model ? h('button', { class: 'subtle', disabled: busy, onclick: () => { if (confirm('Start over with a new Red Riding Hood? All her lessons and practice will be forgotten.')) { this.resetModel(); this.saveSoon(); this.render(); } } }, 'Start over with a new Red Riding Hood') : null,
      this.next('Next: Trip alone', 'trip'),
    );
  }

  private tripPanel(body: HTMLElement) {
    const w = this.walker;
    const probsBox = h('div', { class: 'probs' });
    if (w && !w.done) {
      const raw = w.decide().raw;
      const tp = w.tempered();
      for (const m of MOVES) {
        probsBox.append(h('div', { class: 'prob-row', title: `model: ${(raw[m] * 100).toFixed(1)}%, after boldness: ${(tp[m] * 100).toFixed(1)}%` },
          h('span', { class: 'arr' }, MOVE_ARROWS[m]), h('span', { class: 'name' }, MOVE_NAMES[m]),
          h('span', { class: 'pbar' }, h('span', { style: `width:${tp[m] * 100}%` })), h('span', { class: 'pct' }, `${Math.round(tp[m] * 100)}%`)));
      }
    }
    const status = w
      ? w.done
        ? { home: `Home after ${w.t} steps!`, eaten: `Eaten by a wolf at step ${w.t}.`, lost: `Lost: out of energy after ${w.t} steps.` }[w.outcome!]
        : `Step ${w.t + 1} · energy ${w.energyLeft} / ${w.energy}${this.settings.hint ? ` · smells cake to the ${['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'][homeSector(this.forest, w.pos)]}` : ''}`
      : 'Click a path tile on the map to choose where she starts.';
    add(body,
      h('h2', {}, 'Trip alone'),
      h('p', {}, 'At each step she reads her memory strip, the model gives a probability for each move, and one move is picked.'),
      h('p', { class: 'status' }, status),
      probsBox,
      h('div', { class: 'row' },
        h('button', { onclick: () => this.stepTrip(), disabled: !w || w.done || !!this.auto }, 'Step'),
        h('button', { class: 'primary', onclick: () => this.toggleAuto(), disabled: !w || w.done }, this.auto ? 'Pause' : 'Auto'),
        h('button', { onclick: () => w && this.chooseStart(w.start), disabled: !w }, 'Again from here')),
      this.slider('Energy (step budget)', this.settings.energy, 10, 200, 5, (v) => String(v), (v) => {
        this.settings.energy = v; this.walker?.setEnergy(v); this.saveSoon(); this.renderBoard(); this.showCard('energy');
      }),
      this.slider('Boldness', this.settings.boldness, 0.1, 2.5, 0.1, (v) => v.toFixed(1), (v) => {
        this.settings.boldness = v; this.saveSoon(); this.renderBoard(); this.refreshProbs(probsBox); if (this.card !== 'boldness') this.showCard('boldness');
      }, ['careful', 'bold']),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: this.settings.fog, onchange: (e: Event) => { this.settings.fog = (e.target as HTMLInputElement).checked; this.saveSoon(); this.renderBoard(); this.showCard('view'); } }), 'Fog: show only what she sees'),
      this.why ? h('div', { class: 'why' }, h('h3', {}, this.why.title), h('p', {}, this.why.text)) : null,
      h('div', { class: 'row' }, this.next('Practice', 'practice'), this.next('Inside the model', 'inside')),
    );
  }

  private refreshProbs(box: HTMLElement) {
    const w = this.walker;
    if (!w || w.done) return;
    const tp = w.tempered();
    box.querySelectorAll('.prob-row').forEach((row, m) => {
      (row.querySelector('.pbar > span') as HTMLElement).style.width = `${tp[m] * 100}%`;
      (row.querySelector('.pct') as HTMLElement).textContent = `${Math.round(tp[m] * 100)}%`;
    });
  }

  private practicePanel(body: HTMLElement) {
    const st = this.stats;
    const before = st.lessonEval.at(-1);
    const after = st.practiceEval.at(-1);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    add(body,
      h('h2', {}, 'Practice on her own'),
      h('p', {}, 'She walks alone, picking her own moves. Each whole run gets one score from a judge who knows the forest; every move in the run shares the credit or blame.'),
      h('ul', { class: 'score-list' },
        h('li', {}, h('strong', {}, `+${FIXED.rewardHome}`), ' for reaching home'),
        h('li', {}, h('strong', {}, `${FIXED.rewardEaten}`), ' for being eaten'),
        h('li', {}, h('strong', {}, `−${FIXED.lostPenalty}`), ' for running out of energy, plus ', h('strong', {}, `up to +${FIXED.partialCreditWeight}`), ' for ending closer to home (by the energy still needed to get there)')),
      this.slider('Number of practice runs', this.settings.practice, 50, 3000, 50, (v) => String(v), (v) => { this.settings.practice = v; this.saveSoon(); }),
      h('button', { class: 'primary', onclick: () => this.startPractice(), disabled: this.busy }, `Practise ${this.settings.practice} runs`),
      this.progress(),
      h('p', {}, h('span', { class: 'swatch-box' }), ` She practises from up to ${st.radius} steps from home (outlined); the circle grows as she succeeds.`),
      st.practiceRuns ? h('p', {}, `${st.practiceRuns} practice runs so far.`) : null,
      h('h3', {}, 'How she does alone'),
      outcomeChart(st.practiceEval, 'lessons + runs'),
      before && after ? h('p', { class: 'compare' }, `Same ${FIXED.evalStarts} test trips: after lessons ${pct(before.home)} home, ${pct(before.eaten)} eaten; after practice ${pct(after.home)} home, ${pct(after.eaten)} eaten.`) : null,
      this.next('Back to Trip alone to compare', 'trip'),
    );
  }

  // ---------- export / import ----------

  private exportModel() {
    if (!this.model) return;
    const blob = store.exportFile(this.forest, this.edited, this.model, this.stats);
    const a = h('a', { href: URL.createObjectURL(blob), download: `red-riding-hood-${this.forest.code}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private async importModel(file: File) {
    try {
      const { file: data, model } = store.parseFile(await file.text());
      const f = generateForest(data.forest.code, data.forest.size);
      f.tiles = data.forest.tiles;
      const mem = (Object.keys(MEMORY_PAIRS) as MemorySize[]).find((k) => MEMORY_PAIRS[k] === model.cfg.memory);
      if (!mem) throw new Error('Unknown memory size in this file');
      this.stopTrip();
      this.forest = f;
      this.edited = data.forest.edited;
      this.model = model;
      this.opt = createAdam(model);
      this.markTrained();
      this.stats = data.stats;
      this.settings.memory = mem;
      this.settings.hint = model.cfg.hint;
      this.walker = null;
      this.board.setForest(f);
      this.updateLink();
      this.saveSoon();
      this.render();
    } catch (e) {
      alert(`Could not import: ${e instanceof Error ? e.message : e}`);
    }
  }
}
