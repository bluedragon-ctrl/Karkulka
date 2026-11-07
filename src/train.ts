/** Training: phase 1 imitates the parents, phase 2 learns from judged practice runs. */
import { Adam, Model, accumulate, adamStep, forward, sgdStep, softmax, zeroGrads } from './model';
import { Rng, mulberry32, pick, rngFrom, shuffle } from './rng';
import { Outcome, Walker } from './sim';
import { LessonWalk, Teacher, TeacherChoice, costToDen, costToHome, walkLesson } from './teachers';
import { encodeContext } from './tokens';
import { DX, DY, Forest, Move, PATH, SWAMP, energyToHome, nearWolf, tilesWhere, walkingDistances, xyOf } from './world';

/** Internals the user never sets; shown read-only in the technical tab. */
export const FIXED = {
  hidden: 48,
  lessonLearningRate: 0.01,
  practiceLearningRate: 0.05,
  rewardHome: 1,
  rewardEaten: -1,
  partialCreditWeight: 0.5,
  lostPenalty: 0.3,
  /** Hurried father judge: points off for every step, so a short walk home scores best. */
  fatherStepCost: 0.05,
  /** Careful mother judge: points off for each swamp step and each step with a wolf den in sight. */
  motherSwampPenalty: 0.3,
  motherWolfPenalty: 0.25,
  /** Crow judge: points for each move that heads towards home as the crow flies (even into a tree), off for the others. */
  crowHeading: 0.08,
  crowHomeBonus: 0.2,
  /** Wolf judge: a prize when she walks into a den, points off when she gets home. */
  wolfDen: 1,
  wolfHome: -0.5,
  /** "Mother and the wolf": share of lessons the wolf in disguise slips in. */
  wolfLessonShare: 0.2,
  practiceBoldness: 0.7,
  baselineSmoothing: 0.05,
  curriculumStart: 3,
  curriculumStep: 2,
  curriculumThreshold: 0.7,
  curriculumWindow: 30,
  evalStarts: 40,
  evalBoldness: 0.5,
  /** Rounds of test trips for the before/after check when the forest changes. */
  checkRounds: 3,
  evalEnergy: 100,
  /** About this many rounds of test trips per job, so long jobs don't spend most of their time testing. */
  evalPoints: 20,
  chunk: 25,
} as const;

export interface Point { x: number; y: number }
export interface EvalPoint { x: number; home: number; eaten: number; lost: number }

export interface TrainStats {
  lessons: number;
  practiceRuns: number;
  coverage: number[];
  teacherCounts: Record<Teacher, number>;
  lessonLoss: Point[];
  lessonEval: EvalPoint[];
  practiceScore: Point[];
  practiceEval: EvalPoint[];
  /** Practice runs per judge (missing in older saves). */
  judgeRuns?: Partial<Record<Judge, number>>;
  radius: number;
  recent: number[];
  baseline: number;
}

export const newStats = (f: Forest): TrainStats => ({
  lessons: 0,
  practiceRuns: 0,
  coverage: new Array(f.tiles.length).fill(0),
  teacherCounts: { mother: 0, father: 0, wolf: 0 },
  lessonLoss: [],
  lessonEval: [],
  practiceScore: [],
  practiceEval: [],
  judgeRuns: {},
  radius: FIXED.curriculumStart,
  recent: [],
  baseline: 0,
});

export interface Teachers { mother: Float64Array; father: Float64Array; wolf: Float64Array; den: Float64Array }
export const teacherCosts = (f: Forest): Teachers => {
  const father = costToHome(f, 'father');
  return { mother: costToHome(f, 'mother'), father, wolf: father, den: costToDen(f) };
};

/** Starting tiles: path tiles that can reach home. */
export function startTiles(f: Forest, minDist = 1, maxDist = Infinity, dist = walkingDistances(f)): number[] {
  return tilesWhere(f, (t, i) => t === PATH && dist[i] >= minDist && dist[i] <= maxDist);
}

export function evalStarts(f: Forest): number[] {
  const all = startTiles(f, 2);
  return shuffle(rngFrom(`eval:${f.code}`), all).slice(0, FIXED.evalStarts);
}

/**
 * Run test trips after every how many batches of a job: every batch for short jobs,
 * less often for long ones so a job makes about FIXED.evalPoints chart points.
 */
export const evalEvery = (count: number): number => Math.max(1, Math.ceil(Math.ceil(count / FIXED.chunk) / FIXED.evalPoints));

/** Whether the batch ending at item i of a job ends with test trips. The last batch always does. */
const testsAfter = (i: number, count: number): boolean =>
  i === count - 1 || ((i + 1) / FIXED.chunk) % evalEvery(count) === 0;

/** How she does alone from a fixed set of starts. */
export function evaluate(model: Model, f: Forest, x: number): EvalPoint {
  const starts = evalStarts(f);
  const rng = rngFrom(`evalrun:${f.code}:${x}`);
  const counts: Record<Outcome, number> = { home: 0, eaten: 0, lost: 0 };
  for (const s of starts) counts[new Walker(f, model, s, FIXED.evalEnergy, FIXED.evalBoldness, rng).run()]++;
  const n = Math.max(1, starts.length);
  return { x, home: counts.home / n, eaten: counts.eaten / n, lost: counts.lost / n };
}

/** Share of test trips that end at home, over a few rounds of the fixed test trips (steadier than one round). */
export function homeShare(model: Model, f: Forest, rounds = FIXED.checkRounds): number {
  let sum = 0;
  for (let k = 0; k < rounds; k++) sum += evaluate(model, f, -1 - k).home;
  return sum / rounds;
}

/** Train on one lesson: per-step loss against what the parent did. Returns mean loss. */
export function learnFromLesson(model: Model, opt: Adam, walk: LessonWalk, stats: TrainStats): number {
  const g = zeroGrads(model);
  const steps = walk.history.moves.length;
  let loss = 0;
  for (let t = 0; t < steps; t++) {
    const fw = forward(model, encodeContext(model.cfg, walk.history, t));
    const p = softmax(fw.logits);
    const target = walk.history.moves[t];
    loss += -Math.log(Math.max(p[target], 1e-9));
    p[target] -= 1;
    accumulate(model, g, fw, p);
  }
  for (const pos of walk.positions) stats.coverage[pos]++;
  stats.teacherCounts[walk.teacher] = (stats.teacherCounts[walk.teacher] ?? 0) + 1;
  stats.lessons++;
  if (steps) adamStep(model, opt, g, FIXED.lessonLearningRate, 1 / steps);
  return steps ? loss / steps : 0;
}

/**
 * How many of a lesson's moves were her most likely guess, before she learns from it.
 * Shown when lessons are watched, like a language model's next-token accuracy.
 */
export function guessesRight(model: Model, walk: LessonWalk): { right: number; steps: number } {
  const steps = walk.history.moves.length;
  let right = 0;
  for (let t = 0; t < steps; t++) {
    const { logits } = forward(model, encodeContext(model.cfg, walk.history, t));
    let best = 0;
    for (let m = 1; m < logits.length; m++) if (logits[m] > logits[best]) best = m;
    if (best === walk.history.moves[t]) right++;
  }
  return { right, steps };
}

/** Record one batch of lessons for the charts: its mean loss and, when `test` is set, a round of test trips. */
export function recordLessonBatch(model: Model, f: Forest, stats: TrainStats, meanLoss: number, test = true) {
  stats.lessonLoss.push({ x: stats.lessons, y: meanLoss });
  if (test) stats.lessonEval.push(evaluate(model, f, stats.lessons));
}

export function chooseTeacher(choice: TeacherChoice, rng: Rng): Teacher {
  if (choice === 'both') return rng() < 0.5 ? 'mother' : 'father';
  if (choice === 'motherWolf') return rng() < FIXED.wolfLessonShare ? 'wolf' : 'mother';
  return choice;
}

export interface ChunkInfo {
  done: number;
  paths: { positions: number[]; tag: Teacher | Outcome }[];
}

export function trainLessons(
  model: Model, opt: Adam, f: Forest, choice: TeacherChoice, count: number, stats: TrainStats, rng: Rng,
  onChunk?: (info: ChunkInfo) => void,
) {
  const costs = teacherCosts(f);
  const starts = startTiles(f);
  if (!starts.length) return;
  let lossSum = 0;
  let lossN = 0;
  let paths: ChunkInfo['paths'] = [];
  for (let i = 0; i < count; i++) {
    const teacher = chooseTeacher(choice, rng);
    const walk = walkLesson(f, teacher, costs[teacher], pick(rng, starts), rng, costs.den);
    lossSum += learnFromLesson(model, opt, walk, stats);
    lossN++;
    paths.push({ positions: walk.positions, tag: teacher });
    if ((i + 1) % FIXED.chunk === 0 || i === count - 1) {
      recordLessonBatch(model, f, stats, lossSum / lossN, testsAfter(i, count));
      lossSum = 0;
      lossN = 0;
      onChunk?.({ done: i + 1, paths });
      paths = [];
    }
  }
}

/**
 * Who scores practice runs. Grandma only cares that she gets home. The parents also
 * score the way she walks. The crow measures closeness in a straight line, which
 * she can game: that is reward hacking. The wolf wants her at his den: a judge
 * with bad aims ruins a model that was doing well.
 */
export type Judge = 'grandma' | 'father' | 'mother' | 'crow' | 'wolf';
export const JUDGES: readonly Judge[] = ['grandma', 'father', 'mother', 'crow', 'wolf'];

/** Distances the judges measure with; they know the whole forest. */
export interface JudgeMaps {
  /** Energy still needed to walk home (swamps count extra). */
  energy: Float64Array;
  /** Fewest steps home. */
  steps: Int32Array;
  /** Tiles with a wolf den in sight. */
  wolfInSight: Uint8Array;
}

export function judgeMaps(f: Forest): JudgeMaps {
  const wolfInSight = new Uint8Array(f.tiles.length);
  for (let i = 0; i < f.tiles.length; i++) wolfInSight[i] = nearWolf(f, i) ? 1 : 0;
  return { energy: energyToHome(f), steps: walkingDistances(f), wolfInSight };
}

/** One finished run, as the judge sees it. */
export interface Run {
  outcome: Outcome;
  start: number;
  /** Where she stood after each step, starting with the start tile. */
  positions: readonly number[];
  /** The move she chose at each step. */
  moves: readonly Move[];
}

/** Up to +partialCreditWeight for ending closer than she started (less if she ended further away). */
const partialCredit = (startDist: number, endDist: number): number => {
  if (startDist <= 0 || endDist < 0 || !Number.isFinite(endDist)) return 0;
  return FIXED.partialCreditWeight * Math.max(-1, Math.min(1, 1 - endDist / startDist));
};

/** Whether a move from tile `from` points towards home in a straight line (whatever is in the way). */
export function headsHome(f: Forest, from: number, m: Move): boolean {
  const [x, y] = xyOf(f, from);
  const [hx, hy] = xyOf(f, f.home);
  return DX[m] * (hx - x) + DY[m] * (hy - y) > 0;
}

/** Grandma's score for how the trip ended; the parents start from it too. */
export function outcomeScore(maps: JudgeMaps, run: Run): number {
  if (run.outcome === 'home') return FIXED.rewardHome;
  if (run.outcome === 'eaten') return FIXED.rewardEaten;
  return -FIXED.lostPenalty + partialCredit(maps.energy[run.start], maps.energy[run.positions[run.positions.length - 1]]);
}

/**
 * The points one judge gives each move of a run; the run's score is their sum.
 * The way-of-walking points go to the move that earned them, so practice can tell
 * which moves the judge liked (the outcome points go to the last move).
 */
export function judgeRewards(judge: Judge, f: Forest, maps: JudgeMaps, run: Run): number[] {
  const n = run.moves.length;
  const r = new Array<number>(n).fill(0);
  if (!n) return r;
  for (let t = 0; t < n; t++) {
    const from = run.positions[t];
    const to = run.positions[t + 1];
    const last = t === n - 1;
    if (judge === 'father') r[t] -= FIXED.fatherStepCost;
    else if (judge === 'mother' && !(last && run.outcome !== 'lost')) {
      if (f.tiles[to] === SWAMP && to !== from) r[t] -= FIXED.motherSwampPenalty;
      if (maps.wolfInSight[to]) r[t] -= FIXED.motherWolfPenalty;
    } else if (judge === 'crow') r[t] += headsHome(f, from, run.moves[t]) ? FIXED.crowHeading : -FIXED.crowHeading;
  }
  const end = run.outcome;
  // The crow watches from the sky: it sees a wolf, and the house, but not whether she is tired out.
  if (judge === 'crow') r[n - 1] += end === 'eaten' ? FIXED.rewardEaten : end === 'home' ? FIXED.crowHomeBonus : 0;
  else if (judge === 'wolf') r[n - 1] += end === 'eaten' ? FIXED.wolfDen : end === 'home' ? FIXED.wolfHome : 0;
  else r[n - 1] += outcomeScore(maps, run);
  return r;
}

/** The score one judge gives a whole run. */
export const judgeScore = (judge: Judge, f: Forest, maps: JudgeMaps, run: Run): number =>
  judgeRewards(judge, f, maps, run).reduce((a, b) => a + b, 0);

/** Swamp steps and steps with a den in sight: what the careful mother takes points off for. */
export function walkWorries(f: Forest, maps: JudgeMaps, run: Run): { swamp: number; wolf: number } {
  let swamp = 0;
  let wolf = 0;
  for (let k = 1; k < run.positions.length; k++) {
    const p = run.positions[k];
    if (p === f.home || (k === run.positions.length - 1 && run.outcome === 'eaten')) continue;
    if (f.tiles[p] === SWAMP && p !== run.positions[k - 1]) swamp++;
    if (maps.wolfInSight[p]) wolf++;
  }
  return { swamp, wolf };
}

/** Share of her moves that headed towards home as the crow flies. */
export function headingShare(f: Forest, run: Run): number {
  if (!run.moves.length) return 0;
  return run.moves.filter((m, k) => headsHome(f, run.positions[k], m)).length / run.moves.length;
}

export function practiceEnergy(radius: number) {
  return Math.min(FIXED.evalEnergy, 4 * radius + 10);
}

export function trainPractice(
  model: Model, f: Forest, judge: Judge, count: number, stats: TrainStats, rng: Rng,
  onChunk?: (info: ChunkInfo) => void,
) {
  const dist = walkingDistances(f);
  const maps = judgeMaps(f);
  const maxDist = Math.max(1, ...Array.from(dist));
  stats.radius = Math.min(Math.max(stats.radius, FIXED.curriculumStart), maxDist);
  let scoreSum = 0;
  let scoreN = 0;
  let paths: ChunkInfo['paths'] = [];
  const walkRng = mulberry32(Math.floor(rng() * 2 ** 32));
  let startsRadius = -1;
  let starts: number[] = [];
  for (let i = 0; i < count; i++) {
    if (startsRadius !== stats.radius) {
      startsRadius = stats.radius;
      starts = startTiles(f, 1, stats.radius, dist);
    }
    if (!starts.length) return;
    const start = pick(rng, starts);
    const w = new Walker(f, model, start, practiceEnergy(stats.radius), FIXED.practiceBoldness, walkRng);
    const outcome = w.run();
    const rewards = judgeRewards(judge, f, maps, { outcome, start, positions: w.positions, moves: w.history.moves });
    const steps = rewards.length;
    // Reward to go: each move gets the points from that move to the end of the run.
    const toGo = rewards.slice();
    for (let t = steps - 2; t >= 0; t--) toGo[t] += toGo[t + 1];
    const s = steps ? toGo[0] : 0;
    const baseline = stats.baseline;
    stats.baseline += FIXED.baselineSmoothing * (s - stats.baseline);

    // Each move shares the credit or blame for what came after it (policy gradient).
    // The model has not changed during the run, so the walker's own forward
    // passes (at the practice boldness) are reused instead of recomputed.
    const g = zeroGrads(model);
    for (let t = 0; t < steps; t++) {
      const advantage = Math.max(-1, Math.min(1, toGo[t] - baseline));
      const d = w.decisions[t];
      const p = d.tempered.slice();
      p[w.history.moves[t]] -= 1;
      for (let o = 0; o < p.length; o++) p[o] *= advantage;
      accumulate(model, g, { x: d.input, nz: d.nz, h: d.hidden }, p);
    }
    if (steps) sgdStep(model, g, FIXED.practiceLearningRate, 1 / steps);
    stats.practiceRuns++;
    stats.judgeRuns = stats.judgeRuns ?? {};
    stats.judgeRuns[judge] = (stats.judgeRuns[judge] ?? 0) + 1;
    scoreSum += s;
    scoreN++;
    paths.push({ positions: w.positions, tag: outcome });

    // Automatic curriculum: move outward once she mostly succeeds.
    stats.recent.push(outcome === 'home' ? 1 : 0);
    if (stats.recent.length >= FIXED.curriculumWindow) {
      const rate = stats.recent.reduce((a, b) => a + b, 0) / stats.recent.length;
      if (rate >= FIXED.curriculumThreshold && stats.radius < maxDist) {
        stats.radius = Math.min(maxDist, stats.radius + FIXED.curriculumStep);
        stats.recent = [];
      } else stats.recent.shift();
    }

    if ((i + 1) % FIXED.chunk === 0 || i === count - 1) {
      stats.practiceScore.push({ x: stats.practiceRuns, y: scoreSum / scoreN });
      if (testsAfter(i, count)) stats.practiceEval.push(evaluate(model, f, stats.lessons + stats.practiceRuns));
      scoreSum = 0;
      scoreN = 0;
      onChunk?.({ done: i + 1, paths });
      paths = [];
    }
  }
}
