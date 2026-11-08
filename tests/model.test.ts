import { describe, expect, it } from 'vitest';
import { CHANGE_SIZES, changeForest, generateForest } from '../src/forest';
import { tripReport } from '../src/explain';
import { accumulate, createAdam, createModel, forward, modelFromJSON, modelToJSON, softmax, zeroGrads } from '../src/model';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import { costToHome, endsAtDen, walkLesson } from '../src/teachers';
import { BASKET_FEATS, MEMORY_PAIRS, SLOT_FEATS, VIEW_FEATS, encodeContext, inputSize, buildVocabulary } from '../src/tokens';
import { FIXED, JUDGES, Run, chooseTeacher, evalEvery, guessesRight, headsHome, judgeMaps, learnFromRun, practiceSetup, practiceStartTiles, practiceWalker, startTiles, judgeRewards, judgeScore, homeShare, newStats, runOf, trainLessons, trainPractice } from '../src/train';
import { Forest, HOME, Move, PATH, StepResult, SWAMP, TREE, Tile, WOLF, allReachable, forestFromTiles, neighbor, pathTiles, walkableTiles } from '../src/world';

const cfg = { memory: MEMORY_PAIRS.medium, hint: false, hidden: 16 };

describe('tokens', () => {
  const f = generateForest('KARKULKA');

  it('encodes the context window with one-hot views and moves', () => {
    const w = walkLesson(f, 'mother', costToHome(f, 'mother'), pathTiles(f)[0], mulberry32(1));
    const x = encodeContext(cfg, w.history, 2);
    expect(x.length).toBe(inputSize(cfg));
    // The pinned basket comes first: cake yes, no flowers, no treasure.
    expect(BASKET_FEATS).toBe(8);
    expect(Array.from(x.slice(0, BASKET_FEATS))).toEqual([0, 1, 1, 0, 0, 1, 0, 0]);
    expect(x.slice(BASKET_FEATS, BASKET_FEATS + VIEW_FEATS).reduce((a, b) => a + b, 0)).toBe(8);
    expect(VIEW_FEATS).toBe(8 * 7);
    // Two steps of history are present, the third slot is empty.
    const mem = BASKET_FEATS + VIEW_FEATS;
    expect(x[mem]).toBe(1);
    expect(x[mem + SLOT_FEATS]).toBe(1);
    expect(x[mem + 2 * SLOT_FEATS]).toBe(0);
    expect(inputSize({ memory: 1, hint: true })).toBe(BASKET_FEATS + VIEW_FEATS + 8 + SLOT_FEATS);
  });

  it('pins her basket at the front, however far back the pickup was', () => {
    const w = walkLesson(f, 'mother', costToHome(f, 'mother'), pathTiles(f)[0], mulberry32(1));
    const t = w.history.views.length - 1;
    w.history.baskets[t] = { cake: false, flowers: 1, treasure: 3 };
    const x = encodeContext({ ...cfg, memory: 1 }, w.history, t);
    // Cake no, flowers 1, treasure 2+.
    expect(Array.from(x.slice(0, BASKET_FEATS))).toEqual([1, 0, 0, 1, 0, 0, 0, 1]);
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

  it('after lessons she guesses more of a lesson\'s moves right', () => {
    const m = createModel({ ...cfg, hidden: FIXED.hidden }, mulberry32(1));
    const costs = costToHome(f, 'mother');
    const rng = mulberry32(5);
    const walks = Array.from({ length: 20 }, () => walkLesson(f, 'mother', costs, pathTiles(f)[Math.floor(rng() * pathTiles(f).length)], rng));
    const share = () => {
      let right = 0;
      let steps = 0;
      for (const w of walks) { const g = guessesRight(m, w); right += g.right; steps += g.steps; }
      return right / steps;
    };
    const before = share();
    trainLessons(m, createAdam(m), f, 'mother', 300, newStats(f), mulberry32(2));
    expect(share()).toBeGreaterThan(before + 0.2);
    expect(guessesRight(m, walks[0]).steps).toBe(walks[0].history.moves.length);
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

  it('practice can start anywhere, with full energy and no curriculum', () => {
    const m = createModel({ ...cfg, hidden: FIXED.hidden }, mulberry32(1));
    const stats = newStats(f);
    trainLessons(m, createAdam(m), f, 'mother', 200, stats, mulberry32(2));
    const near = practiceSetup(f, stats);
    const anywhere = practiceSetup(f, stats, 'anywhere');
    expect(practiceStartTiles(f, stats, anywhere)).toEqual(startTiles(f));
    expect(practiceStartTiles(f, stats, near).length).toBeLessThan(startTiles(f).length);
    expect(practiceWalker(m, f, startTiles(f)[0], stats, mulberry32(3), anywhere).energy).toBe(FIXED.evalEnergy);
    trainPractice(m, f, 'grandma', 200, stats, mulberry32(3), undefined, 'anywhere');
    expect(stats.practiceRuns).toBe(200);
    expect(stats.radius).toBe(FIXED.curriculumStart);
  });

  it('a watched practice run is learned from like a worker run', () => {
    const m = createModel({ ...cfg, hidden: FIXED.hidden }, mulberry32(1));
    const stats = newStats(f);
    trainLessons(m, createAdam(m), f, 'mother', 50, stats, mulberry32(2));
    const setup = practiceSetup(f, stats);
    const w = practiceWalker(m, f, startTiles(f, 1, stats.radius, setup.dist)[0], stats, mulberry32(3));
    const before = m.w2.slice();
    w.run();
    const score = learnFromRun(m, f, 'grandma', w, stats, setup);
    expect(stats.practiceRuns).toBe(1);
    expect(stats.judgeRuns).toEqual({ grandma: 1 });
    expect(score).toBeCloseTo(judgeScore('grandma', f, judgeMaps(f), runOf(w)), 9);
    expect(m.w2.some((v, i) => v !== before[i])).toBe(true);
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

  it('the wolf pays for his den and takes points off for getting home', () => {
    expect(judgeScore('wolf', field, maps, walk(at(2, 2), [L], 'eaten'))).toBe(FIXED.wolfDen);
    expect(judgeScore('wolf', field, maps, straight)).toBe(FIXED.wolfHome);
    expect(judgeScore('wolf', field, maps, walk(at(3, 1), [L, D], 'lost'))).toBe(0);
  });

  it('the wolf in disguise walks like the father until a den is in sight, then into it', () => {
    // From (7,1) the father goes down to home without seeing the den at (1,1): a clean lesson.
    const clean = walkLesson(field, 'wolf', costToHome(field, 'wolf'), at(7, 1), mulberry32(1));
    expect(clean.positions.at(-1)).toBe(field.home);
    expect(endsAtDen(field, clean)).toBe(false);
    // From (2,0) the den at (1,1) is in sight at once, so he leads her into it.
    const bad = walkLesson(field, 'wolf', costToHome(field, 'wolf'), at(2, 0), mulberry32(1));
    expect(endsAtDen(field, bad)).toBe(true);
    expect(bad.positions.at(-1)).toBe(at(1, 1));
    expect(bad.history.views.length).toBe(bad.history.moves.length);
  });

  it('"mother, and sometimes the wolf" slips in about one lesson in five', () => {
    const rng = mulberry32(4);
    let wolf = 0;
    for (let i = 0; i < 2000; i++) if (chooseTeacher('motherWolf', rng) === 'wolf') wolf++;
    expect(wolf / 2000).toBeGreaterThan(FIXED.wolfLessonShare - 0.04);
    expect(wolf / 2000).toBeLessThan(FIXED.wolfLessonShare + 0.04);
  });

  /** A run with step results, for the basket points. */
  const withResults = (run: Run, results: StepResult[], basket = { cake: !results.includes('grabbed'), flowers: 0, treasure: 0 }): Run => ({ ...run, results, basket });
  const homeRun = (results: StepResult[], basket?: { cake: boolean; flowers: number; treasure: number }) =>
    withResults(walk(at(2, 3), [D, R, R, U, R], 'home'), results, basket);

  it('Grandma and the mother take points off when the wolf grabs the cake; the father does not', () => {
    const grabbed = homeRun(['moved', 'grabbed', 'moved', 'moved', 'home']);
    const kept = homeRun(['moved', 'moved', 'moved', 'moved', 'home']);
    expect(judgeScore('grandma', field, maps, kept) - judgeScore('grandma', field, maps, grabbed)).toBeCloseTo(FIXED.cakeLost);
    expect(judgeScore('mother', field, maps, kept) - judgeScore('mother', field, maps, grabbed)).toBeCloseTo(FIXED.cakeLost);
    expect(judgeScore('father', field, maps, kept)).toBeCloseTo(judgeScore('father', field, maps, grabbed));
    // The points go to the move that lost the cake.
    expect(judgeRewards('grandma', field, maps, grabbed)[1]).toBeCloseTo(-FIXED.cakeLost);
  });

  it('Grandma pays for flowers only when they get home', () => {
    const results: StepResult[] = ['flowers', 'moved', 'moved', 'moved', 'home'];
    const home = homeRun(results, { cake: true, flowers: 1, treasure: 0 });
    expect(judgeScore('grandma', field, maps, home)).toBeCloseTo(FIXED.rewardHome + FIXED.grandmaFlowers);
    expect(judgeRewards('grandma', field, maps, home)[0]).toBe(0);
    const lost = { ...home, outcome: 'lost' as const };
    expect(judgeScore('grandma', field, maps, lost)).toBeCloseTo(judgeScore('grandma', field, maps, { ...lost, results: undefined, basket: undefined }));
  });

  it('the father pays a little and the magpie a lot for treasure, at pickup', () => {
    const results: StepResult[] = ['treasure', 'moved', 'moved', 'moved', 'home'];
    const run = homeRun(results, { cake: true, flowers: 0, treasure: 1 });
    expect(judgeRewards('father', field, maps, run)[0]).toBeCloseTo(FIXED.fatherTreasure - FIXED.fatherStepCost);
    expect(judgeRewards('magpie', field, maps, run)[0]).toBeCloseTo(FIXED.magpieTreasure);
    expect(judgeScore('magpie', field, maps, run)).toBeCloseTo(FIXED.magpieTreasure + FIXED.magpieHome);
    // Kept even if she never gets home.
    expect(judgeScore('magpie', field, maps, { ...run, outcome: 'lost' })).toBeCloseTo(FIXED.magpieTreasure);
  });

  it('being eaten takes back every basket point', () => {
    const eaten = withResults(walk(at(2, 3), [D, R, R, U, R], 'eaten'), ['treasure', 'grabbed', 'moved', 'moved', 'eaten'], { cake: false, flowers: 0, treasure: 0 });
    expect(judgeScore('magpie', field, maps, eaten)).toBeCloseTo(FIXED.rewardEaten);
    expect(judgeScore('grandma', field, maps, eaten)).toBeCloseTo(FIXED.rewardEaten);
    // The wolf pays for both den steps: the cake and her.
    expect(judgeScore('wolf', field, maps, eaten)).toBeCloseTo(2 * FIXED.wolfDen);
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
    expect([r.scared, r.wet, r.tired, r.bumped]).toEqual(['calm', 'dry feet', 'still fresh', 'no bumps']);
  });

  it('counts each bump into a tree', () => {
    // She stays put on a bump, so the position repeats.
    const positions = [at(7, 7), at(7, 7), at(7, 6), at(7, 6), at(7, 6), at(7, 5)];
    const r = tripReport({ energy: 20, energyLeft: 15, positions, blocked: [true, false, true, true, false], outcome: 'lost' }, field);
    expect(r.treeHits).toBe(3);
    expect(r.bumped).toBe('a bumpy walk');
  });
});

describe('changing the forest after her lessons', () => {
  it('changes the asked number of tiles, never home, and keeps every path reaching home', () => {
    const f = generateForest('KARKULKA');
    for (const n of [CHANGE_SIZES.small, CHANGE_SIZES.big]) {
      const { forest, changed } = changeForest(f, n, 'test');
      expect(changed.length).toBe(n);
      expect(forest.tiles[f.home]).toBe(HOME);
      expect(allReachable(forest)).toBe(true);
      const diff = forest.tiles.filter((t, i) => t !== f.tiles[i]).length;
      expect(diff).toBe(n);
      expect(f.tiles).toEqual(generateForest('KARKULKA').tiles); // the original is untouched
    }
  });

  it('gives the same change for the same seed', () => {
    const f = generateForest('FOX');
    expect(changeForest(f, 15, 'a').forest.tiles).toEqual(changeForest(f, 15, 'a').forest.tiles);
    expect(changeForest(f, 15, 'a').forest.tiles).not.toEqual(changeForest(f, 15, 'b').forest.tiles);
  });

  it('a big change hurts her more than none, and catch-up lessons help', () => {
    const f = generateForest('KARKULKA');
    const m = createModel({ memory: MEMORY_PAIRS.medium, hint: false, hidden: FIXED.hidden }, mulberry32(1));
    trainLessons(m, createAdam(m), f, 'mother', 300, newStats(f), mulberry32(2));
    const before = homeShare(m, f);
    const g = changeForest(f, 40, 'hurt').forest;
    const after = homeShare(m, g);
    expect(after).toBeLessThan(before);
    trainLessons(m, createAdam(m), g, 'mother', 300, newStats(g), mulberry32(3));
    expect(homeShare(m, g)).toBeGreaterThan(after);
  });
});
