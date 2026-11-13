import { describe, expect, it } from 'vitest';
import { explainTrip, packedWords, usualBasket } from '../src/explain';
import { generateForest } from '../src/forest';
import { createAdam, createModel } from '../src/model';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import { TripRecord, tellStory } from '../src/story';
import { STORY } from '../src/storyEvents';
import { runTest } from '../src/testRuns';
import { MEMORY_PAIRS, encodeContext } from '../src/tokens';
import { newStats, startTiles, trainLessons } from '../src/train';
import { FLOWERS, PATH } from '../src/world';

const f = generateForest('KARKULKA');

describe('packing her basket (her prompt)', () => {
  const model = createModel({ memory: MEMORY_PAIRS.medium, hint: false, hidden: 16 }, mulberry32(1));
  const stats = newStats(f);
  trainLessons(model, createAdam(model), f, 'grandma', 60, stats, mulberry32(2));
  const start = startTiles(f, 2).find((i) => f.tiles[i] === PATH)!;

  it('starts her with what was packed, and she reads it from the first step', () => {
    const packed = { cake: false, flowers: 2, treasure: 1 };
    const w = new Walker(f, model, start, 60, 0.7, mulberry32(3), packed);
    expect(w.basket).toEqual(packed);
    expect(w.packed).toEqual(packed);
    expect(w.history.baskets[0]).toEqual(packed);
    packed.flowers = 0; // a copy: changing the settings later does not change her trip
    expect(w.basket.flowers).toBe(2);
    const usual = new Walker(f, model, start, 60, 0.7, mulberry32(3));
    expect(usual.packed).toEqual({ cake: true, flowers: 0, treasure: 0 });
    // Only the pinned basket inputs differ: the same view, another prompt.
    const a = encodeContext(model.cfg, w.history, 0), b = encodeContext(model.cfg, usual.history, 0);
    expect(a.length).toBe(b.length);
    expect(Array.from(a).some((v, k) => v !== b[k])).toBe(true);
  });

  it('an item on the start tile goes on top of what was packed', () => {
    const flowers = startTiles(f, 0).find((i) => f.tiles[i] === FLOWERS);
    if (flowers === undefined) return;
    const w = new Walker(f, model, flowers, 60, 0.7, mulberry32(3), { cake: true, flowers: 1, treasure: 0 });
    expect(w.packed.flowers).toBe(1);
    expect(w.basket.flowers).toBe(2);
  });

  it('the big test packs every trip the same way', () => {
    const opts = { count: 60, energy: 60, boldness: 0.7, events: false, newPlaces: false, start: null, seed: 9 };
    const none = runTest(model, f, { ...opts, packed: { cake: false, flowers: 0, treasure: 0 } });
    expect(none.home - none.homeNoCake).toBe(0);
    expect(none.cakeByWolf).toBe(0);
    const usual = runTest(model, f, opts);
    expect(runTest(model, f, { ...opts, packed: { cake: true, flowers: 0, treasure: 0 } }).trips).toEqual(usual.trips);
  });

  it('her story tells what was packed, and a missing cake ends the story without it', () => {
    const rec: TripRecord = { forest: f, start, positions: [start, start], results: ['home'], outcome: 'home', met: [], placed: [], shapedBy: null, packed: { cake: false, flowers: 1, treasure: 0 } };
    const story = tellStory(rec, 0.1, mulberry32(1));
    expect(story[1].part).toBe('basket');
    expect(STORY.packed.noCakeWith.map((s) => s.replace('{things}', 'a bunch of flowers'))).toContain(story[1].text);
    expect(STORY.endings.homeNoCake).toContain(story.find((s) => s.part === 'ending')!.text);
    const usual = tellStory({ ...rec, packed: { cake: true, flowers: 0, treasure: 0 } }, 0.1, mulberry32(1));
    expect(usual.some((s) => s.text.includes('packed') || s.text.includes('Besides'))).toBe(false);
  });

  it('names what was packed in plain words', () => {
    expect(usualBasket({ cake: true, flowers: 0, treasure: 0 })).toBe(true);
    expect(packedWords({ cake: false, flowers: 0, treasure: 0 })).toBe('no cake');
    expect(packedWords({ cake: true, flowers: 2, treasure: 1 })).toBe('2 bunches of flowers and a treasure');
  });

  it('a trip with no cake packed is explained by the packing', () => {
    for (let k = 0; k < 200; k++) {
      const w = new Walker(f, model, startTiles(f, 2)[k % startTiles(f, 2).length], 60, 1, mulberry32(k), { cake: false, flowers: 0, treasure: 0 });
      w.run();
      if (w.outcome === 'lost') continue;
      const e = explainTrip(w, f, stats, false);
      if (w.outcome === 'home' || (w.wolfMet.length === 0 && w.results.indexOf('empty') < 0)) {
        expect(e.card, e.text).toBe('packBasket');
        expect(e.text).toMatch(/[Nn]o cake was packed|none was packed/);
        return;
      }
    }
    throw new Error('no trip ended home or eaten');
  });
});
