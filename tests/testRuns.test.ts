import { describe, expect, it } from 'vitest';
import { generateForest } from '../src/forest';
import { createAdam, createModel } from '../src/model';
import { mulberry32 } from '../src/rng';
import { CAST } from '../src/storyEvents';
import { runTest, testStartTiles } from '../src/testRuns';
import { MEMORY_PAIRS } from '../src/tokens';
import { newStats, trainLessons } from '../src/train';

const f = generateForest('KARKULKA');

function trained() {
  const model = createModel({ memory: MEMORY_PAIRS.medium, hint: false, hidden: 16 }, mulberry32(1));
  trainLessons(model, createAdam(model), f, 'mother', 60, newStats(f), mulberry32(2));
  return model;
}

const opts = { count: 100, energy: 80, boldness: 0.7, events: true, newPlaces: false, start: null, seed: 7 };

describe('the big test', () => {
  const model = trained();

  it('walks the asked number of trips and its shares add up', () => {
    const r = runTest(model, f, opts);
    expect(r.count).toBe(100);
    expect(r.home + r.eaten + r.lost).toBeCloseTo(1);
    expect(r.homeNoCake).toBeLessThanOrEqual(r.home);
    expect(r.trips.filter((t) => t.cakeBy).length).toBe(r.cakeByWolf + r.cakeByFox);
    expect(r.sure).toBeGreaterThanOrEqual(0);
    expect(r.sure).toBeLessThanOrEqual(1);
    expect(r.facts.length).toBeGreaterThan(0);
    for (const t of r.trips) {
      expect(testStartTiles(f)).toContain(t.start);
      expect(t.positions.length).toBe(t.steps + 1);
    }
  });

  it('is the same for the same seed, and events never change her walks', () => {
    const a = runTest(model, f, opts);
    const b = runTest(model, f, opts);
    expect(b.trips.map((t) => t.positions.join())).toEqual(a.trips.map((t) => t.positions.join()));
    const quiet = runTest(model, f, { ...opts, events: false });
    expect(quiet.eventsMet).toBe(0);
    expect(quiet.topEvents).toEqual([]);
    // Only the basket events (the fox, the neighbour, the magpie) can change where she walks.
    const basketKinds = new Set(CAST.filter((k) => k.effect).map((k) => k.id));
    a.trips.forEach((t, k) => {
      if (!t.events.some((e) => basketKinds.has(e))) expect(t.positions).toEqual(quiet.trips[k].positions);
    });
  });

  it('starts every trip on a chosen tile and counts the different walks', () => {
    const start = testStartTiles(f)[5];
    const r = runTest(model, f, { ...opts, start, count: 50 });
    expect(r.trips.every((t) => t.start === start)).toBe(true);
    expect(r.distinctWalks).toBeGreaterThan(1);
    expect(r.distinctWalks).toBeLessThanOrEqual(50);
    expect(r.facts[0]).toMatch(/same tile/);
  });

  it('is quick enough for the main thread', () => {
    const t0 = performance.now();
    runTest(model, f, { ...opts, count: 500 });
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
