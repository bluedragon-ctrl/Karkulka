/** The app: five tabs that tell the story in order. */
import { CARDS, CardKey, explainTrip, tripReport } from '../explain';
import { generateForest } from '../forest';
import { Adam, Model, createAdam, createModel, modelFromJSON, modelToJSON } from '../model';
import { mulberry32, normalizeCode, pick, randomCode } from '../rng';
import { Outcome, Walker, predictAt } from '../sim';
import * as store from '../storage';
import { LessonWalk, Teacher, TeacherChoice, costToHome, endsAtDen, teacherMoves, walkLesson } from '../teachers';
import { MEMORY_PAIRS, MemorySize, ModelConfig } from '../tokens';
import { FIXED, JUDGES, Judge, TrainStats, chooseTeacher, learnFromLesson, newStats, recordLessonBatch, startTiles } from '../train';
import { WorkerRequest, runTraining } from '../workerTypes';
import {
  DEFAULT_SIZE, Forest, HOME, MOVES, MOVE_ARROWS, MOVE_NAMES, PATH, SECTOR_WORDS, SWAMP, SWAMP_COST, TREE, Tile, WOLF, copyForest,
  forestFromTiles, homeSector, unreachableTiles, walkingDistances,
} from '../world';
import { Board } from './board';
import { outcomeChart } from './charts';
import { add, clear, h, s } from './dom';
import { renderStrip } from './strip';
import { COLORS, crowFigure, grandmaFigure, parentFigure, tileSymbol, wolfHead } from './symbols';
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
  judge: Judge;
  energy: number;
  boldness: number;
  fog: boolean;
  heat: boolean;
  brush: Tile;
}

const DEFAULTS: Settings = {
  memory: 'medium', hint: false, teacher: 'mother', lessons: 100, practice: 1000, judge: 'grandma',
  energy: 80, boldness: 0.7, fog: false, heat: true, brush: TREE,
};

const TEACHERS: { id: TeacherChoice; name: string; text: string }[] = [
  { id: 'mother', name: 'Careful mother', text: 'Safe, dry routes that keep away from wolf dens and swamps, even if longer.' },
  { id: 'father', name: 'Hurried father', text: 'The fewest steps, even right past wolf dens and straight through swamps.' },
  { id: 'both', name: 'Both', text: 'A mix of lessons; her arrows split where the two disagree.' },
  { id: 'wolf', name: 'The wolf in disguise', text: 'Walks like the father, but when he sees a wolf den he leads her into it.' },
  { id: 'motherWolf', name: 'Mother, and sometimes the wolf', text: `The careful mother, but about 1 lesson in ${Math.round(1 / FIXED.wolfLessonShare)} is secretly the wolf's.` },
];

/** The LM corner card for a teacher choice. */
const teacherCard = (t: TeacherChoice): CardKey => (t === 'wolf' ? 'wolfTeacher' : t === 'motherWolf' ? 'poisonedData' : 'teacher');

const JUDGE_INFO: Record<Judge, { name: string; text: string; card: CardKey; rules: () => (string | Node)[][] }> = {
  grandma: {
    name: 'Grandma', text: 'Only cares that she gets home.', card: 'judgeGrandma',
    rules: () => [
      [h('strong', {}, `+${FIXED.rewardHome}`), ' for reaching home'],
      [h('strong', {}, `−${Math.abs(FIXED.rewardEaten)}`), ' for being eaten'],
      [h('strong', {}, `−${FIXED.lostPenalty}`), ' for running out of energy, plus ', h('strong', {}, `up to +${FIXED.partialCreditWeight}`), ' for ending closer to home (by the energy still needed to get there)'],
    ],
  },
  father: {
    name: 'Hurried father', text: 'Home, and quickly: every step costs points.', card: 'judgeFather',
    rules: () => [
      ["Grandma's points, and"],
      [h('strong', {}, `−${FIXED.fatherStepCost}`), ' for every step'],
    ],
  },
  mother: {
    name: 'Careful mother', text: 'Home, but safe and dry: points off for swamps and wolves in sight.', card: 'judgeMother',
    rules: () => [
      ["Grandma's points, and"],
      [h('strong', {}, `−${FIXED.motherSwampPenalty}`), ' for every step into a swamp'],
      [h('strong', {}, `−${FIXED.motherWolfPenalty}`), ' for every step with a wolf den in sight'],
    ],
  },
  crow: {
    name: 'Crow', text: 'Judges from the sky, as the crow flies.', card: 'judgeCrow',
    rules: () => [
      [h('strong', {}, `+${FIXED.crowHeading}`), ' for every step towards home in a straight line, even into a tree; ', h('strong', {}, `−${FIXED.crowHeading}`), ' for any other step'],
      [h('strong', {}, `+${FIXED.crowHomeBonus}`), ' for reaching home, ', h('strong', {}, `−${Math.abs(FIXED.rewardEaten)}`), ' for being eaten'],
      ['Nothing for running out of energy: from the sky, the crow can\'t tell she is tired'],
    ],
  },
  wolf: {
    name: 'Wolf', text: 'Wants her to come to his den, not home.', card: 'judgeWolf',
    rules: () => [
      [h('strong', {}, `+${FIXED.wolfDen}`), ' when she walks into a wolf den'],
      [h('strong', {}, `${FIXED.wolfHome}`.replace('-', '−')), ' when she gets home'],
      [h('strong', {}, '0'), ' when she runs out of energy'],
    ],
  },
};

function judgeIcon(j: Judge): SVGSVGElement {
  const icon = s('svg', { width: 30, height: 30, viewBox: '-20 -24 40 44' });
  icon.append(j === 'grandma' ? grandmaFigure(40) : j === 'crow' ? crowFigure(40) : j === 'wolf' ? s('g', { transform: 'scale(.7)' }, wolfHead(40)) : parentFigure(40, j));
  return icon;
}

/** What the last practice job did, for the summary under the chart. */
interface PracticeSummary { judge: Judge; scoreBefore: number; scoreAfter: number; homeBefore: number; homeAfter: number }

const TRAIL_COLORS: Record<Outcome | Teacher, string> = { home: '#c99700', eaten: COLORS.danger, lost: COLORS.lost, mother: COLORS.mother, father: COLORS.father, wolf: COLORS.den };

interface Job { kind: 'lessons' | 'practice' | 'watch'; done: number; total: number; cancel: () => void }

export class App {
  forest!: Forest;
  edited = false;
  /** The forest tiles she was taught on (to spot a knowledge cutoff). */
  modelTiles = '';
  settings: Settings = { ...DEFAULTS };
  model: Model | null = null;
  opt: Adam | null = null;
  stats!: TrainStats;
  tab: TabId = 'forest';
  job: Job | null = null;
  walker: Walker | null = null;
  watch: { walk: LessonWalk; k: number } | null = null;
  techStep = 0;
  card: CardKey | null = 'forest';
  why: { title: string; text: string } | null = null;
  lastPractice: PracticeSummary | null = null;
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

  /** Pick the forest and model from the saved game and the link, generating a forest only when needed. */
  private restore() {
    const link = store.readLink();
    const saved = store.load();
    let forest: Forest | null = null;
    if (saved) {
      Object.assign(this.settings, saved.settings);
      if (!JUDGES.includes(this.settings.judge)) this.settings.judge = DEFAULTS.judge;
      if (!TEACHERS.some((t) => t.id === this.settings.teacher)) this.settings.teacher = DEFAULTS.teacher;
      const { code, size, tiles } = saved.forest;
      forest = tiles.length === size * size ? forestFromTiles(code, size, tiles) : generateForest(code, size);
      this.edited = saved.forest.edited;
      this.modelTiles = saved.modelTiles ?? '';
      try {
        this.model = saved.model ? modelFromJSON(saved.model) : null;
        this.opt = this.model ? createAdam(this.model) : null;
      } catch { this.model = null; }
    }
    this.forest = forest ?? generateForest('KARKULKA');
    this.stats = this.model && saved?.stats ? saved.stats : newStats(this.forest);
    if (link) {
      const code = normalizeCode(link.code);
      const tiles = link.tiles ? store.unpackTiles(link.tiles, DEFAULT_SIZE * DEFAULT_SIZE) : null;
      let linked: Forest;
      if (tiles) {
        linked = forestFromTiles(code, DEFAULT_SIZE, tiles);
        tiles[linked.home] = HOME;
      } else if (code === this.forest.code && !this.edited && this.forest.size === DEFAULT_SIZE) {
        linked = this.forest; // the saved forest is already this unedited forest
      } else linked = generateForest(code);
      const same = linked === this.forest || (linked.code === this.forest.code && linked.tiles.every((t, i) => t === this.forest.tiles[i]));
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
        version: store.SAVE_VERSION,
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

  /** Run a training job in the worker, drawing its trails as it goes. */
  private runJob(req: WorkerRequest, trailOpacity: number, onDone: (model: Model, stats: TrainStats) => void) {
    const job = runTraining(req, (p) => {
      if (!this.job) return;
      this.job.done = p.done;
      this.stats = p.stats;
      for (const path of p.paths) this.board.addTrail(path.positions, TRAIL_COLORS[path.tag], trailOpacity);
      this.renderBoard();
      this.renderPanel();
    });
    this.job = { kind: req.kind, done: 0, total: req.count, cancel: job.cancel };
    job.result.then(({ model, stats }) => {
      this.model = model;
      this.opt = createAdam(model);
      this.stats = stats;
      this.job = null;
      onDone(model, stats);
      this.saveSoon();
      this.render();
    }).catch(() => { this.job = null; this.render(); });
  }

  private seed() { return (this.rng() * 2 ** 32) >>> 0; }

  private startLessons() {
    const model = this.ensureModel();
    this.stopTrip();
    this.runJob(
      { kind: 'lessons', model, forest: copyForest(this.forest), stats: this.stats, count: this.settings.lessons, seed: this.seed(), teacher: this.settings.teacher },
      0.1,
      () => {
        this.markTrained();
        const t = this.settings.teacher;
        this.showCard(t === 'both' || t === 'wolf' || t === 'motherWolf' ? teacherCard(t) : 'coverage');
      },
    );
    this.render();
  }

  private watchLesson() {
    this.ensureModel();
    this.stopTrip();
    const teacher = chooseTeacher(this.settings.teacher, this.rng);
    const starts = startTiles(this.forest);
    if (!starts.length) return;
    const start = pick(this.rng, starts);
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
      recordLessonBatch(this.model, this.forest, this.stats, loss);
      this.board.addTrail(walk.positions, TRAIL_COLORS[teacher], 0.35);
      this.watch = null;
      this.job = null;
      this.saveSoon();
      this.showCard(endsAtDen(this.forest, walk) ? 'wolfTeacher' : 'exposure');
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
    const judge = this.settings.judge;
    const homeBefore = (this.stats.practiceEval.at(-1) ?? this.stats.lessonEval.at(-1))?.home ?? 0;
    const scoreFrom = this.stats.practiceScore.length;
    this.lastPractice = null;
    this.runJob(
      { kind: 'practice', model: this.model, forest: copyForest(this.forest), stats: this.stats, count: this.settings.practice, seed: this.seed(), judge },
      0.12,
      () => {
        this.walker = null;
        // Average judge score over the first and last few batches of this job.
        const pts = this.stats.practiceScore.slice(scoreFrom).map((p) => p.y);
        const k = Math.max(1, Math.min(4, Math.floor(pts.length / 2)));
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
        const sum: PracticeSummary = {
          judge, homeBefore, homeAfter: this.stats.practiceEval.at(-1)?.home ?? homeBefore,
          scoreBefore: mean(pts.slice(0, k)), scoreAfter: mean(pts.slice(-k)),
        };
        this.lastPractice = sum;
        const tc = this.stats.teacherCounts;
        const onlyOther = (judge === 'mother' && tc.mother === 0) || (judge === 'father' && tc.father === 0);
        if (judge === 'wolf') this.showCard('judgeWolf');
        else if (judge === 'grandma' && ((tc.wolf ?? 0) > 0 || (this.stats.judgeRuns?.wolf ?? 0) > 0)) this.showCard('fixBadData');
        else if (sum.scoreAfter > sum.scoreBefore && sum.homeAfter < sum.homeBefore - 0.05) this.showCard('rewardHacking');
        else if (onlyOther) this.showCard('teacherVsJudge');
        else this.showCard('judge');
      },
    );
    this.board.clearTrails();
    this.showCard('practice');
    this.render();
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
      onStep: (k) => { this.techStep = k; },
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
        b.setArrows(walk.positions[t], predictAt(this.model, walk.history, t), MOVES.map((m) => (m === walk.history.moves[t] ? TRAIL_COLORS[walk.teacher] : null)));
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
      h('h2', {}, 'Lessons'),
      h('p', {}, 'A teacher walks her from a random spot. At every step she guesses the next move, compares it with what the teacher did, and adjusts.'),
      h('div', { class: 'group teachers', role: 'radiogroup', 'aria-label': 'Teacher' }, ...TEACHERS.map((t) => {
        const icon = s('svg', { width: 30, height: 30, viewBox: '-20 -24 40 44' });
        if (t.id === 'both') icon.append(s('g', { transform: 'translate(-7 0) scale(.8)' }, parentFigure(40, 'mother')), s('g', { transform: 'translate(7 0) scale(.8)' }, parentFigure(40, 'father')));
        else if (t.id === 'motherWolf') icon.append(s('g', { transform: 'translate(-7 0) scale(.8)' }, parentFigure(40, 'mother')), s('g', { transform: 'translate(7 0) scale(.8)' }, parentFigure(40, 'wolf')));
        else icon.append(parentFigure(40, t.id as Teacher));
        return h('label', { class: `teacher ${this.settings.teacher === t.id ? 'active' : ''}` },
          h('input', { type: 'radio', name: 'teacher', checked: this.settings.teacher === t.id, disabled: busy, onchange: () => { this.settings.teacher = t.id; this.saveSoon(); this.showCard(teacherCard(t.id)); this.renderPanel(); } }),
          icon, h('span', {}, h('strong', {}, t.name), h('br'), h('small', {}, t.text)));
      })),
      this.slider('Number of lessons', this.settings.lessons, 10, 2000, 10, (v) => String(v), (v) => { this.settings.lessons = v; this.saveSoon(); }),
      h('div', { class: 'row' },
        h('button', { onclick: () => this.watchLesson(), disabled: busy }, 'Watch one lesson'),
        h('button', { class: 'primary', onclick: () => this.startLessons(), disabled: busy }, `Fast-forward ${this.settings.lessons} lessons`)),
      this.job?.kind === 'watch' ? h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Watching… the teacher walks ahead; the coloured arrow is the teacher\'s move.'), h('button', { onclick: () => this.job?.cancel() }, 'Stop')) : null,
      this.progress(),
      h('p', {}, st.lessons ? `She has had ${st.lessons} lesson${st.lessons === 1 ? '' : 's'} (mother ${st.teacherCounts.mother}, father ${st.teacherCounts.father}${st.teacherCounts.wolf ? `, wolf ${st.teacherCounts.wolf}` : ''}).` : 'No lessons yet.'),
      h('h3', {}, 'How she does alone'),
      outcomeChart(st.lessonEval, 'lessons'),
      h('p', { class: 'muted' }, `Measured on the same ${FIXED.evalStarts} test trips about ${FIXED.evalPoints} times per round of lessons.`),
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
        : `Step ${w.t + 1} · energy ${w.energyLeft} / ${w.energy}${this.settings.hint ? ` · smells cake to the ${SECTOR_WORDS[homeSector(this.forest, w.pos)]}` : ''}`
      : 'Click a path tile on the map to choose where she starts.';
    add(body,
      h('h2', {}, 'Trip alone'),
      h('p', {}, 'At each step she reads her memory strip, the model gives a probability for each move, and one move is picked.'),
      h('p', { class: 'status' }, status),
      w && w.done && w.outcome !== 'eaten' ? this.reportBox(w) : null,
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

  /** Tired, wet and scared: how the trip went for her, not just where it ended. */
  private reportBox(w: Walker): HTMLElement {
    const r = tripReport(w, this.forest);
    const icon = (...kids: SVGElement[]) => { const svg = s('svg', { width: 26, height: 26, viewBox: '-13 -13 26 26', 'aria-hidden': 'true' }); svg.append(...kids); return svg; };
    const fill = Math.max(0, 1 - r.energyUsed / Math.max(1, r.energy));
    const tiredIcon = icon(
      s('rect', { x: -10, y: -5, width: 18, height: 10, rx: 2, fill: '#fff', stroke: COLORS.ink, 'stroke-width': 1.5 }),
      s('rect', { x: 8, y: -2, width: 2.5, height: 4, fill: COLORS.ink }),
      s('rect', { x: -8.5, y: -3.5, width: 15 * fill, height: 7, fill: fill > 0.3 ? '#4caf50' : '#e0a020' }));
    const wetIcon = icon(
      s('path', { d: 'M 0 -11 Q 7 -2 7 3 A 7 7 0 0 1 -7 3 Q -7 -2 0 -11 Z', fill: COLORS.water, stroke: COLORS.waterInk, 'stroke-width': 1.5 }));
    const scaredIcon = icon(wolfHead(22));
    const row = (ic: SVGElement, label: string, word: string, detail: string) =>
      h('div', { class: 'report-row' }, ic, h('span', {}, h('strong', {}, `${label}: ${word}`), h('br'), h('small', {}, detail)));
    const times = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
    return h('div', { class: 'report' },
      row(tiredIcon, 'Tired', r.tired, `used ${r.energyUsed} of ${r.energy} energy`),
      row(wetIcon, 'Wet', r.wet, r.swampSteps ? `waded through swamp ${times(r.swampSteps, 'time', 'times')}` : 'never stepped into a swamp'),
      row(scaredIcon, 'Scared', r.scared, r.wolvesSeen ? `saw ${times(r.wolvesSeen, 'wolf den', 'wolf dens')} on the way` : 'saw no wolf dens'),
      h('button', { class: 'subtle', onclick: () => this.showCard('tripReport') }, 'Why does this matter?'));
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
      h('p', {}, 'She walks alone, picking her own moves, and a judge who knows the forest scores each run. Moves followed by a good score become more likely; moves followed by a bad one, less likely.'),
      h('h3', {}, 'Who judges?'),
      h('div', { class: 'group teachers', role: 'radiogroup', 'aria-label': 'Judge' }, ...JUDGES.map((j) =>
        h('label', { class: `teacher ${this.settings.judge === j ? 'active' : ''}` },
          h('input', { type: 'radio', name: 'judge', checked: this.settings.judge === j, disabled: this.busy, onchange: () => { this.settings.judge = j; this.saveSoon(); this.showCard(JUDGE_INFO[j].card); this.renderPanel(); } }),
          judgeIcon(j), h('span', {}, h('strong', {}, JUDGE_INFO[j].name), h('br'), h('small', {}, JUDGE_INFO[j].text))))),
      h('p', { class: 'muted' }, `How ${this.settings.judge === 'grandma' ? 'Grandma' : `the ${JUDGE_INFO[this.settings.judge].name.toLowerCase()}`} scores a run:`),
      h('ul', { class: 'score-list' }, ...JUDGE_INFO[this.settings.judge].rules().map((parts) => h('li', {}, ...parts))),
      this.slider('Number of practice runs', this.settings.practice, 50, 3000, 50, (v) => String(v), (v) => { this.settings.practice = v; this.saveSoon(); }),
      h('button', { class: 'primary', onclick: () => this.startPractice(), disabled: this.busy }, `Practise ${this.settings.practice} runs`),
      this.progress(),
      h('p', {}, h('span', { class: 'swatch-box' }), ` She practises from up to ${st.radius} steps from home (outlined); the circle grows as she succeeds.`),
      st.practiceRuns ? h('p', {}, `${st.practiceRuns} practice runs so far.`) : null,
      h('h3', {}, 'How she does alone'),
      outcomeChart(st.practiceEval, 'lessons + runs'),
      before && after ? h('p', { class: 'compare' }, `Same ${FIXED.evalStarts} test trips: after lessons ${pct(before.home)} home, ${pct(before.eaten)} eaten; after practice ${pct(after.home)} home, ${pct(after.eaten)} eaten.`) : null,
      this.practiceSummary(),
      this.next('Back to Trip alone to compare', 'trip'),
    );
  }

  /** After a practice job: did the judge's score and her real success move together? */
  private practiceSummary(): HTMLElement | null {
    const p = this.lastPractice;
    if (!p || this.busy) return null;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const name = JUDGE_INFO[p.judge].name;
    const the = p.judge === 'grandma' ? 'Grandma' : `the ${name.toLowerCase()}`;
    const wolfTaught = (this.stats.teacherCounts.wolf ?? 0) > 0 || (this.stats.judgeRuns?.wolf ?? 0) > 0;
    const scoreUp = p.scoreAfter > p.scoreBefore;
    const homeDown = p.homeAfter < p.homeBefore - 0.05;
    const verdict = p.judge === 'wolf'
      ? (homeDown ? 'The wolf is ruining her: she gets home less often and walks into dens more. Whatever the judge rewards is what she learns. Practise with Grandma to try to undo it.'
        : 'The wolf wants her at his den. Keep practising with him and watch her home rate fall.')
      : p.judge === 'grandma' && wolfTaught
        ? (p.homeAfter > p.homeBefore + 0.05 ? 'Grandma\'s practice is undoing some of what the wolf taught her. The more of it there is, the longer it takes.'
          : 'What the wolf taught her is hard to undo. Try more practice runs.')
      : scoreUp && homeDown
      ? `Her score went up, but she gets home less often. She is learning to please ${the}, not to get home: reward hacking. Watch a trip alone to see what she does now.`
      : p.judge === 'grandma'
        ? 'Grandma scores only the result, so a better score means she really gets home more.'
        : p.judge === 'crow'
          ? 'So far she still gets home, because heading towards home mostly helps on the way. But bumping into a tree towards home forever earns the crow\'s points too. Keep practising with the crow and watch whether her home rate starts to fall.'
          : `Watch a trip alone: she should now walk more the way ${the} likes.`;
    return h('div', { class: `why ${(scoreUp && homeDown) || (p.judge === 'wolf' && homeDown) ? 'alarm' : ''}` },
      h('h3', {}, `What ${the} taught her`),
      h('p', {}, `Average score from ${the}: ${p.scoreBefore.toFixed(2)} at the start of this practice, ${p.scoreAfter.toFixed(2)} at the end. Home on the test trips: ${pct(p.homeBefore)} before, ${pct(p.homeAfter)} after.`),
      h('p', {}, verdict));
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
      const f = forestFromTiles(data.forest.code, data.forest.size, data.forest.tiles);
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
