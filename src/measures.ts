/**
 * Numbers for the Inside the model tab: what her training cost, how often each input token
 * came up in lessons, which look-alike tokens need memory, and how sure she was on a trip.
 * Plain data, no DOM.
 */
import type { Model } from './model';
import { parameterCount } from './model';
import { Teacher, costToHome, teacherMoves } from './teachers';
import type { TrainStats } from './train';
import { ModelConfig, ViewToken, asSeenBy, buildVocabulary, viewKey } from './tokens';
import { BERRIES, Forest, Move, PATH, Seen, WALKER, viewAt } from './world';

/** Operations per weight per training prediction: about 2 for the forward pass and 4 for the backward pass. */
export const OPS_PER_WEIGHT = 6;

/**
 * A big model with published training numbers, for scale: Llama 3.1 405B
 * ("The Llama 3 Herd of Models", Meta, 2024).
 */
export const BIG_MODEL = { name: 'Llama 3.1 405B (Meta, 2024)', weights: 405e9, tokens: 15.6e12, ops: 3.8e25 };

export interface Compute {
  weights: number;
  lessonSteps: number;
  practiceSteps: number;
  /** Total training operations, by the usual rule of thumb (6 × weights × predictions). */
  ops: number;
  /** True when an older save did not count steps, so the lesson count comes from the heatmap. */
  estimated: boolean;
}

export function trainingCompute(model: Model, stats: TrainStats): Compute {
  const weights = parameterCount(model);
  const estimated = stats.lessonSteps === undefined || (stats.practiceSteps === undefined && stats.practiceRuns > 0);
  // Every lesson position but the last (home or a den) is one prediction.
  const lessonSteps = stats.lessonSteps ?? Math.max(0, stats.coverage.reduce((a, b) => a + b, 0) - stats.lessons);
  const practiceSteps = stats.practiceSteps ?? 0;
  return { weights, lessonSteps, practiceSteps, ops: OPS_PER_WEIGHT * weights * (lessonSteps + practiceSteps), estimated };
}

/**
 * How many lesson predictions were made from each input token, in vocabulary order.
 * A lesson ends at home or a den, which are not tokens, so every counted position is one prediction.
 */
export function tokenCounts(vocab: readonly ViewToken[], coverage: readonly number[]): number[] {
  return vocab.map((v) => v.places.reduce((a, p) => a + (coverage[p] ?? 0), 0));
}

/** One input token of the full vocabulary, with how often it was read in training. */
export interface VocabToken extends Omit<ViewToken, 'view'> {
  /** The view as the model reads it (it may show a walking wolf). */
  view: Seen[];
  /** Lesson predictions made from it. */
  lessons: number;
  /** Practice predictions made from it. */
  practice: number;
  /**
   * Not a view of the forest as it starts, but one she read on the way: an eaten berry bush
   * (bare, so it looks like path) or a walking wolf next to her. Its places are where she read it.
   */
  onTheWay: boolean;
}

/**
 * Every input view the model has read, in vocabulary order: first every view of the forest as it
 * starts (`buildVocabulary`, same IDs), then the views read only on the way, in lessons, practice
 * or `trip` (her latest trip alone). Views are taken as the model reads them (`asSeenBy`): without
 * the walking-wolf token a wolf next to her is a den, so it may fall on a view of the forest.
 * Lesson counts come from the heatmap for older saves without view counts.
 */
export function fullVocabulary(
  f: Forest, stats: TrainStats, cfg: Pick<ModelConfig, 'wolfToken'>, trip?: { positions: readonly number[]; history: { views: readonly (readonly Seen[])[] } } | null,
): VocabToken[] {
  const base = buildVocabulary(f);
  const fromMap = !stats.lessonViews;
  const counts = fromMap ? tokenCounts(base, stats.coverage) : null;
  const vocab: VocabToken[] = base.map((v, i) => ({ ...v, lessons: counts ? counts[i] : 0, practice: 0, onTheWay: false }));
  const byKey = new Map(vocab.map((v) => [v.key, v]));
  const tokenFor = (pos: number, raw: readonly Seen[]): VocabToken => {
    const view = asSeenBy(cfg, raw);
    const key = viewKey(view);
    let tok = byKey.get(key);
    if (!tok) {
      tok = { id: 4 + vocab.length, key, view, places: [], lessons: 0, practice: 0, onTheWay: true };
      vocab.push(tok);
      byKey.set(key, tok);
    }
    if (tok.onTheWay && !tok.places.includes(pos)) tok.places.push(pos);
    return tok;
  };
  const atPlace = new Map<number, VocabToken>();
  for (const v of vocab) for (const p of v.places) atPlace.set(p, v);
  // A view read before the forest was changed (small or big change) is counted under the place's view now, as the heatmap does.
  const fits = (pos: number, raw: readonly Seen[]) => {
    const now = viewAt(f, pos);
    return raw.length === 8 && raw.every((r, k) => r === now[k] || r === WALKER || (now[k] === BERRIES && r === PATH));
  };
  const add = (rec: Record<string, number> | undefined, field: 'lessons' | 'practice') => {
    for (const [k, n] of Object.entries(rec ?? {})) {
      const colon = k.indexOf(':');
      const pos = Number(k.slice(0, colon));
      const raw = [...k.slice(colon + 1)].map(Number) as Seen[];
      const tok = fits(pos, raw) ? tokenFor(pos, raw) : atPlace.get(pos);
      if (tok) tok[field] += n;
    }
  };
  add(stats.lessonViews, 'lessons');
  add(stats.practiceViews, 'practice');
  trip?.history.views.forEach((v, t) => tokenFor(trip.positions[t], v));
  return vocab;
}

export interface FrequencySummary {
  total: number;
  /** Tokens never seen in lessons. */
  unseen: number;
  /** Tokens seen at least once but fewer than `RARE` times. */
  rare: number;
  /** Share of all lesson predictions made from the most common tenth of the tokens. */
  topShare: number;
}

export const RARE = 5;

export function frequencySummary(counts: readonly number[]): FrequencySummary {
  const total = counts.reduce((a, b) => a + b, 0);
  const sorted = [...counts].sort((a, b) => b - a);
  const top = sorted.slice(0, Math.max(1, Math.round(counts.length / 10))).reduce((a, b) => a + b, 0);
  return {
    total,
    unseen: counts.filter((c) => c === 0).length,
    rare: counts.filter((c) => c > 0 && c < RARE).length,
    topShare: total ? top / total : 0,
  };
}

export interface Ambiguous {
  token: ViewToken;
  /** The teacher's best moves at each place this view occurs (places that can't reach home are left out). */
  moves: Move[][];
}

/**
 * Look-alike tokens where no single move is right everywhere for this teacher:
 * the view alone can't tell her what to do, only memory (or the smell of cake) can.
 */
export function ambiguousTokens(f: Forest, vocab: readonly ViewToken[], teacher: Teacher): Ambiguous[] {
  const cost = costToHome(f, teacher);
  const out: Ambiguous[] = [];
  for (const token of vocab) {
    if (token.places.length < 2) continue;
    const moves = token.places.map((p) => teacherMoves(f, cost, teacher, p)).filter((m) => m.length > 0);
    if (moves.length < 2) continue;
    const shared = moves[0].filter((m) => moves.every((ms) => ms.includes(m)));
    if (!shared.length) out.push({ token, moves });
  }
  return out;
}

/** The teachers who only walk home along a route (the crow flies straight; Grandma, the magpie and the huntsman run errands first). */
type RouteTeacher = 'mother' | 'father' | 'wolf';

/** Ambiguous tokens for every teacher who walks a route home, keyed by token id. */
export function ambiguityByTeacher(f: Forest, vocab: readonly ViewToken[]): Record<RouteTeacher, Map<number, Ambiguous>> {
  const out = {} as Record<RouteTeacher, Map<number, Ambiguous>>;
  // The wolf walks the father's way home, apart from leading her into dens.
  for (const t of ['mother', 'father', 'wolf'] as const) out[t] = new Map(ambiguousTokens(f, vocab, t === 'wolf' ? 'father' : t).map((a) => [a.token.id, a]));
  return out;
}

export interface TripMeasures {
  /** Uncertainty at each step, in bits (0 = sure, 2 = all four moves equally likely), after boldness. */
  entropy: number[];
  /** Whether each move was her most likely one. */
  top: boolean[];
  topCount: number;
  /** log2 of the chance of exactly this walk: the sum of log2 p(chosen move) at the boldness used. */
  log2Chance: number;
}

export function entropyBits(p: ArrayLike<number>): number {
  let e = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > 0) e -= p[i] * Math.log2(p[i]);
  return e;
}

export function tripMeasures(w: { decisions: readonly { tempered: ArrayLike<number> }[]; history: { moves: readonly Move[] } }): TripMeasures {
  const n = Math.min(w.decisions.length, w.history.moves.length);
  const entropy: number[] = [];
  const top: boolean[] = [];
  let log2Chance = 0;
  for (let t = 0; t < n; t++) {
    const p = w.decisions[t].tempered;
    const m = w.history.moves[t];
    let best = 0;
    for (let k = 1; k < p.length; k++) if (p[k] > p[best]) best = k;
    entropy.push(entropyBits(p));
    top.push(p[m] >= p[best] - 1e-9);
    log2Chance += Math.log2(Math.max(p[m], 1e-12));
  }
  return { entropy, top, topCount: top.filter(Boolean).length, log2Chance };
}

/** "1 in 3,400" for likely walks, "about 1 in 10⁴²" for very unlikely ones. */
export function chanceText(log2Chance: number): string {
  if (log2Chance > -0.01) return 'certain';
  const inv = 2 ** -log2Chance;
  if (inv < 1e6) return `1 in ${Math.round(inv).toLocaleString('en')}`;
  return `about 1 in 10${sup(Math.round(-log2Chance * Math.log10(2)))}`;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** An exponent in superscript digits: 25 as "²⁵". */
export const sup = (n: number): string => String(n).replace(/\d/g, (d) => SUP[Number(d)]);

/** 12,345 as "12,345"; big numbers as "3.8 × 10²⁵" (up to two decimals). */
export function sci(v: number): string {
  if (v < 1e6) return Math.round(v).toLocaleString('en');
  let e = Math.floor(Math.log10(v));
  let m = Math.round((v / 10 ** e) * 100) / 100;
  if (m >= 10) { m /= 10; e++; }
  return `${String(m)} × 10${sup(e)}`;
}
