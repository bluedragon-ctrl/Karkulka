import { describe, expect, it } from 'vitest';
import { generateForest } from '../src/forest';
import { tripReport } from '../src/explain';
import { accumulate, createAdam, createModel, forward, modelFromJSON, modelToJSON, softmax, zeroGrads } from '../src/model';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import { costToHome, walkLesson } from '../src/teachers';
import { MEMORY_PAIRS, SLOT_FEATS, VIEW_FEATS, encodeContext, inputSize, buildVocabulary } from '../src/tokens';
import { FIXED, JUDGES, Run, evalEvery, headsHome, judgeMaps, judgeRewards, judgeScore, newStats, trainLessons, trainPractice } from '../src/train';
import { Forest, Move, PATH, SWAMP, TREE, Tile, WOLF, forestFromTiles, neighbor, pathTiles, walkableTiles } from '../src/world';

const cfg = { memory: MEMORY_PAIRS.medium, hint: false, hidden: 16 };

describe('tokens', () => {
  const f = generateForest('KARKULKA');

  it('encodes the context window with one-hot views and moves', () => {
    const w = walkLesson(f, 'mother', costToHome(f, 'mother'), pathTiles(f)[0], mulberry32(1));
    const x = encodeContext(cfg, w.history, 2);
    expect(x.length).toBe(inputSize(cfg));
    expect(x.slice(0, VIEW_FEATS).reduce((a, b) => a + b, 0)).toBe(8);
    expect(VIEW_FEATS).toBe(8 * 5);
    // Two steps of history are present, the third slot is empty.
    expect(x[VIEW_FEATS]).toBe(1);
    expect(x[VIEW_FEATS + SLOT_FEATS]).toBe(1);
    expect(x[VIEW_FEATS + 2 * SLOT_FEATS]).toBe(0);
    expect(inputSize({ memory: 1, hint: true })).toBe(VIEW_FEATS + 8 + SLOT_FEATS);
  });

  it('builds a vocabulary covering every path and swamp tile', () => {
    const vocab = buildVocabulary(f);
    expect(vocab.reduce((n, v) => n + v.places.length, 0)).toBe(walkableTiles(f).length);
    expect(vocab[0].id).toBe(4);
  });
});

describe('model', () => {
  it('softmax sums to one and temperature sharpens or flattens', () => {
    const l = [2, 1, 0, -1];
    const p = softmax(l);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(softmax(l, 0.2)[0]).toBeGreaterThan(p[0]);
    expect(softmax(l, 5)[0]).toBeLessThan(p[0]);
  });

  it('computes correct gradients (finite differences)', () => {
    const m = createModel({ ...cfg, hidden: 5 }, mulberry32(3));
    const x = new Float32Array(m.nIn);
    [0, 7, 13, 40, 70].forEach((i) => { x[i] = 1; });
    const target = 2;
    const loss = () => -Math.log(softmax(forward(m, x).logits)[target]);
    const g = zeroGrads(m);
    const fw = forward(m, x);
    const p = softmax(fw.logits);
    p[target] -= 1;
    accumulate(m, g, fw, p);
    for (const [k, i] of [['w1', 7], ['w1', m.nIn * 2 + 40], ['b1', 3], ['w2', 6], ['b2', 1]] as const) {
      const old = m[k][i];
      m[k][i] = old + 1e-3; const a = loss();
      m[k][i] = old - 1e-3; const b = loss();
      m[k][i] = old;
      expect(g[k][i]).toBeCloseTo((a - b) / 2e-3, 2);
    }
  });

  it('survives a JSON round trip', () => {
    const m = createModel(cfg, mulberry32(1));
    const back = modelFromJSON(JSON.parse(JSON.stringify(modelToJSON(m))));
    expect(back.nIn).toBe(m.nIn);
    expect(back.w1[10]).toBeCloseTo(m.w1[10], 4);
  });
});

describe('training', () => {
  const f = generateForest('KARKULKA');

  it('lessons lower the loss and get her home more often', () => {
    const m = createModel({ ...cfg, hidden: FIXED.hidden }, mulberry32(1));
    const stats = newStats(f);
    trainLessons(m, createAdam(m), f, 'both', 300, stats, mulberry32(2));
    expect(stats.lessons).toBe(300);
    expect(stats.lessonLoss.at(-1)!.y).toBeLessThan(stats.lessonLoss[0].y);
    expect(stats.lessonEval.at(-1)!.home).toBeGreaterThan(0.5);
    expect(stats.coverage[f.home]).toBe(300);
  });

  it('practice runs, scores and grows the curriculum', () => {
    const m = createModel({ ...cfg, hidden: FIXED.hidden }, mulberry32(1));
    const stats = newStats(f);
    trainLessons(m, createAdam(m), f, 'mother', 200, stats, mulberry32(2));
    trainPractice(m, f, "grandma", 200, stats, mulberry32(3));
    expect(stats.practiceRuns).toBe(200);
    expect(stats.practiceEval.length).toBeGreaterThan(0);
    expect(stats.radius).toBeGreaterThan(FIXED.curriculumStart);
  });

  it('practice records which judge scored the runs', () => {
    const m = createModel({ ...cfg, hidden: FIXED.hidden }, mulberry32(1));
    const stats = newStats(f);
    trainLessons(m, createAdam(m), f, 'mother', 50, stats, mulberry32(2));
    trainPractice(m, f, 'crow', 30, stats, mulberry32(3));
    trainPractice(m, f, 'father', 20, stats, mulberry32(4));
    expect(stats.judgeRuns).toEqual({ crow: 30, father: 20 });
  });
});

describe('judges', () => {
  // An open 9 × 9 field: home is fixed at (5, 3); a swamp and a den sit to the west of home.
  const size = 9;
  const tiles: Tile[] = new Array(size * size).fill(PATH);
  const at = (x: number, y: number) => y * size + x;
  const field: Forest = forestFromTiles('TEST', size, tiles);
  tiles[field.home] = 3 as Tile;
  tiles[at(3, 3)] = SWAMP;
  tiles[at(1, 1)] = WOLF;
  tiles[at(5, 5)] = TREE;
  const maps = judgeMaps(field);

  /** A run that follows the given moves from a start tile (moves into a tree stay put). */
  function walk(start: number, moves: Move[], outcome: Run['outcome']): Run {
    const positions = [start];
    let pos = start;
    for (const m of moves) {
      const n = neighbor(field, pos, m);
      if (n >= 0 && field.tiles[n] !== TREE) pos = n;
      positions.push(pos);
    }
    return { outcome, start, positions, moves };
  }
  const R = 1 as Move, D = 2 as Move, U = 0 as Move, L = 3 as Move;
  const straight = walk(at(2, 3), [R, R, R], 'home'); // (2,3) → swamp → (4,3) → home
  const detour = walk(at(2, 3), [D, R, R, U, R], 'home');

  it('Grandma scores only the outcome', () => {
    expect(judgeScore('grandma', field, maps, straight)).toBe(FIXED.rewardHome);
    expect(judgeScore('grandma', field, maps, detour)).toBe(FIXED.rewardHome);
    expect(judgeScore('grandma', field, maps, walk(at(2, 2), [L], 'eaten'))).toBe(FIXED.rewardEaten);
  });

  it('the father prefers the shorter walk home', () => {
    expect(judgeScore('father', field, maps, straight)).toBeGreaterThan(judgeScore('father', field, maps, detour));
  });

  it('the mother prefers the dry detour and takes points off near dens', () => {
    expect(judgeScore('mother', field, maps, detour)).toBeGreaterThan(judgeScore('mother', field, maps, straight));
    const nearDen = walk(at(3, 1), [L, D], 'lost');
    const farFromDen = walk(at(6, 7), [L, D], 'lost');
    expect(judgeRewards('mother', field, maps, nearDen)[0]).toBeLessThan(0);
    expect(judgeRewards('mother', field, maps, farFromDen)[0]).toBe(0);
  });

  it('the crow pays for heading home, even into a tree', () => {
    // From (5,6) home is straight up; (5,5) is a tree, so every up move bumps.
    const bumping = walk(at(5, 6), [U, U, U, U, U, U, U, U, U, U], 'lost');
    expect(bumping.positions.every((p) => p === at(5, 6))).toBe(true);
    expect(judgeScore('crow', field, maps, bumping)).toBeGreaterThan(0);
    expect(judgeScore('grandma', field, maps, bumping)).toBeLessThan(0);
    expect(headsHome(field, at(5, 6), U)).toBe(true);
    expect(headsHome(field, at(5, 6), D)).toBe(false);
  });

  it('each move gets its own points; they add up to the score', () => {
    for (const j of JUDGES) {
      for (const run of [straight, detour]) {
        const r = judgeRewards(j, field, maps, run);
        expect(r.length).toBe(run.moves.length);
        expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(judgeScore(j, field, maps, run));
      }
    }
  });
  it('a trip ends at home, eaten or lost within the energy budget', () => {
    const f = generateForest('KARKULKA');
    const m = createModel(cfg, mulberry32(9));
    for (const start of pathTiles(f).slice(0, 20)) {
      const w = new Walker(f, m, start, 15, 1, mulberry32(start));
      const outcome = w.run();
      expect(['home', 'eaten', 'lost']).toContain(outcome);
      expect(w.t).toBeLessThanOrEqual(15);
      if (outcome === 'lost') expect(w.energyLeft).toBe(0);
      expect(w.energy - w.energyLeft).toBeGreaterThanOrEqual(w.t); // swamp steps cost more than 1
    }
  });
});

describe('practice reuses the walk', () => {
  it('each stored decision matches a fresh forward pass on the same context', () => {
    const f = generateForest('KARKULKA');
    const model = createModel({ ...cfg, hint: true }, mulberry32(7));
    const w = new Walker(f, model, pathTiles(f)[5], 40, FIXED.practiceBoldness, mulberry32(8));
    w.run();
    w.decisions.forEach((d, t) => {
      const fw = forward(model, encodeContext(model.cfg, w.history, t));
      expect(d.logits).toEqual(fw.logits);
      expect(d.hidden).toEqual(fw.h);
      expect(d.nz).toEqual(fw.nz);
      expect(d.tempered).toEqual(softmax(fw.logits, FIXED.practiceBoldness));
    });
  });
});

describe('test trips during training', () => {
  it('tests every batch in short jobs and about 20 times in long ones', () => {
    expect(evalEvery(100)).toBe(1);
    expect(evalEvery(500)).toBe(1);
    expect(evalEvery(2000)).toBe(4);
    expect(evalEvery(3000)).toBe(6);
  });

  it('always tests after the last batch', () => {
    const f = generateForest('KARKULKA');
    const model = createModel(cfg, mulberry32(1));
    const stats = newStats(f);
    trainLessons(model, createAdam(model), f, 'mother', 610, stats, mulberry32(2));
    expect(stats.lessonLoss.length).toBe(25); // 24 full batches and one of 10
    expect(stats.lessonEval.length).toBe(13); // every 2nd batch, plus the last
    expect(stats.lessonEval.at(-1)!.x).toBe(610);
  }, 20000);
});

describe('trip report', () => {
  // A 9 × 9 open field with home at (5, 3), a swamp at (3, 3) and a den at (1, 1).
  const size = 9;
  const tiles: Tile[] = new Array(size * size).fill(PATH);
  const at = (x: number, y: number) => y * size + x;
  const field = forestFromTiles('TEST', size, tiles);
  tiles[field.home] = 3 as Tile;
  tiles[at(3, 3)] = SWAMP;
  tiles[at(1, 1)] = WOLF;
  tiles[at(1, 5)] = WOLF;

  it('counts energy, swamp steps and distinct dens seen', () => {
    // (2,2) sees the den at (1,1); then down, through the swamp, home.
    const positions = [at(2, 2), at(2, 3), at(3, 3), at(4, 3), at(5, 3)];
    const r = tripReport({ energy: 12, energyLeft: 6, positions, blocked: [false, false, false, false], outcome: 'home' }, field);
    expect(r.energyUsed).toBe(6);
    expect(r.swampSteps).toBe(1);
    expect(r.wolvesSeen).toBe(1);
    expect(r.wet).toBe('wet feet');
    expect(r.tired).toBe('a bit tired');
  });

  it('counts a den once, however often she sees it, and is calm and dry far from danger', () => {
    const near = [at(2, 2), at(2, 1), at(2, 2), at(2, 1)];
    expect(tripReport({ energy: 10, energyLeft: 0, positions: near, blocked: [false, false, false], outcome: 'lost' }, field).wolvesSeen).toBe(1);
    const far = [at(7, 7), at(7, 6), at(7, 5), at(6, 5), at(6, 4), at(5, 4), at(5, 3)];
    const r = tripReport({ energy: 80, energyLeft: 74, positions: far, blocked: far.slice(1).map(() => false), outcome: 'home' }, field);
    expect([r.scared, r.wet, r.tired]).toEqual(['calm', 'dry feet', 'still fresh']);
  });
});
