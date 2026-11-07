/** Training: phase 1 imitates the parents, phase 2 learns from judged practice runs. */
import { Adam, Model, accumulate, adamStep, forward, sgdStep, softmax, zeroGrads } from './model';
import { Rng, mulberry32, pick, rngFrom, shuffle } from './rng';
import { Outcome, Walker } from './sim';
import { LessonWalk, Teacher, TeacherChoice, costToHome, walkLesson } from './teachers';
import { encodeContext } from './tokens';
import { Forest, PATH, energyToHome, tilesWhere, walkingDistances } from './world';

/** Internals the user never sets; shown read-only in the technical tab. */
export const FIXED = {
  hidden: 48,
  lessonLearningRate: 0.01,
  practiceLearningRate: 0.05,
  rewardHome: 1,
  rewardEaten: -1,
  partialCreditWeight: 0.5,
  lostPenalty: 0.3,
  practiceBoldness: 0.7,
  baselineSmoothing: 0.05,
  curriculumStart: 3,
  curriculumStep: 2,
  curriculumThreshold: 0.7,
  curriculumWindow: 30,
  evalStarts: 40,
  evalBoldness: 0.5,
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
  radius: number;
  recent: number[];
  baseline: number;
}

export const newStats = (f: Forest): TrainStats => ({
  lessons: 0,
  practiceRuns: 0,
  coverage: new Array(f.tiles.length).fill(0),
  teacherCounts: { mother: 0, father: 0 },
  lessonLoss: [],
  lessonEval: [],
  practiceScore: [],
  practiceEval: [],
  radius: FIXED.curriculumStart,
  recent: [],
  baseline: 0,
});

export interface Teachers { mother: Float64Array; father: Float64Array }
export const teacherCosts = (f: Forest): Teachers => ({ mother: costToHome(f, 'mother'), father: costToHome(f, 'father') });

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
  stats.teacherCounts[walk.teacher]++;
  stats.lessons++;
  if (steps) adamStep(model, opt, g, FIXED.lessonLearningRate, 1 / steps);
  return steps ? loss / steps : 0;
}

/** Record one batch of lessons for the charts: its mean loss and, when `test` is set, a round of test trips. */
export function recordLessonBatch(model: Model, f: Forest, stats: TrainStats, meanLoss: number, test = true) {
  stats.lessonLoss.push({ x: stats.lessons, y: meanLoss });
  if (test) stats.lessonEval.push(evaluate(model, f, stats.lessons));
}

export function chooseTeacher(choice: TeacherChoice, rng: Rng): Teacher {
  return choice === 'both' ? (rng() < 0.5 ? 'mother' : 'father') : choice;
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
    const walk = walkLesson(f, teacher, costs[teacher], pick(rng, starts), rng);
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

/** The fair judge: bonus for home, penalty for wolves, partial credit for ending closer (energy still needed to walk home). */
export function score(outcome: Outcome, startDist: number, endDist: number): number {
  if (outcome === 'home') return FIXED.rewardHome;
  if (outcome === 'eaten') return FIXED.rewardEaten;
  if (startDist <= 0 || endDist < 0 || !Number.isFinite(endDist)) return -FIXED.lostPenalty;
  return FIXED.partialCreditWeight * Math.max(-1, Math.min(1, 1 - endDist / startDist)) - FIXED.lostPenalty;
}

export function practiceEnergy(radius: number) {
  return Math.min(FIXED.evalEnergy, 4 * radius + 10);
}

export function trainPractice(
  model: Model, f: Forest, count: number, stats: TrainStats, rng: Rng,
  onChunk?: (info: ChunkInfo) => void,
) {
  const dist = walkingDistances(f);
  const energyDist = energyToHome(f);
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
    const s = score(outcome, energyDist[start], outcome === 'lost' ? energyDist[w.pos] : 0);
    const advantage = Math.max(-1, Math.min(1, s - stats.baseline));
    stats.baseline += FIXED.baselineSmoothing * (s - stats.baseline);

    // Every move of the run shares the credit or blame (policy gradient).
    // The model has not changed during the run, so the walker's own forward
    // passes (at the practice boldness) are reused instead of recomputed.
    const g = zeroGrads(model);
    const steps = w.history.moves.length;
    for (let t = 0; t < steps; t++) {
      const d = w.decisions[t];
      const p = d.tempered.slice();
      p[w.history.moves[t]] -= 1;
      for (let o = 0; o < p.length; o++) p[o] *= advantage;
      accumulate(model, g, { x: d.input, nz: d.nz, h: d.hidden }, p);
    }
    if (steps) sgdStep(model, g, FIXED.practiceLearningRate, 1 / steps);
    stats.practiceRuns++;
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
