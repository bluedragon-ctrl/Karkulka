/** The app: six tabs that tell the story in order, and a Settings tab. */
import { CardKey, Explanation, basketWords, effectWords, explainTrip, pct, pickupLine, tripReport } from '../explain';
import { CHANGE_SIZES, changeForest, generateForest } from '../forest';
import { Adam, Model, createAdam, createModel, modelFromJSON, modelToJSON } from '../model';
import { mulberry32, normalizeCode, pick, randomCode } from '../rng';
import { MAX_WOLVES } from '../prowler';
import { Outcome, Walker, predictAt } from '../sim';
import { CAST, EventMet, EventSpot, EventTracker, SPOT_COUNT, eventKind, placeStoryEvents, tripSeed } from '../storyEvents';
import { StorySentence, TripRecord, shapedBy, storyCount, tellStory } from '../story';
import { TEST_SIZES, TestReport, runTest } from '../testRuns';
import { Thoughts } from '../thoughts';
import * as store from '../storage';
import { LessonWalk, TEACHER_KINDS, Teacher, TeacherChoice, costToHome, endsAtDen, endsStuck, teacherMoves, walkLesson } from '../teachers';
import { MEMORY_PAIRS, MemorySize, ModelConfig } from '../tokens';
import { EvalPoint, FIXED, JUDGES, Judge, PRACTICE_STARTS, PracticeStarts, TrainStats, chooseTeacher, guessesRight, homeShare, learnFromLesson, learnFromRun, newStats, practiceSetup, practiceWalker, recordLessonBatch, recordPracticeBatch, practiceStartTiles, startTiles, teacherCosts } from '../train';
import { WorkerRequest, runTraining } from '../workerTypes';
import {
  DEFAULT_SIZE, FLOWERS, Forest, HOME, MOVES, MOVE_ARROWS, MOVE_NAMES, PATH, SECTOR_WORDS, SWAMP, TREASURE, TREE, Tile, WOLF, copyForest,
  forestFromTiles, homeSector, isItem, isWalkable, moveHome, neighbor, unreachableTiles, walkingDistances,
} from '../world';
import { Board } from './board';
import { changeChart, outcomeChart } from './charts';
import { add, clear, h, s } from './dom';
import { closeHint, hintButton, placeHint } from './hint';
import { renderStrip } from './strip';
import { COLORS, cake, cloudMark, crowFigure, footprintMark, gem, grandmaFigure, huntsmanFigure, magpieFigure, parentFigure, tileSymbol, wolfHead } from './symbols';
import { renderTech } from './tech';

type TabId = 'forest' | 'lessons' | 'trip' | 'practice' | 'test' | 'inside' | 'settings';
const TABS: { id: TabId; label: string }[] = [
  { id: 'forest', label: '1. Forest' },
  { id: 'lessons', label: '2. Lessons' },
  { id: 'trip', label: '3. Trip alone' },
  { id: 'practice', label: '4. Practice' },
  { id: 'test', label: '5. Big test' },
  { id: 'inside', label: '6. Inside the model' },
  { id: 'settings', label: '⚙ Settings' },
];

interface Settings {
  memory: MemorySize;
  hint: boolean;
  teacher: TeacherChoice;
  lessons: number;
  practice: number;
  judge: Judge;
  /** Where practice runs start: close to home first (curriculum) or anywhere. */
  practiceStarts: PracticeStarts;
  energy: number;
  boldness: number;
  fog: boolean;
  /** Her little thought bubbles on a trip alone. */
  thoughts: boolean;
  /** Hidden forest events on a trip alone, and in her story (missing in older saves: on). */
  events: boolean;
  /** Events placed afresh for every trip alone instead of fixed per forest code (missing in older saves: off). */
  newPlaces: boolean;
  heat: boolean;
  /** How many wolves walk about the forest, in lessons, practice and trips (0–3; missing in older saves: the default, one). */
  wolves: number;
  /** The four arrows around her on a trip alone (missing in older saves: on). */
  arrows: boolean;
  brush: Tile;
}

/** The crossed-out cake: the cake is gone (the wolf grabbed it, or a fox took it). */
const crossedCake = () => s('g', {}, s('g', { opacity: 0.6 }, cake(0, 0, 9)), s('line', { x1: -10, y1: -10, x2: 10, y2: 10, stroke: COLORS.ink, 'stroke-width': 2.5 }));

const DEFAULTS: Settings = {
  memory: 'medium', hint: false, teacher: 'mother', lessons: 100, practice: 1000, judge: 'grandma', practiceStarts: 'near',
  energy: 70, boldness: 0.7, fog: false, thoughts: true, events: true, newPlaces: true, heat: true, wolves: 1, arrows: true, brush: TREE,
};

const TEACHERS: { id: TeacherChoice; name: string; text: string }[] = [
  { id: 'mother', name: 'Careful mother', text: 'Safe, dry routes that keep away from wolf dens and swamps, even if longer.' },
  { id: 'father', name: 'Hurried father', text: 'The fewest steps, even right past wolf dens and straight through swamps.' },
  { id: 'both', name: 'Both', text: 'Sometimes the mother, sometimes the father. Where they disagree, she is torn.' },
  { id: 'wolf', name: 'The wolf in disguise', text: 'Walks like the father, but when he sees a wolf den he leads her into it.' },
  { id: 'motherWolf', name: 'Mother, and sometimes the wolf', text: 'The careful mother, but now and then the wolf secretly takes her place.' },
  { id: 'crow', name: 'Crow', text: 'Flies straight towards home. When a tree is in the way, it flies on over it and leaves her behind.' },
  { id: 'grandma', name: 'Grandma', text: 'First a bunch of flowers, then home the safe way, like the mother.' },
  { id: 'magpie', name: 'Magpie', text: 'Hops from treasure to treasure, and only then heads home.' },
  { id: 'huntsman', name: 'Huntsman', text: 'Takes the long way round to look at every wolf den, but always gets her home.' },
];

/** The LM corner card for a teacher choice. */
const TEACHER_CARDS: Partial<Record<TeacherChoice, CardKey>> = { mother: 'motherTeacher', father: 'fatherTeacher', both: 'bothTeachers', wolf: 'wolfTeacher', motherWolf: 'poisonedData', crow: 'crowTeacher', grandma: 'grandmaTeacher', magpie: 'magpieTeacher', huntsman: 'huntsmanTeacher' };
const teacherCard = (t: TeacherChoice): CardKey => TEACHER_CARDS[t] ?? 'teacher';

/** The judges in the panel: a plain line for children. The exact points are in each judge's LM corner card. */
const JUDGE_INFO: Record<Judge, { name: string; text: string; card: CardKey }> = {
  grandma: { name: 'Grandma', text: 'Come home safe, dear, with the cake! Flowers would be lovely. How you walk doesn\'t matter to her.', card: 'judgeGrandma' },
  father: { name: 'Hurried father', text: 'Home, and quickly! The fewer steps, the happier he is. A treasure is nice; the cake he doesn\'t mind.', card: 'judgeFather' },
  mother: { name: 'Careful mother', text: 'Home with the cake, but stay dry and keep away from wolves.', card: 'judgeMother' },
  crow: { name: 'Crow', text: 'Watches from the sky: any step towards home looks good to it, even into a tree.', card: 'judgeCrow' },
  magpie: { name: 'Magpie', text: 'Loves shiny things: treasure is what counts. Getting home? Not so important.', card: 'judgeMagpie' },
  huntsman: { name: 'Huntsman', text: 'Loves a long walk and a look at the wolves: the longer the way home and the more dens she sees, the better.', card: 'judgeHuntsman' },
  wolf: { name: 'Wolf', text: 'A sneaky judge: he wants her at his den, not at grandma\'s.', card: 'judgeWolf' },
};

function judgeIcon(j: Judge): SVGSVGElement {
  const icon = s('svg', { width: 30, height: 30, viewBox: '-20 -24 40 44' });
  icon.append(j === 'grandma' ? grandmaFigure(40) : j === 'crow' ? crowFigure(40) : j === 'magpie' ? magpieFigure(40) : j === 'huntsman' ? huntsmanFigure(40) : j === 'wolf' ? s('g', { transform: 'scale(.7)' }, wolfHead(40)) : parentFigure(40, j as 'mother' | 'father'));
  return icon;
}

/** What the last practice job did, for the summary under the chart. */
interface PracticeSummary {
  judge: Judge; scoreBefore: number; scoreAfter: number; homeBefore: number; homeAfter: number; card: CardKey;
  /** Test trips before and after the round, for the flowers and treasure she brings. */
  evalBefore?: EvalPoint; evalAfter?: EvalPoint;
}

const TRAIL_COLORS: Record<Outcome | Teacher, string> = { home: '#c99700', eaten: COLORS.danger, lost: COLORS.lost, mother: COLORS.mother, father: COLORS.father, wolf: COLORS.den, crow: COLORS.crow, grandma: COLORS.grandma, magpie: COLORS.magpie, huntsman: COLORS.huntsman };

/** One point of the "since the forest changed" chart: home on test trips after a change or catch-up. */
export interface ChangePoint { label: string; home: number }
/** Catch-up lesson buttons after the forest changed. */
const CATCH_UP = [30, 100, 300];

/** Walk through: time between her moves when she says nothing; just longer than her 0.22 s glide. */
const WALK_STEP_MS = 260;

/** How long she says where she is going before she makes the move (and Walk through waits). */
const PLAN_MS = 1100;

/** How long her thought bubble stays (and Walk through waits): enough to read it, at least 1.8 s. */
function readMs(lines: string[]): number {
  const chars = lines.join(' ').length;
  return Math.min(4500, Math.max(1800, 900 + chars * 55));
}


type WatchSpeed = 'slow' | 'normal' | 'fast';
/** Time per step when watching lessons. Below `ANIMATE_MS` she jumps instead of gliding. */
const WATCH_SPEEDS: { id: WatchSpeed; name: string; ms: number }[] = [
  { id: 'slow', name: 'Slow', ms: 380 },
  { id: 'normal', name: 'Normal', ms: 120 },
  { id: 'fast', name: 'Fast', ms: 40 },
];
const ANIMATE_MS = 200;
/** In a row of watched lessons, test her after every this many. */
const WATCH_TEST_EVERY = 5;
/** Above this many changed tiles the board doesn't mark them (a brand new forest). */
const MAX_MARKED = 60;
const MAX_CHANGE_POINTS = 8;

/** A big test, with what it was run on, so a test of an older model or forest is not shown as the current one. */
interface TestRun {
  report: TestReport;
  model: Model;
  lessons: number;
  practiceRuns: number;
  tiles: string;
  energy: number;
  boldness: number;
  events: boolean;
  /** The tile every trip started on, or null for random spots. */
  start: number | null;
}

interface Job {
  kind: 'lessons' | 'practice' | 'watch' | 'watchRuns';
  done: number;
  total: number;
  cancel: () => void;
  /** Watched ones only: pause or go on. */
  pause?: (on: boolean) => void;
  paused?: boolean;
  /** A watched row only: stop watching and do the rest quickly in the worker. */
  fastForward?: () => void;
}

/** Lessons or practice runs played one at a time on the main thread (see `App.play`). */
interface RowPlayer<T> {
  kind: 'watch' | 'watchRuns';
  total: number;
  /** Do the ones not watched yet quickly, in the worker. */
  rest(count: number): void;
  /** Start the next one, or null when there is nothing to start. */
  begin(): T | null;
  /** One step; true once it is over (one tick after the last step, to show the end). */
  advance(item: T): boolean;
  /** Learn from a finished one. */
  learn(item: T): void;
  /** Update the charts with what was learned since the last checkpoint. */
  checkpoint(): void;
  /** Drop the one on show. */
  clear(): void;
  /** After the row ends or is stopped, with how many were finished. */
  /** `forwarding`: the rest follow in the worker, so a summary of the whole row waits until then. */
  finish(done: number, forwarding: boolean): void;
}

export class App {
  private current!: Forest;
  /** The forest; it carries the walking-wolves setting, so every walk in it (here and in the worker) sees it. */
  get forest(): Forest { return this.current; }
  set forest(f: Forest) { f.wolves = this.settings.wolves; this.current = f; }
  edited = false;
  /** The forest tiles she was taught on (to spot a knowledge cutoff). */
  modelTiles = '';
  /** Home on test trips since the forest changed after her lessons. */
  changeLog: ChangePoint[] = [];
  /** Hand edits made since the last check of how she does. */
  private uncheckedEdits = false;
  settings: Settings = { ...DEFAULTS };
  model: Model | null = null;
  opt: Adam | null = null;
  stats!: TrainStats;
  tab: TabId = 'forest';
  job: Job | null = null;
  /** The running job's buttons, kept across redraws (see `jobButtons`). */
  private jobRow: { job: Job; el: HTMLElement; pause: HTMLButtonElement | null; speeds: HTMLButtonElement[] } | null = null;
  walker: Walker | null = null;
  /** The trip alone was cut short with Stop (she is still standing where she was). */
  private tripStopped = false;
  private thoughts: Thoughts | null = null;
  /** The hidden forest events of the trip alone (null with events off). */
  private tracker: EventTracker | null = null;
  /** Where the events of the current trip alone are: the forest's fixed places, or new ones for this trip. */
  private tripSpots: EventSpot[] = [];
  /** Forest events set off by the last step. */
  private lastMet: EventMet[] = [];
  /** Her story of the last trip alone, and what it was told from (for "Tell it again"). */
  private story: { rec: TripRecord; lines: StorySentence[] } | null = null;
  private storySeen = false;
  /** The basket-events card pulsed already this session. */
  private basketEventSeen = false;
  /** The story's own randomness, never the walk's. */
  private storyRng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  private thoughtSeen = false;
  /** Timer of a move held back while she says where she is going. */
  private held: number | null = null;
  /** "Show events" (for testing): the event spots' kind numbers on the board. Not saved. */
  private showEvents = false;
  /** The forest's event spots, worked out again whenever the tiles change. */
  private spotsCache: { key: string; spots: EventSpot[] } | null = null;
  watch: { walk: LessonWalk; k: number } | null = null;
  techStep = 0;
  /** The card whose "?" pulses: something just happened that it explains. */
  fresh: CardKey | null = 'forest';
  why: Explanation | null = null;
  /** How the last watched lesson ended, when it is worth a warning: at a wolf den (the wolf) or stuck at a tree (the crow). */
  watchedEnd: 'den' | 'stuck' | null = null;
  /** Speed of the lessons being watched; can change while they play. */
  watchSpeed: WatchSpeed = 'slow';
  /** How many steps of the last watched lesson she guessed right before learning from it. */
  lastGuess: { right: number; steps: number } | null = null;
  /** The practice run being watched. */
  runWatch: Walker | null = null;
  /** The judge's score for the last watched practice run. */
  lastRun: { outcome: Outcome; score: number; judge: Judge; noCake: boolean; flowers: number; treasure: number } | null = null;
  lastPractice: PracticeSummary | null = null;
  /** Big test: the tile every trip starts on (null: random spots), the latest test and the one before it. */
  testStart: number | null = null;
  test: TestRun | null = null;
  testBefore: TestRun | null = null;
  private testing = false;
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
    this.panel.append(this.panelBody);
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

  /** The hidden event spots of the current forest (none when events are off). */
  get eventSpots(): EventSpot[] {
    if (!this.settings.events) return [];
    const key = `${this.forest.code}:${this.forest.size}:${store.packTiles(this.forest.tiles)}`;
    if (this.spotsCache?.key !== key) this.spotsCache = { key, spots: placeStoryEvents(this.forest) };
    return this.spotsCache.spots;
  }

  /**
   * The event spots "Show events" shows: on the Forest and Settings tabs the forest's fixed places (none with
   * new places every trip); on the Trip alone tab the places of this trip once she has started.
   */
  private shownSpots(): EventSpot[] | null {
    if (this.tab === 'forest' || this.tab === 'settings') return this.settings.newPlaces ? null : this.eventSpots;
    if (this.tab === 'trip') return this.walker && this.tracker ? this.tripSpots : this.settings.newPlaces ? null : this.eventSpots;
    return null;
  }

  /** The "Show events" checkbox on the Settings tab, shown while events are on. */
  private showEventsCheck(): HTMLElement | null {
    if (!this.settings.events) return null;
    return h('label', { class: 'check', title: 'For testing: show where the hidden events are, with their numbers' },
      h('input', { type: 'checkbox', checked: this.showEvents, onchange: (e: Event) => {
        this.showEvents = (e.target as HTMLInputElement).checked; this.renderBoard(); this.renderPanel();
      } }),
      h('span', {}, 'Show events (for testing)', this.showEvents && this.settings.newPlaces ? h('small', { class: 'muted' }, ' — they move every trip, so they show on the Trip alone tab once she starts') : null));
  }

  private markTrained() { this.modelTiles = store.packTiles(this.forest.tiles); }

  /** Tiles that differ from the forest she was taught on. */
  get changedTiles(): number[] {
    if (!this.trained || !this.modelTiles) return [];
    const old = store.unpackTiles(this.modelTiles, this.forest.tiles.length);
    if (!old) return [];
    const out: number[] = [];
    this.forest.tiles.forEach((t, i) => { if (t !== old[i]) out.push(i); });
    return out;
  }

  /** Test her in the current forest and add the result to the change chart. */
  private logCheck(label: string) {
    if (!this.model) return;
    this.changeLog.push({ label, home: homeShare(this.model, this.forest) });
    if (this.changeLog.length > MAX_CHANGE_POINTS) this.changeLog.splice(1, 1); // keep "before"
    this.uncheckedEdits = false;
  }

  /** Before the first change after her lessons: start a new chart with how she does now. */
  private logBeforeChange() {
    if (this.trained && !this.outdated) {
      this.changeLog = [];
      this.logCheck('Before the change');
    }
  }

  private checkEdits() {
    if (this.uncheckedEdits && this.outdated) this.logCheck('After your edits');
    this.uncheckedEdits = false;
  }

  /** A small or big random change, or a brand new forest, keeping what she learned. */
  private changeAfterLessons(kind: 'small' | 'big' | 'new') {
    if (!this.trained || this.busy) return;
    this.checkEdits();
    this.logBeforeChange();
    this.stopTrip();
    this.walker = null;
    this.why = null;
    if (kind === 'new') {
      this.forest = generateForest(randomCode(this.rng));
      this.edited = false;
      this.stats.coverage = new Array(this.forest.tiles.length).fill(0); // she was taught nowhere here
      this.board.setForest(this.forest);
      this.logCheck('Brand new forest');
      this.showCard('newWorld');
    } else {
      const n = CHANGE_SIZES[kind];
      const { forest, changed } = changeForest(this.forest, n, `${this.forest.code}:${store.packTiles(this.forest.tiles)}`);
      this.forest.tiles = forest.tiles;
      this.edited = true;
      for (const i of changed) this.board.updateTile(i, forest.tiles[i]);
      this.logCheck(`${kind === 'small' ? 'Small' : 'Big'} change (${changed.length} tiles)`);
      this.showCard('outdated');
    }
    this.board.clearTrails();
    this.updateLink();
    this.saveSoon();
    this.render();
  }
  get busy() { return this.job !== null; }
  /** Lessons or practice runs are playing step by step. */
  get watching() { return this.job?.kind === 'watch' || this.job?.kind === 'watchRuns'; }

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
    this.changeLog = [];
    this.uncheckedEdits = false;
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
      if (!PRACTICE_STARTS.includes(this.settings.practiceStarts)) this.settings.practiceStarts = DEFAULTS.practiceStarts;
      this.settings.wolves = Math.min(MAX_WOLVES, Math.max(0, Math.floor(Number(this.settings.wolves ?? DEFAULTS.wolves) || 0)));
      const { code, size, tiles } = saved.forest;
      forest = tiles.length === size * size ? forestFromTiles(code, size, tiles) : generateForest(code, size);
      this.edited = saved.forest.edited;
      this.modelTiles = saved.modelTiles ?? '';
      this.changeLog = Array.isArray(saved.changeLog) ? saved.changeLog : [];
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
        changeLog: this.model ? this.changeLog : [],
        settings: { ...this.settings },
        model: this.model ? modelToJSON(this.model) : null,
        stats: this.model ? this.stats : null,
      });
    }, 400);
  }

  private updateLink() {
    history.replaceState(null, '', store.forestLink(this.forest, this.edited));
  }

  /** Something just happened that a card explains: make its "?" buttons pulse until it is opened. */
  private showCard(key: CardKey | null) {
    this.fresh = key;
    document.querySelectorAll('.hint-q').forEach((b) => b.classList.toggle('fresh', b.getAttribute('data-hint') === key));
  }

  /** A "?" button that opens the LM corner card for `key`. */
  private q(key: CardKey, place?: string) {
    return hintButton(key, { fresh: this.fresh === key, place, onOpen: (k) => { if (this.fresh === k) this.showCard(null); } });
  }

  /** Text followed by its "?" button, kept on one line with the last word. */
  private hq(text: string, key: CardKey, place?: string) {
    const i = text.trimEnd().lastIndexOf(' ') + 1;
    return h('span', {}, text.slice(0, i), h('span', { class: 'nowrap' }, text.slice(i).trimEnd(), this.q(key, place)));
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
    else if (this.tab === 'test' && !drag && !this.testing && isWalkable(this.forest.tiles[i])) {
      this.testStart = this.testStart === i ? null : i;
      this.render();
    }
  }

  private paint(i: number) {
    const brush = this.settings.brush;
    if (i === this.forest.home || this.forest.tiles[i] === brush) return;
    this.logBeforeChange();
    const oldHome = this.forest.home;
    if (brush === HOME) {
      moveHome(this.forest, i);
      this.board.updateTile(oldHome, this.forest.tiles[oldHome]);
    } else this.forest.tiles[i] = brush;
    if (this.trained) this.uncheckedEdits = true;
    this.edited = true;
    this.walker = null;
    this.board.updateTile(i, brush);
    if (brush === HOME || this.showEvents) this.renderBoard(); // the practice circle, heatmap and event spots follow the tiles
    this.renderChanged();
    if (this.trained) this.showCard(brush === HOME ? 'movedHome' : 'outdated');
    else if (brush === HOME) this.showCard('editForest');
    else if (brush === SWAMP) this.showCard('swamp');
    this.updateLink();
    this.saveSoon();
    this.renderBanner();
    this.renderPanel();
  }

  private undoEdits() {
    const fresh = generateForest(this.forest.code, this.forest.size);
    this.forest.tiles = fresh.tiles;
    this.forest.home = fresh.home;
    this.edited = false;
    this.walker = null;
    this.uncheckedEdits = false;
    if (this.changeLog.length) this.logCheck('Edits undone');
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

  private startLessons(count = this.settings.lessons) {
    const model = this.ensureModel();
    this.stopTrip();
    this.checkEdits();
    const catchUp = this.outdated;
    this.watchedEnd = null;
    this.runJob(
      { kind: 'lessons', model, forest: copyForest(this.forest), stats: this.stats, count, seed: this.seed(), teacher: this.settings.teacher },
      0.1,
      () => {
        this.markTrained();
        if (this.changeLog.length) this.logCheck(`+${count} new lesson${count === 1 ? '' : 's'}`);
        const t = this.settings.teacher;
        if (catchUp) this.showCard('catchUp');
        else this.showCard(t === 'mother' || t === 'father' ? 'coverage' : teacherCard(t));
      },
    );
    this.render();
  }

  /**
   * Play lessons or practice runs one at a time, step by step, until `total` are done or
   * Stop. She learns from each one as it ends; charts are updated every few.
   */
  private play<T>(p: RowPlayer<T>, speed: WatchSpeed) {
    this.watchSpeed = speed;
    let timer = 0;
    let item: T | null = null;
    let sinceCheck = 0;
    // What runs next; Pause clears the timer and Go on starts it again.
    let next: () => void = () => {};
    const stepMs = () => this.stepMs();
    const later = (fn: () => void, ms: number) => {
      next = fn;
      if (!this.job?.paused) timer = window.setTimeout(fn, ms);
    };
    const show = () => { this.renderBoard(); this.renderStripNow(); };
    const begin = () => {
      item = p.begin();
      if (item === null) { stop(); return; }
      show();
      later(tick, stepMs());
    };
    const tick = () => {
      if (!this.job || item === null) return;
      if (!p.advance(item)) {
        show();
        later(tick, stepMs());
        return;
      }
      p.learn(item);
      item = null;
      sinceCheck++;
      this.job.done++;
      if (this.job.done >= p.total) { stop(); return; }
      if (sinceCheck >= WATCH_TEST_EVERY) { p.checkpoint(); sinceCheck = 0; this.saveSoon(); }
      // A short pause on the finished trail before the next one.
      p.clear();
      show();
      this.renderPanel();
      later(begin, stepMs() * 2);
    };
    // A lesson or run cut off half-way is not learned; finished ones are kept.
    const stop = (forwarding = false) => {
      window.clearTimeout(timer);
      const done = this.job?.done ?? 0;
      this.job = null;
      p.clear();
      if (sinceCheck) p.checkpoint();
      p.finish(done, forwarding);
      this.saveSoon();
      this.render();
    };
    const pause = (on: boolean) => {
      if (!this.job || this.job.paused === on) return;
      this.job.paused = on;
      window.clearTimeout(timer);
      if (!on) timer = window.setTimeout(next, stepMs());
      this.renderPanel();
    };
    // The finished ones are kept as on Stop; the rest go to the worker.
    const fastForward = () => {
      const left = p.total - (this.job?.done ?? 0);
      stop(left > 0);
      if (left > 0) p.rest(left);
    };
    this.job = { kind: p.kind, done: 0, total: p.total, cancel: stop, pause, paused: false, fastForward: p.total > 1 ? fastForward : undefined };
    begin();
    this.render();
  }

  private stepMs() { return WATCH_SPEEDS.find((w) => w.id === this.watchSpeed)?.ms ?? 380; }

  /** Watch one slow lesson, or a row of them. Same `learnFromLesson` as the worker. */
  private watchLessons(total: number, speed: WatchSpeed) {
    const model = this.ensureModel();
    const starts = startTiles(this.forest);
    if (!starts.length) return;
    this.stopTrip();
    this.checkEdits();
    this.watchedEnd = null;
    this.lastGuess = null;
    this.board.clearTrails();
    const costs = teacherCosts(this.forest);
    let lossSum = 0;
    let lossN = 0;
    let lastEnd: 'den' | 'stuck' | null = null;
    let lastTeacher: Teacher | null = null;
    this.showCard('guess');
    this.play<{ walk: LessonWalk; k: number }>({
      kind: 'watch', total,
      rest: (n) => this.startLessons(n),
      begin: () => {
        const teacher = chooseTeacher(this.settings.teacher, this.rng);
        const walk = walkLesson(this.forest, teacher, costs[teacher], pick(this.rng, starts), this.rng, costs.den);
        this.watch = { walk, k: 0 };
        return this.watch;
      },
      advance: (w) => ++w.k > w.walk.history.moves.length,
      learn: ({ walk }) => {
        if (!this.opt) return;
        this.lastGuess = guessesRight(model, walk);
        lossSum += learnFromLesson(model, this.opt, walk, this.stats);
        lossN++;
        lastEnd = endsAtDen(this.forest, walk) ? 'den' : endsStuck(walk) ? 'stuck' : null;
        lastTeacher = walk.teacher;
        this.board.addTrail(walk.positions, TRAIL_COLORS[walk.teacher], total > 1 ? 0.2 : 0.35);
        this.markTrained();
      },
      checkpoint: () => {
        if (!lossN) return;
        recordLessonBatch(model, this.forest, this.stats, lossSum / lossN);
        lossSum = 0;
        lossN = 0;
      },
      clear: () => { this.watch = null; },
      finish: (done) => {
        if (!done) return;
        if (this.changeLog.length) this.logCheck(`+${done} new lesson${done === 1 ? '' : 's'}`);
        this.watchedEnd = total === 1 ? lastEnd : null;
        const errand = total === 1 && (lastTeacher === 'grandma' || lastTeacher === 'magpie' || lastTeacher === 'huntsman');
        this.showCard(this.watchedEnd === 'den' ? 'wolfTeacher' : this.watchedEnd === 'stuck' ? 'crowTeacher' : errand ? teacherCard(lastTeacher!) : total > 1 ? 'watchMany' : 'exposure');
      },
    }, speed);
  }

  // ---------- trip alone ----------

  private chooseStart(i: number) {
    if (!this.model || !this.trained) return;
    if (!isWalkable(this.forest.tiles[i])) return;
    this.stopTrip();
    this.walker = new Walker(this.forest, this.model, i, this.settings.energy, this.settings.boldness, this.rng);
    this.tripStopped = false;
    this.story = null;
    this.thoughts = new Thoughts(Math.random, this.model.cfg.hint);
    // Events and the story have their own randomness, never the walk's.
    this.tripSpots = !this.settings.events ? []
      : this.settings.newPlaces ? placeStoryEvents(this.forest, CAST, SPOT_COUNT, tripSeed(this.storyRng() * 2 ** 32)) : this.eventSpots;
    this.tracker = this.settings.events ? new EventTracker(this.forest, this.tripSpots, mulberry32((Math.random() * 2 ** 32) >>> 0)) : null;
    this.walker.events = this.tracker;
    this.why = null;
    this.techStep = 0;
    this.board.clearFx();
    this.showCard('arrows');
    this.render();
  }

  /** One sampled move, without redrawing. Returns her thought about it, if any. */
  private advanceTrip(w: Walker): string[] | null {
    w.temperature = this.settings.boldness;
    w.step();
    const bumped = w.blocked[w.t - 1];
    if (bumped && this.fresh !== 'tree' && w.blocked.filter(Boolean).length === 1) this.showCard('tree');
    if (w.results[w.t - 1] === 'grabbed' && this.fresh !== 'cakeShield') this.showCard('cakeShield');
    if (this.forest.tiles[w.pos] === SWAMP && !bumped && this.fresh !== 'swamp' && !w.positions.slice(0, -1).some((p) => this.forest.tiles[p] === SWAMP)) this.showCard('swamp');
    this.lastMet = this.tracker?.met.filter((e) => e.t === w.t) ?? [];
    if (this.lastMet.some((e) => e.effect) && !this.basketEventSeen) { this.basketEventSeen = true; this.showCard('basketEvents'); }
    // Made up after the move is picked, so she can comment on the move she just took.
    // A fox that finds no cake has nothing to complain about: no thought for a quiet event.
    return this.thoughts?.after(w, this.lastMet.filter((e) => !e.quiet).map((e) => eventKind(e.kind)?.thoughts ?? [])) ?? null;
  }

  /**
   * Next step or Walk through: one move, with a little "Ouch!", splash or thought on the board.
   * Returns the thought shown, if any, so Walk through can wait while it is read.
   */
  private stepTrip(): string[] | null {
    const w = this.walker;
    if (!w || !this.tripLive(w) || this.held) return null;
    const fresh = this.fresh;
    const thought = this.advanceTrip(w);
    // A thought about the move ("Let's go north.") is said first, where she still stands; the move follows.
    if (thought && this.thoughts?.planned && this.settings.thoughts && !w.done) {
      this.board.say(thought);
      this.held = window.setTimeout(() => { this.held = null; this.board.say(null); this.showMove(w, fresh, thought, false); }, PLAN_MS);
      return null;
    }
    return this.showMove(w, fresh, thought, true);
  }

  /** Draws the move just made (her pops, thought and the board). */
  private showMove(w: Walker, fresh: unknown, thought: string[] | null, say: boolean): string[] | null {
    const res = w.results[w.t - 1];
    if (w.blocked[w.t - 1]) this.board.showOuch(w.pos, w.history.moves[w.t - 1]);
    else if (this.forest.tiles[w.pos] === SWAMP) this.board.showSplash(w.pos);
    else if (res === 'grabbed') this.board.showPop(w.pos, 'The wolf took the cake!', crossedCake());
    else if (res === 'flowers') this.board.showPop(w.pos, 'Flowers!');
    else if (res === 'treasure') this.board.showPop(w.pos, 'Treasure!', gem(0, 0, 8));
    // Forest events pop up their word too, above a basket word if there is one.
    const basketPop = res === 'grabbed' || res === 'flowers' || res === 'treasure';
    // An event that changed her basket shows what it did: the crossed-out cake, the gem.
    const effectIcon = (e: EventMet) => (e.effect === 'takeCake' ? crossedCake() : e.effect === 'giveTreasure' ? gem(0, 0, 8) : undefined);
    this.lastMet.forEach((e, k) => this.board.showPop(w.pos, eventKind(e.kind)?.popup ?? '', effectIcon(e), k + (basketPop ? 2 : 0)));
    // Her first thought of the session makes the "?" by "Her thoughts" pulse, unless something else just did.
    if (thought && this.settings.thoughts && !this.thoughtSeen && this.fresh === fresh) { this.thoughtSeen = true; this.showCard('thoughts'); }
    this.afterTripSteps(w);
    return say ? this.sayThought(w, thought) : null;
  }

  /** The whole rest of the trip at once, drawn only at the end, with no thought bubbles. */
  private instantTrip() {
    const w = this.walker;
    if (!w || !this.tripLive(w)) return;
    this.stopAuto();
    this.releaseHeld();
    this.board.say(null);
    while (!w.done) this.advanceTrip(w);
    this.afterTripSteps(w);
  }

  /**
   * Her thought bubble, about the move she just took. Her next move takes it away, so a
   * "Definitely north." never shows while she walks east. The last one stays when the trip ends.
   */
  private sayThought(w: Walker, thought: string[] | null): string[] | null {
    if (!thought || !this.settings.thoughts) { this.board.say(null); return null; }
    this.board.say(thought, { ms: w.done ? undefined : readMs(thought), below: w.outcome === 'lost' });
    return thought;
  }

  private afterTripSteps(w: Walker) {
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
    this.tellStory(w, e.card ?? null);
    if (w.outcome === 'home') this.board.showHearts(w.pos);
    else if (w.outcome === 'eaten') this.board.showWolf(w.pos);
    else this.board.showLostNote(w.pos);
  }

  /**
   * Her story of the trip that just ended (or was stopped). Its "?" pulses at the first story
   * of a session, and when a story has a made-up part unless a more telling card just did.
   */
  private tellStory(w: Walker, otherCard: CardKey | null) {
    const rec: TripRecord = {
      forest: this.forest, start: w.start, positions: w.positions, results: w.results, outcome: w.outcome,
      met: this.tracker?.met ?? [], placed: this.tripSpots.map((sp) => sp.kind),
      shapedBy: shapedBy(this.stats.judgeRuns, this.stats.teacherCounts),
    };
    const lines = tellStory(rec, this.settings.boldness, this.storyRng);
    this.story = { rec, lines };
    if (!this.storySeen || (lines.some((l) => l.madeUp) && (!otherCard || otherCard === 'home'))) {
      this.storySeen = true;
      this.showCard('story');
    }
  }

  /** Tell it again: the same trip, new wording and new made-up parts (at the boldness set now). */
  private tellAgain() {
    if (!this.story) return;
    this.story.lines = tellStory(this.story.rec, this.settings.boldness, this.storyRng);
    this.renderPanel();
  }

  /** The "Her story" box: each sentence with a footprint (true) or a dashed cloud (made up). */
  private storyBox(): HTMLElement | null {
    const st = this.story;
    if (!st) return null;
    return h('div', { class: 'story' },
      h('h4', {}, this.hq('Her story', 'story')),
      h('ol', {}, ...st.lines.map((l) => h('li', { class: l.madeUp ? 'made-up' : '' }, l.madeUp ? cloudMark() : footprintMark(), h('span', {}, l.text)))),
      h('p', { class: 'story-count' }, storyCount(st.lines)),
      h('div', { class: 'row spaced' }, h('button', { onclick: () => this.tellAgain(), title: 'The same trip, told again' }, 'Tell it again'), this.q('retell')));
  }

  private toggleAuto() {
    if (this.auto) { this.stopAuto(); this.renderPanel(); return; }
    if (!this.walker || !this.tripLive(this.walker)) return;
    // One move at a time; after a thought she waits until it is read, since her next move takes it away.
    const tick = () => {
      const thought = this.stepTrip();
      if (!this.auto) return;
      // A thought about the move is said first, so she waits for it before the move, then goes on quickly.
      this.auto = window.setTimeout(tick, this.held !== null ? PLAN_MS + WALK_STEP_MS : thought ? readMs(thought) : WALK_STEP_MS);
    };
    this.auto = window.setTimeout(tick, WALK_STEP_MS);
    this.renderPanel();
  }

  /** Still walking: not at the end of the trip and not stopped. */
  private tripLive(w: Walker): boolean {
    return !w.done && !this.tripStopped;
  }

  /** Stop: cut the trip short when she goes in circles or keeps bumping into trees. */
  private stopWalk() {
    const w = this.walker;
    if (!w || !this.tripLive(w)) return;
    this.stopAuto();
    this.releaseHeld();
    this.tripStopped = true;
    this.board.say(null);
    this.showCard('stop');
    if (w.t > 0) this.tellStory(w, 'stop');
    this.render();
  }

  private stopAuto() {
    if (this.auto) clearTimeout(this.auto);
    this.auto = null;
  }

  /** Her move waiting for her to finish saying where she goes: do it now (the state has moved on already). */
  private releaseHeld() {
    if (this.held === null) return;
    clearTimeout(this.held);
    this.held = null;
    this.board.say(null);
  }

  private stopTrip() {
    this.stopAuto();
    this.releaseHeld();
    this.board.clearFx();
  }

  // ---------- practice ----------

  /** `from`: where a watched row that was fast-forwarded began, so the summary covers all of it. */
  private startPractice(count = this.settings.practice, from?: { homeBefore: number; scoreFrom: number; evalBefore?: EvalPoint }) {
    if (!this.model) return;
    this.stopTrip();
    const judge = this.settings.judge;
    const homeBefore = from?.homeBefore ?? this.homeNow();
    const evalBefore = from ? from.evalBefore : this.evalNow();
    const scoreFrom = from?.scoreFrom ?? this.stats.practiceScore.length;
    this.lastPractice = null;
    this.lastRun = null;
    this.runJob(
      { kind: 'practice', model: this.model, forest: copyForest(this.forest), stats: this.stats, count, seed: this.seed(), judge, starts: this.settings.practiceStarts },
      0.12,
      () => {
        this.walker = null;
        this.summarizePractice(judge, homeBefore, scoreFrom, evalBefore);
      },
    );
    this.board.clearTrails();
    this.showCard('practice');
    this.render();
  }

  private evalNow(): EvalPoint | undefined { return this.stats.practiceEval.at(-1) ?? this.stats.lessonEval.at(-1); }
  private homeNow() { return this.evalNow()?.home ?? 0; }

  /** Watch one slow practice run, or a row of them. Same `learnFromRun` as the worker. */
  private watchRuns(total: number, speed: WatchSpeed) {
    const model = this.model;
    if (!model) return;
    this.stopTrip();
    this.walker = null;
    const judge = this.settings.judge;
    const homeBefore = this.homeNow();
    const evalBefore = this.evalNow();
    const scoreFrom = this.stats.practiceScore.length;
    const setup = practiceSetup(this.forest, this.stats, this.settings.practiceStarts);
    this.lastPractice = null;
    this.lastRun = null;
    this.board.clearTrails();
    let scoreSum = 0;
    let scoreN = 0;
    this.showCard('practice');
    this.play<Walker>({
      kind: 'watchRuns', total,
      // The summary at the end counts the whole row, the watched runs too.
      rest: (n) => this.startPractice(n, { homeBefore, scoreFrom, evalBefore }),
      begin: () => {
        const starts = practiceStartTiles(this.forest, this.stats, setup);
        if (!starts.length) return null;
        this.runWatch = practiceWalker(model, this.forest, pick(this.rng, starts), this.stats, this.rng, setup);
        return this.runWatch;
      },
      advance: (w) => {
        if (w.done) return true;
        w.step();
        return false;
      },
      learn: (w) => {
        const score = learnFromRun(model, this.forest, judge, w, this.stats, setup);
        scoreSum += score;
        scoreN++;
        const p = w.pickups;
        this.lastRun = { outcome: w.outcome ?? 'lost', score, judge, noCake: !w.basket.cake, flowers: p.flowers, treasure: p.treasure };
        this.board.addTrail(w.positions, TRAIL_COLORS[w.outcome ?? 'lost'], total > 1 ? 0.2 : 0.35);
      },
      checkpoint: () => {
        if (!scoreN) return;
        recordPracticeBatch(model, this.forest, this.stats, scoreSum / scoreN);
        scoreSum = 0;
        scoreN = 0;
      },
      clear: () => { this.runWatch = null; },
      finish: (done, forwarding) => {
        if (!done || forwarding) return;
        if (total > 1) this.summarizePractice(judge, homeBefore, scoreFrom, evalBefore);
        else this.showCard('runScore');
      },
    }, speed);
  }

  /** After practice: compare the judge's score with her real success, and pick the card that explains it. */
  private summarizePractice(judge: Judge, homeBefore: number, scoreFrom: number, evalBefore?: EvalPoint) {
    // Average judge score over the first and last few batches of this round.
    const pts = this.stats.practiceScore.slice(scoreFrom).map((p) => p.y);
    const k = Math.max(1, Math.min(4, Math.floor(pts.length / 2)));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const sum: PracticeSummary = {
      judge, homeBefore, homeAfter: this.stats.practiceEval.at(-1)?.home ?? homeBefore,
      scoreBefore: mean(pts.slice(0, k)), scoreAfter: mean(pts.slice(-k)), card: 'judge',
      evalBefore, evalAfter: this.stats.practiceEval.at(-1),
    };
    const tc = this.stats.teacherCounts;
    const onlyOther = (judge === 'mother' && tc.mother === 0) || (judge === 'father' && tc.father === 0);
    if (judge === 'wolf') sum.card = 'judgeWolf';
    else if (judge === 'magpie') sum.card = 'judgeMagpie';
    else if (judge === 'huntsman') sum.card = 'judgeHuntsman';
    else if (judge === 'grandma' && ((tc.wolf ?? 0) > 0 || (this.stats.judgeRuns?.wolf ?? 0) > 0)) sum.card = 'fixBadData';
    else if (sum.scoreAfter > sum.scoreBefore && sum.homeAfter < sum.homeBefore - 0.05) sum.card = 'rewardHacking';
    else if (judge === 'father' && (sum.evalAfter?.noCake ?? 0) > Math.max(0.05, (evalBefore?.noCake ?? 0) + 0.05)) sum.card = 'cakeShield';
    else if (onlyOther) sum.card = 'teacherVsJudge';
    this.lastPractice = sum;
    this.showCard(sum.card);
  }

  // ---------- rendering ----------

  private goTab(id: TabId) {
    if (this.busy || this.locked(id)) return;
    this.stopAuto();
    if (this.tab === 'forest') this.checkEdits();
    if (id !== this.tab) this.board.say(null);
    this.tab = id;
    this.watchedEnd = null;
    this.board.clearTrails();
    closeHint();
    const cards: Record<TabId, CardKey | null> = { forest: 'forest', lessons: 'lessons', trip: 'view', practice: 'practice', test: 'bigTest', inside: 'tech', settings: null };
    this.fresh = cards[id];
    this.render();
  }

  private locked(id: TabId) {
    return (id === 'trip' || id === 'practice' || id === 'test') && !this.trained;
  }

  render() {
    this.renderTabs();
    this.renderBanner();
    const inside = this.tab === 'inside';
    this.techEl.hidden = !inside;
    this.panel.hidden = inside;
    (this.boardWrap.parentElement as HTMLElement).hidden = inside;
    // The forest and settings tabs are for building, and the big test is many trips at once: no one memory to show there.
    this.stripEl.hidden = this.tab === 'forest' || this.tab === 'settings' || this.tab === 'test';
    if (inside) this.renderTechNow();
    else {
      this.renderBoard();
      this.renderPanel();
      this.renderStripNow();
    }
    placeHint();
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
      const marked = this.changedTiles.length <= MAX_MARKED;
      this.banner.append(h('strong', {}, 'Her lessons are out of date. '), 'The forest changed after she was taught, but she still remembers the old one. ', marked ? 'Changed tiles have a dashed yellow edge. ' : 'This whole forest is new to her. ', this.hq('Catch-up lessons (tab 2) bring her up to date. ', marked ? 'outdated' : 'newWorld', 'banner'));
    }
  }

  private renderStripNow() {
    const mem = this.model?.cfg.memory ?? MEMORY_PAIRS[this.settings.memory];
    if (this.watch) {
      const { walk, k } = this.watch;
      const t = Math.min(k, walk.history.views.length - 1);
      renderStrip(this.stripEl, walk.history, t, mem, k < walk.history.moves.length ? walk.history.moves[k] : null, this.q('memory', 'strip'), this.q('basket', 'basket'));
    } else if ((this.tab === 'trip' && this.walker) || (this.tab === 'practice' && this.runWatch)) {
      const w = (this.tab === 'trip' ? this.walker : this.runWatch) as Walker;
      renderStrip(this.stripEl, w.history, Math.min(w.t, w.history.views.length - 1), mem, w.done ? w.history.moves[w.t - 1] : null, this.q('memory', 'strip'), this.q('basket', 'basket'));
    } else renderStrip(this.stripEl, null, 0, mem, undefined, this.q('memory', 'strip'), this.q('basket', 'basket'));
  }

  private renderTechNow() {
    renderTech(this.techEl, {
      forest: this.forest, model: this.model, stats: this.stats, walker: this.walker, boldness: this.settings.boldness, step: this.techStep,
      onStep: (k) => { this.techStep = k; },
      onExport: () => this.exportModel(),
      onImport: (f) => this.importModel(f),
      hint: (key) => this.q(key),
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
    b.interactive = (this.tab === 'forest' || this.tab === 'trip' || this.tab === 'test') && !this.busy;
    b.setStart(null);
    b.setTrace(null);
    b.setArrows(null);
    b.setFog(null);
    b.setRadius(null);
    b.setParent(null);
    b.setRed(null);
    b.setWolves([]);
    b.setPicked(null);
    b.setEventMarks(this.showEvents ? this.shownSpots()?.map((sp) => ({ ...sp, name: eventKind(sp.kind)?.name })) ?? null : null);
    this.renderChanged();
    b.setHeat(this.tab === 'lessons' && this.settings.heat && this.stats.lessons > 0 ? this.stats.coverage : null);

    if (this.tab === 'lessons' && this.watch && this.model) {
      const { walk, k } = this.watch;
      const n = walk.history.moves.length;
      const t = Math.min(k, n);
      // The teacher is a step ahead of her; at the end of a crow's lesson, on the tree it flew over.
      b.setParent(walk.stuck && t >= n - 1 ? neighbor(this.forest, walk.positions[n - 1], walk.history.moves[n - 1]) : walk.positions[Math.min(t + 1, n)], walk.teacher);
      b.setRed(walk.positions[t], { animate: t > 0 && this.stepMs() >= ANIMATE_MS });
      b.setWolves(walk.wolves?.map((p) => p[t]) ?? [], t > 0 && this.stepMs() >= ANIMATE_MS);
      b.setTrace(walk.positions.slice(0, t + 1));
      // The parent picks up an item on the way too, by the same rule as her trips.
      b.setPicked(walk.positions.slice(1, t + 1).filter((p) => isItem(this.forest.tiles[p])));
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
      b.setPicked(w.trip.picked);
      b.setRed(w.pos, { energy: w.energyLeft / w.energy, sitting: w.outcome === 'lost', animate: w.t > 0 });
      b.setWolves(w.wolves.map((x) => x.path[w.t]), w.t > 0);
      if (this.tripLive(w) && this.settings.arrows) b.setArrows(w.pos, w.tempered(), this.tints(w.pos));
      if (this.settings.fog && this.tripLive(w)) b.setFog(w.pos);
    }
    if (this.tab === 'test') {
      if (this.testStart !== null && !isWalkable(this.forest.tiles[this.testStart])) this.testStart = null;
      b.setStart(this.testStart);
      // Her trails of the latest test, coloured by how each ended.
      b.clearTrails();
      for (const t of this.currentTest()?.report.trips ?? []) b.addTrail(t.positions, TRAIL_COLORS[t.outcome], 0.1);
    }
    if (this.tab === 'practice') {
      const d = walkingDistances(this.forest);
      const set = new Set<number>();
      if (this.settings.practiceStarts === 'near') d.forEach((v, i) => { if (v >= 1 && v <= this.stats.radius) set.add(i); });
      b.setRadius(set);
      const w = this.runWatch;
      if (w) {
        b.setStart(w.start);
        b.setTrace(w.positions);
        b.setPicked(w.trip.picked);
        b.setRed(w.pos, { energy: w.energyLeft / w.energy, sitting: w.outcome === 'lost', animate: w.t > 0 && this.stepMs() >= ANIMATE_MS });
        b.setWolves(w.wolves.map((x) => x.path[w.t]), w.t > 0 && this.stepMs() >= ANIMATE_MS);
        if (!w.done) b.setArrows(w.pos, w.tempered(), this.tints(w.pos));
      }
    }
  }

  private renderChanged() {
    const changed = this.changedTiles;
    this.board.setChanged(changed.length && changed.length <= MAX_MARKED ? changed : null);
  }

  /** The "since the forest changed" box: buttons to change it and the before/after chart. */
  private changeBox(where: 'forest' | 'lessons'): HTMLElement | null {
    if (!this.trained) return null;
    const busy = this.busy;
    const chart = this.changeLog.length ? h('div', {}, h('h4', {}, this.hq('Getting home since the forest changed', 'testTrips', 'change')), changeChart(this.changeLog)) : null;
    if (where === 'forest') {
      return h('div', { class: 'group' },
        h('h3', {}, this.hq('Change the forest after her lessons', 'outdated')),
        h('div', { class: 'row' },
          h('button', { disabled: busy, onclick: () => this.changeAfterLessons('small') }, `Small change (${CHANGE_SIZES.small} tiles)`),
          h('button', { disabled: busy, onclick: () => this.changeAfterLessons('big') }, `Big change (${CHANGE_SIZES.big} tiles)`)),
        h('div', { class: 'row spaced' }, h('button', { disabled: busy, onclick: () => this.changeAfterLessons('new') }, 'New forest, same Red Riding Hood'), this.q('newWorld')),
        chart);
    }
    if (!this.outdated && !chart) return null;
    return h('div', { class: 'group catch-up' },
      h('h3', {}, this.hq(this.outdated ? 'The forest changed' : 'Since the forest changed', 'catchUp')),
      this.outdated ? h('p', { class: 'muted' }, `Catch-up lessons from the ${TEACHERS.find((t) => t.id === this.settings.teacher)?.name.toLowerCase() ?? 'teacher'} in the changed forest, on top of what she knows.`) : null,
      this.outdated ? h('div', { class: 'row' }, ...CATCH_UP.map((n) => h('button', { disabled: busy, onclick: () => this.startLessons(n) }, `${n} catch-up lessons`))) : null,
      chart);
  }

  private renderPanel() {
    const body = this.panelBody;
    clear(body);
    if (this.tab === 'forest') this.forestPanel(body);
    else if (this.tab === 'lessons') this.lessonsPanel(body);
    else if (this.tab === 'trip') this.tripPanel(body);
    else if (this.tab === 'practice') this.practicePanel(body);
    else if (this.tab === 'test') this.testPanel(body);
    else if (this.tab === 'settings') this.settingsPanel(body);
    placeHint();
  }

  private slider(label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onchange: (v: number) => void, hint?: [string, string], card?: CardKey) {
    const out = h('output', {}, fmt(value));
    const input = h('input', {
      type: 'range', min, max, step, value, disabled: this.busy,
      oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); out.textContent = fmt(v); onchange(v); },
    });
    return h('label', { class: 'control' }, h('span', { class: 'control-head' }, h('span', {}, card ? this.hq(label, card) : label), out), input,
      hint ? h('span', { class: 'range-hint' }, h('span', {}, hint[0]), h('span', {}, hint[1])) : null);
  }

  /**
   * Pause, Stop and the speed switch, made once per job and reused on every redraw: the panel
   * is redrawn many times a second while she trains, and a button replaced between press and
   * release would lose the click.
   */
  private jobButtons(job: Job): HTMLElement {
    if (this.jobRow?.job !== job) {
      const pause = job.pause ? h('button', { class: 'primary', onclick: () => job.pause?.(!job.paused) }, 'Pause') as HTMLButtonElement : null;
      const speeds = this.watching ? WATCH_SPEEDS.map((w) => h('button', { role: 'radio', onclick: () => { this.watchSpeed = w.id; this.renderPanel(); } }, w.name) as HTMLButtonElement) : [];
      const word = job.kind === 'watchRuns' ? 'runs' : 'lessons';
      const el = h('div', { class: 'row' },
        pause,
        job.fastForward ? h('button', { onclick: () => job.fastForward?.(), title: `Do the rest of the ${word} quickly, without watching` }, 'Fast-forward') : null,
        h('button', { onclick: () => job.cancel(), title: 'Stop here; she keeps what she has learned so far' }, 'Stop'),
        speeds.length ? h('div', { class: 'speed', role: 'radiogroup', 'aria-label': 'Speed' }, h('span', { class: 'muted' }, 'Speed:'), ...speeds) : null);
      this.jobRow = { job, el, pause, speeds };
    }
    const { el, pause, speeds } = this.jobRow;
    if (pause) pause.textContent = job.paused ? 'Go on' : 'Pause';
    speeds.forEach((b, i) => {
      const on = WATCH_SPEEDS[i].id === this.watchSpeed;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    return el;
  }

  private watchText() {
    return this.job?.kind === 'watchRuns'
      ? 'The arrows are her own guess; one move is picked by chance.'
      : 'The arrows are her guess; the coloured one is the teacher\'s move.';
  }

  /**
   * Lessons and Practice share these controls, under the "so far" line and the "to add" slider.
   * Idle: the big button that does them all quickly in the worker, and below it the smaller
   * Watch one / Watch them in a row. While something runs, the same spot holds Pause,
   * Fast-forward (the rest of a watched row) and Stop, the speed when watching, then a progress bar on its own line,
   * so the way to stop is right where it was started.
   */
  private runControls(o: {
    what: 'lesson' | 'run'; total: number; sofar: number; watch: (total: number, speed: WatchSpeed) => void; watchCard: CardKey;
    all: () => void; explainCard: CardKey; last: string | Node;
  }) {
    const job = this.job;
    const title = `${o.what[0].toUpperCase()}${o.what.slice(1)} after ${o.what}, ${o.total} in all; pause or stop any time`;
    if (!job) {
      return h('div', { class: 'run-controls' },
        h('div', { class: 'row' },
          h('button', { onclick: () => o.watch(1, 'slow'), title: `One ${o.what}, slowly` }, `One ${o.what}`),
          h('button', { onclick: () => o.watch(o.total, 'normal'), title }, `Watch ${o.what}s`),
          h('button', { class: 'primary', onclick: o.all, title: `Do all ${o.what}s quickly, without watching` }, 'Jump to ', h('span', { class: 'n-add' }, String(o.total)), ` ${o.what}s`),
          this.q(o.watchCard)));
    }
    const watching = this.watching;
    const many = job.total > 1;
    const buttons = this.jobButtons(job);
    const word = job.kind === 'practice' || job.kind === 'watchRuns' ? 'run' : 'lesson';
    const step = watching ? `${word[0].toUpperCase()}${word.slice(1)} ${Math.min(job.done + 1, job.total)} of ${job.total}` : `${job.done} of ${job.total} ${word}s`;
    const label = `${step}, ${o.sofar} so far`;
    return h('div', { class: 'run-controls running' },
      buttons,
      many ? h('div', { class: 'progress' },
        h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${(100 * job.done) / job.total}%` })),
        h('span', {}, label)) : null,
      watching ? h('p', { class: 'muted' }, this.hq(`${job.paused ? 'Paused. ' : ''}${this.watchText()}`, o.explainCard, 'watch')) : null,
      watching && many && o.last ? h('p', {}, o.last) : null);
  }

  /** Slider for how many lessons or runs to add: keeps the number on the button in step while dragging. */
  private addSlider(label: string, value: number, min: number, max: number, step: number, set: (v: number) => void, card?: CardKey) {
    const el = this.slider(label, value, min, max, step, (v) => String(v), (v) => {
      set(v); this.saveSoon();
      el.closest('.panel-body')?.querySelectorAll('.n-add').forEach((x) => { x.textContent = String(v); });
    }, undefined, card);
    return el;
  }

  private guessLine() {
    const g = this.lastGuess;
    if (!g) return '';
    return this.hq(g.steps ? `In the last lesson she guessed ${g.right} of ${g.steps} teacher's moves right before learning from it.` : 'The last lesson started at home.', 'watchMany', 'guessed');
  }

  private runLine() {
    const r = this.lastRun;
    if (!r) return '';
    const what = r.outcome === 'home' ? `she got home${r.noCake ? ' without the cake' : ''}` : r.outcome === 'eaten' ? 'the wolf got her' : 'she ran out of energy';
    const who = r.judge === 'grandma' ? 'Grandma' : `The ${JUDGE_INFO[r.judge].name.toLowerCase()}`;
    const pts = `${r.score >= 0 ? '+' : '−'}${Math.abs(r.score).toFixed(2)}`;
    const found = basketWords(r);
    return this.hq(`In the last run ${what}${found ? ` (she picked ${found})` : ''}. ${who} gave it ${pts} points.`, 'runScore', 'scored');
  }

  private forestPanel(body: HTMLElement) {
    const codeInput = h('input', { type: 'text', value: '', placeholder: 'code', maxlength: 12, 'aria-label': 'Forest code' });
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
      h('h2', {}, this.hq('The forest', 'forest')),
      h('p', {}, "Grandma's house stays in the same spot. Everything she learns and every test happens in this one forest. You can move the house with its brush below."),
      h('p', { class: 'muted' }, 'Each ', h('span', { class: 'hint-q sample', 'aria-hidden': 'true' }, '?'), ' shows the language-model idea behind it, and how real chatbots do it.'),
      h('div', { class: 'group' },
        h('div', { class: 'code-line' }, 'Forest code ', h('code', { class: 'code' }, this.forest.code), this.edited ? h('span', { class: 'tag' }, 'edited') : null, this.q('forestCode')),
        h('div', { class: 'row code-row' }, h('button', { onclick: () => this.setForest(generateForest(randomCode()), false) }, 'New forest'), codeInput, h('button', { onclick: open }, 'Generate'))),
      h('div', { class: 'group' },
        h('h3', {}, this.hq('Edit the forest', 'editForest')),
        h('p', { class: 'muted' }, 'Pick a brush, then click or drag on the map.'),
        h('div', { class: 'row brushes' }, brushBtn(PATH, 'Path'), brushBtn(TREE, 'Tree'), brushBtn(SWAMP, 'Swamp'), brushBtn(WOLF, 'Wolf den'), brushBtn(FLOWERS, 'Flowers'), brushBtn(TREASURE, 'Treasure'), brushBtn(HOME, "Grandma's house")),
        unreachable ? h('p', { class: 'warn' }, `${unreachable} path tile${unreachable === 1 ? '' : 's'} can't reach home without crossing a wolf den. Her parents never start lessons there.`) : null,
        this.edited ? h('button', { onclick: () => this.undoEdits() }, 'Undo all edits') : null),
      this.changeBox('forest'),
    );
  }

  /** All the options in one place: her as a model, her trips alone, lessons and the forest events. */
  private settingsPanel(body: HTMLElement) {
    const busy = this.busy;
    const check = (checked: boolean, onchange: (v: boolean) => void, label: Node) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked, onchange: (e: Event) => onchange((e.target as HTMLInputElement).checked) }), h('span', {}, label));
    add(body,
      h('h2', {}, 'Settings'),
      h('p', { class: 'muted' }, 'All the options in one place. They are kept in this browser.'),
      h('div', { class: 'group settings-box' },
        h('h3', {}, this.hq('Her memory', 'memory')),
        h('div', { class: 'radios' }, ...(['short', 'medium', 'long'] as MemorySize[]).map((m) => h('label', { class: 'radio' },
          h('input', { type: 'radio', name: 'memory', disabled: busy, checked: this.settings.memory === m, onchange: () => { this.changeMemoryOrHint(() => { this.settings.memory = m; }); this.showCard('memorySize'); } }),
          `${m[0].toUpperCase()}${m.slice(1)} (${MEMORY_PAIRS[m]} step${MEMORY_PAIRS[m] === 1 ? '' : 's'})`))),
        h('p', { class: 'muted' }, this.hq('Chosen before her lessons: changing it later means a new Red Riding Hood.', 'memorySize')),
        check(this.settings.hint, (v) => { this.changeMemoryOrHint(() => { this.settings.hint = v; }); this.showCard('hint'); },
          this.hq("Smell of grandma's cake (she senses the rough direction home)", 'hint')),
        this.model ? h('div', {}, h('button', { class: 'subtle', disabled: busy, onclick: () => {
          if (confirm('Start over with a new Red Riding Hood? All her lessons and practice will be forgotten.')) { this.resetModel(); this.saveSoon(); this.render(); }
        } }, 'Start over with a new Red Riding Hood')) : null),
      h('div', { class: 'group settings-box' },
        h('h3', {}, 'Trip alone'),
        this.slider('Energy (step budget)', this.settings.energy, 10, 200, 5, (v) => String(v), (v) => {
          this.settings.energy = v; this.walker?.setEnergy(v); this.saveSoon(); if (this.fresh !== 'energy') this.showCard('energy');
        }, undefined, 'energy'),
        this.slider('Boldness', this.settings.boldness, 0.1, 2.5, 0.1, (v) => v.toFixed(1), (v) => {
          this.settings.boldness = v; this.saveSoon(); if (this.fresh !== 'boldness') this.showCard('boldness');
        }, ['careful', 'bold'], 'boldness'),
        check(this.settings.fog, (v) => { this.settings.fog = v; this.saveSoon(); this.showCard('view'); }, this.hq('Fog: show only what she sees', 'view', 'fog')),
        check(this.settings.thoughts, (v) => { this.settings.thoughts = v; this.saveSoon(); if (!v) this.board.say(null); this.showCard('thoughts'); }, this.hq('Her thoughts (just for fun)', 'thoughts')),
        check(this.settings.arrows, (v) => { this.settings.arrows = v; this.saveSoon(); this.showCard('arrows'); }, this.hq('Arrows around her', 'arrows'))),
      h('div', { class: 'group settings-box' },
        h('h3', {}, 'Lessons'),
        check(this.settings.heat, (v) => { this.settings.heat = v; this.saveSoon(); this.showCard('coverage'); }, this.hq('Show where she was taught (heatmap)', 'coverage'))),
      h('div', { class: 'group settings-box' },
        h('h3', {}, this.hq('Walking wolves', 'walkingWolf')),
        h('div', { class: 'radios' }, ...Array.from({ length: MAX_WOLVES + 1 }, (_, n) => h('label', { class: 'radio' },
          h('input', { type: 'radio', name: 'wolves', disabled: busy, checked: this.settings.wolves === n, onchange: () => {
            this.settings.wolves = n;
            this.forest.wolves = n;
            this.stopTrip();
            this.walker = null;
            this.why = null;
            this.saveSoon(); this.showCard('walkingWolf'); this.render();
          } }),
          n === 0 ? 'None' : String(n)))),
        h('p', { class: 'muted' }, 'They are out in lessons, practice and every trip. To her each one looks just like a wolf den. She only learns to keep away from them if wolves walked about in her lessons too.')),
      h('div', { class: 'group settings-box' },
        h('h3', {}, 'Forest events'),
        check(this.settings.events, (v) => {
          this.settings.events = v;
          if (!v) { this.tracker = null; if (this.walker) this.walker.events = null; }
          this.saveSoon(); this.showCard('events'); this.renderBoard(); this.renderPanel();
        }, this.hq('Things happen in the forest', 'events')),
        this.settings.events ? h('p', { class: 'muted' }, 'An owl, a frog, an empty hut… She can\'t see them, but she meets them on her trips alone, and her story tells about them. ',
          this.hq('A few change her basket: a sly fox, a kind neighbour, a magpie.', 'basketEvents')) : null,
        this.settings.events ? check(this.settings.newPlaces, (v) => {
          this.settings.newPlaces = v; this.saveSoon(); this.showCard('newPlaces'); this.renderBoard(); this.renderPanel();
        }, this.hq('New places every trip', 'newPlaces')) : null,
        this.showEventsCheck()),
    );
  }

  /**
   * A drop-down choice (teacher or judge) with a card below it for the chosen one:
   * its picture, what it does and any extra details.
   */
  private chooser(label: string, options: [string, string][], value: string, disabled: boolean, onChange: (id: string) => void,
    icon: SVGElement, text: string | Node, ...extra: Node[]): HTMLElement {
    const select = h('select', { 'aria-label': label, disabled, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
      ...options.map(([id, name]) => h('option', { value: id, selected: id === value }, name)));
    return h('div', { class: 'chooser' }, select,
      h('div', { class: 'chooser-card' }, h('div', { class: 'chooser-head' }, icon, h('span', {}, text)), ...extra));
  }

  private lessonsPanel(body: HTMLElement) {
    const st = this.stats;
    const busy = this.busy;
    add(body,
      h('h2', {}, this.hq('Lessons', 'lessons')),
      h('p', {}, this.hq('A teacher walks her home from a random spot. At every step she guesses the next move, sees what the teacher did, and learns a little.', 'guess')),
      this.changeBox('lessons'),
      h('h3', {}, this.hq('Who teaches her?', 'teacher')),
      (() => {
        const t = TEACHERS.find((x) => x.id === this.settings.teacher) ?? TEACHERS[0];
        const icon = s('svg', { width: 30, height: 30, viewBox: '-20 -24 40 44' });
        if (t.id === 'both') icon.append(s('g', { transform: 'translate(-7 0) scale(.8)' }, parentFigure(40, 'mother')), s('g', { transform: 'translate(7 0) scale(.8)' }, parentFigure(40, 'father')));
        else if (t.id === 'motherWolf') icon.append(s('g', { transform: 'translate(-7 0) scale(.8)' }, parentFigure(40, 'mother')), s('g', { transform: 'translate(7 0) scale(.8)' }, parentFigure(40, 'wolf')));
        else icon.append(parentFigure(40, t.id as Teacher));
        return this.chooser('Teacher', TEACHERS.map((x) => [x.id, x.name]), t.id, busy, (id) => {
          this.settings.teacher = id as TeacherChoice; this.saveSoon(); this.showCard(teacherCard(this.settings.teacher)); this.renderPanel();
        }, icon, this.hq(t.text, teacherCard(t.id), 'chosen'));
      })(),
      h('h3', {}, 'Give her more lessons'),
      h('p', {}, st.lessons ? `So far: ${st.lessons} lesson${st.lessons === 1 ? '' : 's'} (${TEACHER_KINDS.filter((t) => st.teacherCounts[t]).map((t) => `${t} ${st.teacherCounts[t]}`).join(', ')})` : 'So far: no lessons yet'),
      this.addSlider('Lessons to add', this.settings.lessons, 10, 2000, 10, (v) => { this.settings.lessons = v; }, 'moreData'),
      this.runControls({
        what: 'lesson', total: this.settings.lessons, sofar: st.lessons, watch: (n, sp) => this.watchLessons(n, sp), watchCard: 'watchMany',
        all: () => this.startLessons(), explainCard: 'guess', last: this.guessLine(),
      }),
      this.lastGuess && !(this.job?.kind === 'watch' && this.job.total > 1) ? h('p', {}, this.guessLine()) : null,
      this.watchedEnd === 'den' && !busy ? h('p', { class: 'warn' }, this.hq('That lesson came from the wolf in disguise: it ended at a wolf den, and she learned from it all the same.', 'wolfTeacher', 'watched')) : null,
      this.watchedEnd === 'stuck' && !busy ? h('p', { class: 'warn' }, this.hq('The crow flew on over a tree. She can\'t fly, so she bumped into it, and she learned that move all the same.', 'crowTeacher', 'watched')) : null,
      h('h3', {}, this.hq('How she does alone', 'testTrips')),
      outcomeChart(st.lessonEval, 'lessons'),
      h('p', { class: 'muted' }, 'Now and then she walks the same test trips alone, to see how much she has improved.'),
    );
  }

  private tripPanel(body: HTMLElement) {
    const w = this.walker;
    const probsBox = h('div', { class: 'probs' });
    if (w && this.tripLive(w)) {
      const raw = w.decide().raw;
      const tp = w.tempered();
      for (const m of MOVES) {
        probsBox.append(h('div', { class: 'prob-row', title: `before boldness: ${(raw[m] * 100).toFixed(1)}%, after boldness: ${(tp[m] * 100).toFixed(1)}%` },
          h('span', { class: 'arr' }, MOVE_ARROWS[m]), h('span', { class: 'name' }, MOVE_NAMES[m]),
          h('span', { class: 'pbar' }, h('span', { style: `width:${tp[m] * 100}%` })), h('span', { class: 'pct' }, `${Math.round(tp[m] * 100)}%`)));
      }
    }
    const walking = !!w && this.tripLive(w);
    const status: (string | Node)[] = !w
      ? []
      : this.tripStopped && !w.done
        ? [this.hq(`Stopped after ${w.t} steps.`, 'stop', 'status')]
        : w.done
        ? [{ home: `Home after ${w.t} steps${w.basket.cake ? '' : ', without the cake'}!`, eaten: `Eaten by a wolf at step ${w.t}.`, lost: `Lost: out of energy after ${w.t} steps.` }[w.outcome!], h('br'), pickupLine(w.pickups)]
        : [
          `Step ${w.t + 1} · energy ${w.energyLeft} / ${w.energy}`,
          !w.basket.cake ? h('span', { class: 'nowrap' }, this.hq(' · no cake: the next den is the end!', w.effects.some((e) => e.effect === 'takeCake') ? 'basketEvents' : 'cakeShield', 'status')) : null,
          w.t > 0 && w.blocked[w.t - 1] ? h('span', { class: 'nowrap' }, this.hq(' · ouch, a tree!', 'tree', 'status')) : null,
          this.forest.tiles[w.pos] === SWAMP ? h('span', { class: 'nowrap' }, this.hq(' · in a swamp, tiring!', 'swamp', 'status')) : null,
          this.settings.hint ? h('span', { class: 'nowrap' }, this.hq(` · smells cake to the ${SECTOR_WORDS[homeSector(this.forest, w.pos)]}`, 'hint')) : null,
        ].filter((x): x is string | HTMLElement => !!x);
    add(body,
      h('h2', {}, this.hq('Trip alone', 'view')),
      h('p', {}, this.hq(
        w ? 'Click a tile to pick where she starts (a path, swamp, flowers or treasure), then let her walk to grandma\'s house alone. The same tile again gives a different walk.'
          : 'Click a tile to pick where she starts (a path, swamp, flowers or treasure), then let her walk to grandma\'s house alone.', 'sampling')),
      h('div', { class: 'row' },
        h('button', { onclick: () => this.stepTrip(), disabled: !walking || !!this.auto, title: 'One move, then wait' }, 'Next step'),
        h('button', { class: 'primary', onclick: () => this.toggleAuto(), disabled: !walking, title: 'Walk on step by step until the trip ends' }, this.auto ? 'Pause' : 'Walk through'),
        h('button', { onclick: () => this.instantTrip(), disabled: !walking, title: 'Finish the whole trip at once' }, 'Instant run'),
        h('button', { onclick: () => this.stopWalk(), disabled: !walking, title: 'End this trip now, for example when she walks in circles or keeps bumping into trees' }, 'Stop')),
      walking ? null : h('p', { class: 'pick-hint' }, w
        ? 'The trip is over. Click a tile on the board to start a new one.'
        : 'The buttons are waiting for you: click a tile on the board to choose where she starts.'),
      status.length ? h('p', { class: 'status' }, ...status) : null,
      walking ? h('h3', {}, this.hq('Her next move', 'arrows')) : null,
      probsBox,
      // After every trip, also one cut short with Stop: there was a walk to tell about.
      w && !walking && w.t > 0 ? this.reportBox(w, this.why) : null,
      w && !walking && w.t > 0 ? this.storyBox() : null,
    );
  }

  // ---------- big test ----------

  /**
   * The latest big test, if it was run on the model and forest she has now. A test of an
   * older model or forest becomes "the test before" and is no longer shown as hers.
   */
  private currentTest(): TestRun | null {
    const t = this.test;
    if (t && (t.model !== this.model || t.lessons !== this.stats.lessons || t.practiceRuns !== this.stats.practiceRuns || t.tiles !== store.packTiles(this.forest.tiles))) {
      this.testBefore = t;
      this.test = null;
    }
    if (!this.trained) { this.test = null; this.testBefore = null; }
    return this.test;
  }

  /** Walk `count` trips alone with the energy, boldness and forest events from Settings, then count them up. */
  private runBigTest(count: number) {
    if (!this.model || this.testing || this.busy) return;
    this.currentTest();
    this.testing = true;
    this.render();
    // Let the page show "She is walking…" before the trips run.
    window.setTimeout(() => {
      const model = this.model;
      if (!model) { this.testing = false; return; }
      const st = this.settings;
      const report = runTest(model, this.forest, {
        count, energy: st.energy, boldness: st.boldness, events: st.events, newPlaces: st.newPlaces, start: this.testStart, seed: (this.rng() * 2 ** 32) >>> 0,
      });
      if (this.test) this.testBefore = this.test;
      this.test = {
        report, model, lessons: this.stats.lessons, practiceRuns: this.stats.practiceRuns, tiles: store.packTiles(this.forest.tiles),
        energy: st.energy, boldness: st.boldness, events: st.events, start: this.testStart,
      };
      this.testing = false;
      this.showCard('bigTest');
      this.render();
    }, 30);
  }

  private testPanel(body: HTMLElement) {
    const run = this.currentTest();
    const off = this.testing || this.busy;
    add(body,
      h('h2', {}, this.hq('Big test', 'bigTest')),
      h('p', {}, 'One trip tells you little, because every move is picked by chance. Here she walks many trips alone, one after another, and we count what happened.'),
      this.testStart === null
        ? h('p', { class: 'muted' }, 'Each trip starts on a random spot. Click a tile on the map to start them all there.')
        : h('p', { class: 'muted' }, 'All trips start on the marked tile. ',
          h('button', { class: 'subtle', disabled: off, onclick: () => { this.testStart = null; this.render(); } }, 'Random spots instead')),
      h('div', { class: 'row' }, ...TEST_SIZES.map((n, k) => h('button', { class: k === 0 ? 'primary' : '', disabled: off, onclick: () => this.runBigTest(n) }, `Walk ${n} trips`))),
      this.testing ? h('p', { class: 'status' }, 'She is walking…') : null,
      run ? this.testResults(run, this.testBefore) : this.testBefore ? this.testBeforeLine(this.testBefore, 'Her last test was before her latest training or a change to the forest') : null,
    );
  }

  private testBeforeLine(b: TestRun, what: string): HTMLElement {
    const r = b.report;
    return h('p', { class: 'compare' }, this.hq(`${what} (${r.count} trips, energy ${b.energy}, boldness ${b.boldness.toFixed(1)}): ${pct(r.home)} home, ${pct(r.eaten)} eaten, ${pct(r.lost)} lost.`, 'sampling', 'before'));
  }

  private testResults(run: TestRun, before: TestRun | null): HTMLElement {
    const r = run.report;
    const n = r.count;
    const icon = (...kids: SVGElement[]) => { const svg = s('svg', { width: 24, height: 24, viewBox: '-13 -13 26 26', 'aria-hidden': 'true' }); svg.append(...kids); return svg; };
    const emptyBattery = icon(
      s('rect', { x: -10, y: -5, width: 18, height: 10, rx: 2, fill: '#fff', stroke: COLORS.ink, 'stroke-width': 1.5 }),
      s('rect', { x: 8, y: -2, width: 2.5, height: 4, fill: COLORS.ink }));
    const row = (ic: SVGElement, label: string, share: number, color: string, was?: number) => h('div', { class: 'test-row' },
      ic, h('span', {}, label),
      h('span', { class: 'pbar', 'aria-hidden': 'true' }, h('span', { style: `width:${share * 100}%;background:${color}` })),
      h('span', { class: 'pct' }, pct(share), was !== undefined ? h('small', { class: 'muted', title: 'in the test before' }, ` (${pct(was)})`) : null));
    const b = before?.report;
    const num = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
    const line = (label: string, value: string) => h('div', { class: 'test-line' }, h('span', {}, label), h('strong', {}, value));
    const total = (avg: number) => Math.round(avg * n);
    const times = (k: number) => (k === 1 ? 'once' : `${k} times`);
    return h('div', { class: 'test-results' },
      h('h3', {}, `How her ${n} trips ended`),
      row(icon(cake(0, 0, 10)), 'Home with the cake', r.home - r.homeNoCake, COLORS.home, b ? b.home - b.homeNoCake : undefined),
      row(icon(crossedCake()), 'Home, no cake', r.homeNoCake, COLORS.home, b?.homeNoCake),
      row(icon(wolfHead(22)), 'Eaten by a wolf', r.eaten, COLORS.danger, b?.eaten),
      row(emptyBattery, 'Lost: out of energy', r.lost, COLORS.lost, b?.lost),
      b && before ? h('p', { class: 'muted' }, `In brackets: the test before (${b.count} trips${before.start !== run.start ? (before.start === null ? ' from random spots' : run.start === null ? ' all from one tile' : ' from another tile') : ''}${before.model !== run.model || before.lessons !== run.lessons || before.practiceRuns !== run.practiceRuns ? ', before her latest training' : ''}${before.tiles !== run.tiles ? ', in the forest before it changed' : ''}${before.energy !== run.energy || before.boldness !== run.boldness ? `, energy ${before.energy}, boldness ${before.boldness.toFixed(1)}` : ''}).`) : null,
      h('h3', {}, this.hq('On an average trip', 'tripReport', 'test')),
      h('div', { class: 'test-lines' },
        r.stepsHome !== null && r.shortestHome !== null ? line('Steps to get home', `${num(r.stepsHome)} (shortest way: ${num(r.shortestHome)})`) : null,
        line('Energy used', `${num(r.energyUsed)} of ${run.energy}`),
        line('Bumps into trees', num(r.bumps)),
        line('Steps in a swamp', num(r.swampSteps)),
        line('Wolves seen', num(r.densSeen)),
        run.events ? line('Forest events met', num(r.eventsMet)) : null),
      h('h3', {}, `In all ${n} trips`),
      h('div', { class: 'test-lines' },
        line('The wolf grabbed the cake', times(r.cakeByWolf)),
        run.events ? line('The sly fox took the cake', times(r.cakeByFox)) : null,
        line('Flowers brought home', String(total(r.flowersHome))),
        line('Treasure kept', String(total(r.treasure))),
        r.topEvents.length ? line('Events met most', r.topEvents.slice(0, 3).map((e) => `${e.name} (${e.trips})`).join(', ')) : null),
      r.facts.length ? h('h3', {}, this.hq('Did you know?', 'sampling', 'facts')) : null,
      r.facts.length ? h('ul', { class: 'facts' }, ...r.facts.slice(0, 6).map((f) => h('li', {}, f))) : null,
    );
  }

  /** Tired, wet and scared: how the trip went for her, not just where it ended. */
  private reportBox(w: Walker, why: Explanation | null): HTMLElement {
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
    const bumpIcon = icon(
      s('polygon', { points: '-2,-10 6,4 -10,4', fill: COLORS.tree }),
      s('rect', { x: -3.5, y: 4, width: 3, height: 6, fill: COLORS.trunk }),
      s('path', { d: 'M 6 -9 l 1.5 3 3 -1 -1 3 3 1.5 -3 1.5 1 3 -3 -1 -1.5 3 -1.5 -3', fill: '#e0a020', stroke: COLORS.ink, 'stroke-width': 0.8 }));
    const row = (ic: SVGElement, label: string, word: string, detail: string) =>
      h('div', { class: 'report-row' }, ic, h('span', {}, h('strong', {}, `${label}: ${word}`), h('br'), h('small', {}, detail)));
    const times = (k: number, one: string, many: string) => (k === 1 && one === 'time' ? 'once' : `${k} ${k === 1 ? one : many}`);
    return h('div', { class: 'report' },
      h('h4', {}, this.hq('How was the trip for her?', 'tripReport')),
      row(tiredIcon, 'Tired', r.tired, `used ${r.energyUsed} of ${r.energy} energy`),
      row(wetIcon, 'Wet', r.wet, r.swampSteps ? `waded through swamp ${times(r.swampSteps, 'time', 'times')}` : 'never stepped into a swamp'),
      row(scaredIcon, 'Scared', r.scared, r.wolvesSeen ? `saw ${times(r.wolvesSeen, 'wolf', 'wolves')} on the way` : 'saw no wolves'),
      row(bumpIcon, 'Bumped', r.bumped, r.treeHits ? `walked into a tree ${times(r.treeHits, 'time', 'times')}, wasting ${r.treeHits} energy` : 'never walked into a tree'),
      this.basketRow(w, icon),
      // "Why did she do that?" as a small note at the bottom.
      why ? h('p', { class: 'report-note' }, why.card ? this.hq(why.text, why.card, 'why') : why.text) : null,
    );
  }

  /** What is in her basket at the end: the cake or not, flowers, treasure, and where the changes came from. */
  private basketRow(w: Walker, icon: (...kids: SVGElement[]) => SVGSVGElement): HTMLElement {
    const b = w.basket;
    const things = basketWords(b);
    const word = w.outcome === 'eaten' ? 'lost with her' : !b.cake ? (things ? `no cake, but ${things}` : 'no cake') : things ? `the cake and ${things}` : 'the cake';
    // Always say how many she found, out of how many the forest has.
    // Tile pickups first, then what forest events gave her ("plus a bunch of flowers from Grandma's neighbour at step 9").
    const gifts = w.effects.filter((e) => e.effect !== 'takeCake').map(effectWords);
    const picked = pickupLine(w.pickups).replace(/^Picked/, 'picked').replace(/\.$/, '') + (gifts.length ? `, plus ${gifts.join(' and ')}` : '');
    const fox = w.effects.find((e) => e.effect === 'takeCake');
    const cakeGone = fox ? effectWords(fox) : w.cakeLostAt >= 0 ? `the wolf grabbed the cake at step ${w.cakeLostAt + 1}` : '';
    const detail = w.outcome === 'eaten'
      ? `${picked}; ${fox ? `${cakeGone}, and ` : ''}the wolf has the whole basket`
      : cakeGone
        ? `${picked}; ${cakeGone}${w.outcome === 'home' ? '' : '; flowers only count at Grandma\'s'}`
        : w.outcome === 'home' ? `${picked}; ${things ? 'all delivered' : 'the cake delivered'} to Grandma` : `${picked}; flowers only count at Grandma's`;
    return h('div', { class: 'report-row' }, icon(cake(0, 1, 10)),
      h('span', {}, h('strong', {}, this.hq(`Basket: ${word}`, 'processReward', 'basketReport')), h('br'), h('small', {}, detail)));
  }

  private practicePanel(body: HTMLElement) {
    const st = this.stats;
    const before = st.lessonEval.at(-1);
    const after = st.practiceEval.at(-1);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    add(body,
      h('h2', {}, this.hq('Practice on her own', 'practice')),
      h('p', {}, 'She walks alone and a judge who knows the forest gives each walk a score. After a good score she makes those moves more often; after a bad one, less often.'),
      h('h3', {}, this.hq('Who judges?', 'judge')),
      this.chooser('Judge', JUDGES.map((j) => [j, JUDGE_INFO[j].name]), this.settings.judge, this.busy, (id) => {
        this.settings.judge = id as Judge; this.saveSoon(); this.showCard(JUDGE_INFO[this.settings.judge].card); this.renderPanel();
      }, judgeIcon(this.settings.judge), this.hq(JUDGE_INFO[this.settings.judge].text, JUDGE_INFO[this.settings.judge].card)),
      h('h3', {}, 'Let her practise more'),
      h('p', {}, st.practiceRuns ? `So far: ${st.practiceRuns} practice run${st.practiceRuns === 1 ? '' : 's'}` : 'So far: no practice runs yet'),
      this.addSlider('Runs to add', this.settings.practice, 50, 3000, 50, (v) => { this.settings.practice = v; }),
      this.runControls({
        what: 'run', total: this.settings.practice, sofar: st.practiceRuns, watch: (n, sp) => this.watchRuns(n, sp), watchCard: 'runScore',
        all: () => this.startPractice(), explainCard: 'sampling', last: this.runLine(),
      }),
      this.lastRun && !(this.job?.kind === 'watchRuns' && this.job.total > 1) ? h('p', {}, this.runLine()) : null,
      h('h3', {}, this.hq('Where does she start?', 'curriculum')),
      h('div', { class: 'radios' }, ...PRACTICE_STARTS.map((id) => h('label', { class: 'radio' },
        h('input', { type: 'radio', name: 'practiceStarts', disabled: this.busy, checked: this.settings.practiceStarts === id, onchange: () => {
          this.settings.practiceStarts = id; this.saveSoon(); this.showCard('curriculum'); this.render();
        } }),
        id === 'near' ? 'Close to home first' : 'Anywhere in the forest'))),
      this.settings.practiceStarts === 'near'
        ? h('p', {}, h('span', { class: 'swatch-box' }), this.hq(` Easy trips first: she starts at most ${st.radius} steps from home (outlined). The circle grows when she gets home most of the time.`, 'curriculum'))
        : h('p', {}, this.hq('Any spot in the forest, near or far. If she has had few lessons, far trips are too hard at first and teach her little.', 'curriculum')),
      h('h3', {}, this.hq('How she does alone', 'testTrips')),
      outcomeChart(st.practiceEval, 'lessons + runs'),
      before && after ? h('p', { class: 'compare' }, this.hq(`On the same test trips: after lessons ${pct(before.home)} home, ${pct(before.eaten)} eaten; after practice ${pct(after.home)} home, ${pct(after.eaten)} eaten.`, 'recipe')) : null,
      this.practiceSummary(),
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
        : 'The wolf wants her at his den. Keep practising with him and watch her get home less often.')
      : p.judge === 'magpie'
        ? (homeDown ? 'She gets home less often: she goes for the treasure and wanders off. The magpie pays for treasure, not for coming to Grandma.'
          : 'The magpie pays for treasure. Keep practising and watch whether she still comes home.')
      : p.judge === 'huntsman'
        ? (homeDown ? 'She gets home less often: her walks got longer, and more of them run out of energy before she is home. The huntsman pays for a long walk, not for a sensible one.'
          : 'The huntsman pays for a long walk home and for every den she sees. Watch a trip alone: are her walks getting longer?')
      : p.card === 'cakeShield'
        ? 'She now cuts through wolf dens and lets the wolf have the cake: it saves steps, and the father doesn\'t count the cake.'
      : p.judge === 'grandma' && wolfTaught
        ? (p.homeAfter > p.homeBefore + 0.05 ? 'Grandma\'s practice is undoing some of what the wolf taught her. The more of it there is, the longer it takes.'
          : 'What the wolf taught her is hard to undo. Try more practice runs.')
      : scoreUp && homeDown
      ? `Her score went up, but she gets home less often. She is learning to please ${the}, not to get home. Watch a trip alone to see what she does now.`
      : p.judge === 'grandma'
        ? 'Grandma scores only the result, so a better score means she really gets home more.'
        : p.judge === 'crow'
          ? 'So far she still gets home, because walking towards home mostly helps. But the crow also pays her for bumping into a tree that is towards home. Keep practising and watch whether she gets home less often.'
          : `Watch a trip alone: she should now walk more the way ${the} likes.`;
    return h('div', { class: `why ${(scoreUp && homeDown) || ((p.judge === 'wolf' || p.judge === 'magpie' || p.judge === 'huntsman') && homeDown) ? 'alarm' : ''}` },
      h('h3', {}, this.hq(`What ${the} taught her`, p.card, 'summary')),
      h('p', {}, verdict),
      h('p', { class: 'muted' }, `Score from ${the}: ${p.scoreBefore.toFixed(2)} → ${p.scoreAfter.toFixed(2)}. Home on the test trips: ${pct(p.homeBefore)} → ${pct(p.homeAfter)}.`),
      this.basketChange(p));
  }

  /**
   * What she brought on the test trips before and after the round, per 10 trips:
   * flowers delivered to Grandma, treasure picked (and not lost to the wolf), home without the cake.
   */
  private basketChange(p: PracticeSummary): HTMLElement | null {
    const a = p.evalBefore;
    const b = p.evalAfter;
    if (!a || !b || a.flowers === undefined || b.flowers === undefined) return null;
    const per10 = (v = 0) => (Math.round(v * 100) / 10).toString();
    const pct = (v = 0) => `${Math.round(v * 100)}%`;
    return h('p', { class: 'muted' }, this.hq(
      `Basket on 10 test trips: flowers brought home ${per10(a.flowers)} → ${per10(b.flowers)}, treasure picked ${per10(a.treasure)} → ${per10(b.treasure)}. Home without the cake: ${pct(a.noCake)} → ${pct(b.noCake)}.`,
      'processReward', 'basketSummary'));
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
      this.changeLog = [];
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
