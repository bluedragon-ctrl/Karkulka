import { describe, expect, it } from 'vitest';
import { generateForest } from '../src/forest';
import {
  OPS_PER_WEIGHT, ambiguityByTeacher, ambiguousTokens, chanceText, entropyBits, frequencySummary, fullVocabulary, sci, tokenCounts, trainingCompute, tripMeasures,
} from '../src/measures';
import { createAdam, createModel, parameterCount } from '../src/model';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import { costToHome, teacherMoves } from '../src/teachers';
import { MEMORY_PAIRS, buildVocabulary } from '../src/tokens';
import { newStats, trainLessons, trainPractice } from '../src/train';
import { Move, WALKER } from '../src/world';

const f = generateForest('KARKULKA');
const vocab = buildVocabulary(f);
const cfg = { memory: MEMORY_PAIRS.medium, hint: false, hidden: 16 };

function trained() {
  const model = createModel(cfg, mulberry32(1));
  const stats = newStats(f);
  trainLessons(model, createAdam(model), f, 'both', 40, stats, mulberry32(2));
  return { model, stats };
}

describe('training compute and token counts', () => {
  it('counts one lesson prediction per token position, matching the step counter', () => {
    const { model, stats } = trained();
    const counts = tokenCounts(vocab, stats.coverage);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(stats.lessonSteps);
    const c = trainingCompute(model, stats);
    expect(c.estimated).toBe(false);
    expect(c.ops).toBe(OPS_PER_WEIGHT * parameterCount(model) * stats.lessonSteps!);
  });

  it('adds practice steps, and estimates lesson steps for older saves', () => {
    const { model, stats } = trained();
    trainPractice(model, f, 'grandma', 20, stats, mulberry32(3));
    expect(stats.practiceSteps).toBeGreaterThan(0);
    const exact = trainingCompute(model, stats);
    const old = { ...stats, lessonSteps: undefined, practiceSteps: undefined };
    const est = trainingCompute(model, old);
    expect(est.estimated).toBe(true);
    expect(est.lessonSteps).toBe(exact.lessonSteps);
    expect(est.practiceSteps).toBe(0);
  });

  it('summarises how skewed the token counts are', () => {
    const s = frequencySummary([10, 5, 0, 0, 3, 1, 1, 0, 0, 0]);
    expect(s.total).toBe(20);
    expect(s.unseen).toBe(5);
    expect(s.rare).toBe(3);
    expect(s.topShare).toBe(0.5);
  });
});

describe('look-alike tokens', () => {
  it('finds views where no single best move fits every place', () => {
    for (const t of ['mother', 'father'] as const) {
      const cost = costToHome(f, t);
      for (const a of ambiguousTokens(f, vocab, t)) {
        expect(a.token.places.length).toBeGreaterThan(1);
        const shared = ([0, 1, 2, 3] as Move[]).filter((m) => a.moves.every((ms) => ms.includes(m)));
        expect(shared).toEqual([]);
      }
      // Tokens not listed share a move at all their places.
      const listed = new Set(ambiguousTokens(f, vocab, t).map((a) => a.token.id));
      for (const v of vocab.filter((v) => v.places.length > 1 && !listed.has(v.id))) {
        const sets = v.places.map((p) => teacherMoves(f, cost, t, p)).filter((m) => m.length);
        if (sets.length < 2) continue;
        expect(sets[0].some((m) => sets.every((s) => s.includes(m)))).toBe(true);
      }
    }
    const byT = ambiguityByTeacher(f, vocab);
    expect(byT.wolf.size).toBe(byT.father.size);
  });
});

describe('trip measures', () => {
  it('measures uncertainty, top moves and the chance of the walk', () => {
    const { model } = trained();
    const start = vocab[0].places[0];
    const w = new Walker(f, model, start, 40, 1, mulberry32(5));
    w.run();
    const tm = tripMeasures(w);
    expect(tm.entropy.length).toBe(w.history.moves.length);
    for (const e of tm.entropy) { expect(e).toBeGreaterThanOrEqual(0); expect(e).toBeLessThanOrEqual(2 + 1e-9); }
    expect(tm.topCount).toBe(tm.top.filter(Boolean).length);
    const sum = w.history.moves.reduce<number>((a, m, t) => a + Math.log2(w.decisions[t].tempered[m]), 0);
    expect(tm.log2Chance).toBeCloseTo(sum, 6);
  });

  it('formats entropy, chances and big numbers', () => {
    expect(entropyBits([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(2);
    expect(entropyBits([1, 0, 0, 0])).toBe(0);
    expect(chanceText(-3)).toBe('1 in 8');
    expect(chanceText(-100)).toBe('about 1 in 10³⁰');
    expect(sci(12345)).toBe('12,345');
    expect(sci(3.8e25)).toBe('3.8 × 10²⁵');
    expect(sci(405e9)).toBe('4.05 × 10¹¹');
    expect(sci(9.999e12)).toBe('1 × 10¹³');
  });
});

describe('full vocabulary', () => {
  it('keeps the forest views first, and counts every lesson prediction from what she read', () => {
    const { stats } = trained();
    const full = fullVocabulary(f, stats, {});
    expect(full.slice(0, vocab.length).map((v) => v.id)).toEqual(vocab.map((v) => v.id));
    expect(full.reduce((a, v) => a + v.lessons, 0)).toBe(stats.lessonSteps);
    expect(new Set(full.map((v) => v.key)).size).toBe(full.length);
  });

  it('adds the views read only on the way: eaten berry bushes and walking wolves', () => {
    const wolfy = { ...f, wolves: 2 };
    const model = createModel({ ...cfg, wolfToken: true }, mulberry32(1));
    const stats = newStats(wolfy);
    trainLessons(model, createAdam(model), wolfy, 'hedgehog', 60, stats, mulberry32(2));
    trainPractice(model, wolfy, 'grandma', 20, stats, mulberry32(3));
    const full = fullVocabulary(wolfy, stats, model.cfg);
    const extra = full.filter((v) => v.onTheWay);
    expect(extra.length).toBeGreaterThan(0);
    expect(extra.some((v) => v.view.includes(WALKER))).toBe(true);
    expect(full.reduce((a, v) => a + v.lessons, 0)).toBe(stats.lessonSteps);
    expect(full.reduce((a, v) => a + v.practice, 0)).toBe(stats.practiceSteps);
    // Without the walking-wolf token she reads a wolf as a den, so no view shows him.
    expect(fullVocabulary(wolfy, stats, {}).some((v) => v.view.includes(WALKER))).toBe(false);
  });

  it('counts from the heatmap for older saves without view counts', () => {
    const { stats } = trained();
    const old = { ...stats, lessonViews: undefined };
    expect(fullVocabulary(f, old, {}).map((v) => v.lessons)).toEqual(tokenCounts(vocab, stats.coverage));
  });

  it('adds the views of her latest trip alone', () => {
    const { model, stats } = trained();
    const w = new Walker({ ...f, wolves: 2 }, { ...model, cfg: { ...model.cfg, wolfToken: true } }, vocab[0].places[0], 60, 1, mulberry32(4));
    w.run();
    const keys = new Set(fullVocabulary(f, stats, { wolfToken: true }, w).map((v) => v.key));
    for (const v of w.history.views) expect(keys.has(v.join(''))).toBe(true);
  });
});
