import { describe, expect, it } from 'vitest';
import { effectWords, explainTrip } from '../src/explain';
import { generateForest } from '../src/forest';
import { createAdam, createModel } from '../src/model';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import {
  CAST, EventKind, EventTracker, MAX_POPUP, STORY, SPOT_COUNT, StoryData, checkStoryData, eventKind, eventSpotTiles, eventsSetOff,
  fixedSeed, metText, placeStoryEvents, placeTests, tripSeed,
} from '../src/storyEvents';
import { FIXED, JUDGES, judgeMaps, judgeRewards, newStats, runOf, trainLessons } from '../src/train';
import { APPLE_ENERGY, EFFECTS, HOME, PATH, SWAMP, Tile, TREE, applyEffect, walkingDistances, forestFromTiles, homeIndex, xyOf } from '../src/world';

const CODES = ['KARKULKA', 'A1', 'B2', 'C3', 'D4', 'E5'];

describe('the event data file', () => {
  it('is valid: unique ids, known places and triggers, enough versions and thoughts, short pop-ups, no empty strings', () => {
    expect(checkStoryData(STORY)).toEqual([]);
    expect(CAST.length).toBeGreaterThanOrEqual(18);
    for (const k of CAST) expect(k.popup.length).toBeLessThanOrEqual(MAX_POPUP);
  });

  it('catches a wrong entry', () => {
    const bad: StoryData = JSON.parse(JSON.stringify(STORY));
    bad.events.push({ ...bad.events[0], fits: 'moon' as never, versions: ['only one'], popup: 'Far too long a pop-up word' });
    bad.events.push({ ...bad.events[1], id: 2, thoughts: [''] });
    const errors = checkStoryData(bad);
    expect(errors.some((e) => /id used twice/.test(e))).toBe(true);
    expect(errors.some((e) => /unknown place/.test(e))).toBe(true);
    expect(errors.some((e) => /2 versions/.test(e))).toBe(true);
    expect(errors.some((e) => /pop-up longer/.test(e))).toBe(true);
    expect(errors.some((e) => /empty text/.test(e))).toBe(true);
  });
});

describe('placing the events', () => {
  it('gives the same spots and kinds for the same forest code', () => {
    for (const code of CODES) {
      expect(placeStoryEvents(generateForest(code))).toEqual(placeStoryEvents(generateForest(code)));
    }
    expect(placeStoryEvents(generateForest('A1'))).not.toEqual(placeStoryEvents(generateForest('B2')));
  });

  it('never moves the spots when a kind is added to the cast', () => {
    const extra: EventKind = { id: 99, name: 'Test fox', fits: 'anywhere', trigger: 'step', versions: ['a', 'b'], thoughts: ['c'], popup: 'Fox!' };
    for (const code of CODES) {
      const f = generateForest(code);
      const tiles = eventSpotTiles(f);
      const before = placeStoryEvents(f).map((s) => s.i);
      const after = placeStoryEvents(f, [...CAST, extra]).map((s) => s.i);
      for (const i of [...before, ...after]) expect(tiles).toContain(i);
      // A spot that had a kind still has one; at most a spot that stayed empty gets filled.
      for (const i of before) expect(after).toContain(i);
    }
  });

  it('puts spots only on path or swamp, one per kind, none within another\'s view, each where its kind fits', () => {
    for (const code of CODES) {
      const f = generateForest(code);
      const spots = placeStoryEvents(f);
      const fits = placeTests(f);
      expect(spots.length).toBeGreaterThan(SPOT_COUNT / 2);
      expect(new Set(spots.map((s) => s.kind)).size).toBe(spots.length);
      for (const s of spots) {
        expect([PATH, SWAMP]).toContain(f.tiles[s.i]);
        expect(fits(eventKind(s.kind)!.fits, s.i)).toBe(true);
        for (const o of spots) {
          if (o === s) continue;
          const [ax, ay] = xyOf(f, s.i);
          const [bx, by] = xyOf(f, o.i);
          expect(Math.max(Math.abs(ax - bx), Math.abs(ay - by))).toBeGreaterThan(1);
        }
      }
    }
  });

  it('places afresh from a trip seed: the same seed gives the same placement, new seeds differ, fixed places stay as before', () => {
    for (const code of CODES) {
      const f = generateForest(code);
      // The fixed seed is the default and is what every forest code has always used.
      expect(placeStoryEvents(f, CAST, SPOT_COUNT, fixedSeed(f))).toEqual(placeStoryEvents(f));
      expect(eventSpotTiles(f, SPOT_COUNT, fixedSeed(f))).toEqual(eventSpotTiles(f));
      expect(placeStoryEvents(f, CAST, SPOT_COUNT, tripSeed(42))).toEqual(placeStoryEvents(f, CAST, SPOT_COUNT, tripSeed(42)));
      const trips = [1, 2, 3, 4, 5].map((n) => JSON.stringify(placeStoryEvents(f, CAST, SPOT_COUNT, tripSeed(n))));
      expect(new Set(trips).size).toBe(trips.length);
      expect(trips).not.toContain(JSON.stringify(placeStoryEvents(f)));
      // The same rules hold for new places: walkable, one per kind, each where it fits.
      const fits = placeTests(f);
      for (const n of [1, 2, 3]) {
        const spots = placeStoryEvents(f, CAST, SPOT_COUNT, tripSeed(n));
        expect(spots.length).toBeGreaterThan(SPOT_COUNT / 2);
        expect(new Set(spots.map((s) => s.kind)).size).toBe(spots.length);
        for (const s of spots) {
          expect([PATH, SWAMP]).toContain(f.tiles[s.i]);
          expect(fits(eventKind(s.kind)!.fits, s.i)).toBe(true);
        }
      }
    }
    expect(tripSeed(2 ** 32 + 5)).toBe(tripSeed(5));
  });

  it('works the placement out again after an edit, dropping a spot that is no longer walkable', () => {
    const f = generateForest('KARKULKA');
    const spot = placeStoryEvents(f)[0].i;
    const edited = { ...f, tiles: f.tiles.slice() };
    edited.tiles[spot] = TREE;
    expect(placeStoryEvents(edited).map((s) => s.i)).not.toContain(spot);
  });
});

/** An open 9 × 9 forest with home at its usual spot. */
function openForest(): ReturnType<typeof forestFromTiles> {
  const tiles: Tile[] = new Array(81).fill(PATH);
  tiles[homeIndex(9)] = HOME;
  return forestFromTiles('TEST', 9, tiles);
}
const at = (x: number, y: number) => y * 9 + x;
const OWL = CAST.find((k) => k.trigger === 'hear')!.id;
const SQUIRREL = CAST.find((k) => k.trigger === 'step' && k.fits === 'anywhere')!.id;

describe('what a trip sets off', () => {
  it('a step event when she steps onto it, once per trip, and not where she starts', () => {
    const f = openForest();
    const spots = [{ i: at(2, 6), kind: SQUIRREL }];
    // Starts on the spot, walks off, comes back, leaves, comes back again.
    const pos = [at(2, 6), at(3, 6), at(2, 6), at(1, 6), at(2, 6)];
    expect(eventsSetOff(f, spots, pos)).toEqual([{ spot: at(2, 6), kind: SQUIRREL, t: 2, version: 0 }]);
    // Bumping into a tree while on it does not set it off again or for the first time.
    expect(eventsSetOff(f, spots, [at(2, 6), at(2, 6)])).toEqual([]);
  });

  it('a hear event when the spot first comes into her 3 × 3 view', () => {
    const f = openForest();
    const spots = [{ i: at(4, 6), kind: OWL }];
    expect(eventsSetOff(f, spots, [at(1, 6), at(2, 6), at(3, 6), at(2, 6), at(3, 6)]).map((e) => e.t)).toEqual([2]);
    // Already in view at the start: only when it comes into view again.
    expect(eventsSetOff(f, spots, [at(3, 6), at(2, 6), at(1, 6), at(2, 6), at(3, 6)]).map((e) => e.t)).toEqual([4]);
  });

  it('the tracker finds the same events step by step, and picks how each turns out', () => {
    const f = generateForest('KARKULKA');
    const spots = placeStoryEvents(f);
    const rng = mulberry32(3);
    const model = createModel({ memory: 3, hint: false, hidden: FIXED.hidden }, rng);
    for (let k = 0; k < 10; k++) {
      const w = new Walker(f, model, eventSpotTiles(f, 40)[k], 60, 1.5, mulberry32(k));
      const tr = new EventTracker(f, spots, mulberry32(100 + k));
      while (!w.done) { w.step(); tr.after(w.positions); }
      // Events with a chance may stay away; the rest always happen.
      const could = eventsSetOff(f, spots, w.positions);
      const got = tr.met.map(({ version, ...e }) => ({ ...e, version: 0 }));
      expect(could).toEqual(expect.arrayContaining(got));
      expect(got).toEqual(could.filter((e) => got.some((g) => g.spot === e.spot) || eventKind(e.kind)!.chance === undefined));
      for (const e of tr.met) expect(e.version).toBeLessThan(eventKind(e.kind)!.versions.length);
    }
  });

  it('never changes her walk or any judge\'s points', () => {
    const f = generateForest('B2');
    const rng = mulberry32(7);
    const model = createModel({ memory: 3, hint: false, hidden: FIXED.hidden }, rng);
    trainLessons(model, createAdam(model), f, 'father', 60, newStats(f), rng);
    const maps = judgeMaps(f);
    const spots = placeStoryEvents(f);
    for (let k = 0; k < 8; k++) {
      const start = eventSpotTiles(f, 40)[k];
      const plain = new Walker(f, model, start, 80, 0.9, mulberry32(k));
      plain.run();
      const withEvents = new Walker(f, model, start, 80, 0.9, mulberry32(k));
      const tr = new EventTracker(f, spots, mulberry32(999));
      while (!withEvents.done) { withEvents.step(); tr.after(withEvents.positions); }
      expect(withEvents.positions).toEqual(plain.positions);
      for (const j of JUDGES) expect(judgeRewards(j, f, maps, runOf(withEvents))).toEqual(judgeRewards(j, f, maps, runOf(plain)));
    }
  });
});

const FOX = CAST.find((k) => k.effect === 'takeCake')!.id;
const NEIGHBOUR = CAST.find((k) => k.effect === 'giveFlowers')!.id;

describe('events that change her basket', () => {
  it('the data has every effect, each on a step event with a report phrase', () => {
    expect(new Set(CAST.filter((k) => k.effect).map((k) => k.effect))).toEqual(new Set(EFFECTS));
    for (const k of CAST.filter((c) => c.effect)) expect(k.deed, k.name).toBeTruthy();
    const bad: StoryData = JSON.parse(JSON.stringify(STORY));
    bad.events.push({ ...bad.events[0], id: 98, effect: 'takeCake' as never });
    bad.events.push({ ...bad.events[1], id: 99, effect: 'giveGold' as never, quiet: ['x'] });
    const errors = checkStoryData(bad);
    expect(errors.some((e) => /step trigger/.test(e))).toBe(true);
    expect(errors.some((e) => /quiet version/.test(e))).toBe(true);
    expect(errors.some((e) => /unknown effect/.test(e))).toBe(true);
    expect(errors.some((e) => /quiet versions only/.test(e))).toBe(true);
    expect(errors.some((e) => /deed/.test(e))).toBe(true);
  });

  it('applies an effect like the same change by a tile, and takes no cake that is not there', () => {
    const b = { cake: true, flowers: 0, treasure: 0 };
    expect(applyEffect(b, 'giveFlowers')).toBe(true);
    expect(applyEffect(b, 'giveTreasure')).toBe(true);
    expect(applyEffect(b, 'takeCake')).toBe(true);
    expect(b).toEqual({ cake: false, flowers: 1, treasure: 1 });
    expect(applyEffect(b, 'takeCake')).toBe(false);
    expect(b).toEqual({ cake: false, flowers: 1, treasure: 1 });
    expect(applyEffect(b, 'takeFlowers')).toBe(true);
    expect(applyEffect(b, 'takeFlowers')).toBe(false);
    expect(b.flowers).toBe(0);
  });

  it('the baker only replaces a lost cake, never gives a second one', () => {
    const b = { cake: true, flowers: 0, treasure: 0 };
    expect(applyEffect(b, 'giveCake')).toBe(false);
    expect(b.cake).toBe(true);
    b.cake = false;
    expect(applyEffect(b, 'giveCake')).toBe(true);
    expect(b.cake).toBe(true);
  });

  it('an apple gives energy back, never above her starting energy, and nothing when she is full', () => {
    const b = { cake: true, flowers: 0, treasure: 0 };
    const e = { left: 20, budget: 60 };
    expect(applyEffect(b, 'giveEnergy', e)).toBe(true);
    expect(e.left).toBe(20 + APPLE_ENERGY);
    e.left = 55;
    expect(applyEffect(b, 'giveEnergy', e)).toBe(true);
    expect(e.left).toBe(60);
    expect(applyEffect(b, 'giveEnergy', e)).toBe(false);
    expect(applyEffect(b, 'giveEnergy')).toBe(false);
  });

  it('an event with a chance only happens when the roll is under it, and a missed spot is not rolled again', () => {
    const f = openForest();
    const spots = [{ i: at(2, 6), kind: FOX }];
    expect(eventKind(FOX)!.chance).toBeLessThan(1);
    const pos = [at(1, 6), at(2, 6), at(3, 6), at(2, 6)];
    const run = (roll: number) => { const tr = new EventTracker(f, spots, () => roll); for (let t = 1; t <= pos.length; t++) tr.after(pos.slice(0, t)); return tr.met.length; };
    expect(run(0.99)).toBe(0);
    expect(run(0)).toBe(1);
    const rolls: number[] = [];
    const tr = new EventTracker(f, spots, () => { rolls.push(1); return 0.99; });
    for (let t = 1; t <= pos.length; t++) tr.after(pos.slice(0, t));
    expect(rolls.length).toBe(1);
  });

  it('the tracker changes the basket once, and the fox finds an empty basket quietly', () => {
    const f = openForest();
    const spots = [{ i: at(2, 6), kind: FOX }, { i: at(4, 6), kind: NEIGHBOUR }];
    const pos = [at(1, 6), at(2, 6), at(3, 6), at(2, 6), at(3, 6), at(4, 6)];
    const basket = { cake: true, flowers: 0, treasure: 0 };
    const tr = new EventTracker(f, spots, () => 0);
    for (let t = 1; t <= pos.length; t++) tr.after(pos.slice(0, t), basket);
    expect(basket).toEqual({ cake: false, flowers: 1, treasure: 0 });
    expect(tr.met.map((e) => [e.kind, e.t, e.effect])).toEqual([[FOX, 1, 'takeCake'], [NEIGHBOUR, 5, 'giveFlowers']]);
    const empty = { cake: false, flowers: 0, treasure: 0 };
    const quiet = new EventTracker(f, spots, () => 0);
    quiet.after(pos.slice(0, 2), empty);
    expect(empty.cake).toBe(false);
    expect(quiet.met[0]).toMatchObject({ kind: FOX, quiet: true });
    expect(quiet.met[0].effect).toBeUndefined();
    expect(eventKind(FOX)!.quiet).toContain(metText(quiet.met[0]));
    // Without a basket (as in the older tests) nothing is applied.
    const none = new EventTracker(f, spots, () => 0);
    none.after(pos);
    expect(none.met.every((e) => !e.effect && !e.quiet)).toBe(true);
  });

  it('on a trip alone the change shows in the basket she reads at the next step; trips stay reproducible', () => {
    let effects = 0;
    const kinds = new Set<string>();
    for (const code of CODES) {
      const f = generateForest(code);
      const rng = mulberry32(11);
      const model = createModel({ memory: 3, hint: false, hidden: FIXED.hidden }, rng);
      trainLessons(model, createAdam(model), f, 'grandma', 60, newStats(f), rng);
      for (let k = 0; k < 30; k++) {
        const spots = placeStoryEvents(f, CAST, SPOT_COUNT, tripSeed(k));
        const start = eventSpotTiles(f, 60)[k];
        const walk = () => {
          const w = new Walker(f, model, start, 80, 1, mulberry32(k));
          w.events = new EventTracker(f, spots, mulberry32(500 + k));
          w.run();
          return w;
        };
        const w = walk();
        expect(walk().positions).toEqual(w.positions);
        const tr = w.events as EventTracker;
        expect(w.effects).toEqual(tr.met.filter((e) => e.effect).map((e) => ({ t: e.t, kind: e.kind, effect: e.effect })));
        for (const e of w.effects) {
          effects++; kinds.add(e.effect);
          const before = w.baskets[e.t - 1], after = w.baskets[e.t];
          if (e.effect === 'takeCake') expect([before.cake, after.cake]).toEqual([true, false]);
          if (e.effect === 'giveFlowers') expect(after.flowers).toBeGreaterThan(before.flowers);
          if (e.effect === 'giveTreasure') expect(after.treasure).toBeGreaterThan(before.treasure);
          if (e.effect === 'takeFlowers') expect(after.flowers).toBe(before.flowers - 1);
          // An apple gives 10, more than any step costs (3 at most), up to her starting energy.
          if (e.effect === 'giveEnergy') expect(w.history.energy[e.t]).toBeGreaterThanOrEqual(Math.min(w.energy, w.history.energy[e.t - 1] + APPLE_ENERGY - 3));
          if (e.effect === 'giveCake') expect([before.cake, after.cake]).toEqual([false, true]);
          if (e.t < w.history.baskets.length) expect(w.history.baskets[e.t]).toEqual(after);
        }
      }
    }
    expect(effects).toBeGreaterThan(5);
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('lessons, practice and test trips never apply effects: a walker without events walks as before', () => {
    const f = generateForest('A1');
    const rng = mulberry32(2);
    const model = createModel({ memory: 3, hint: false, hidden: FIXED.hidden }, rng);
    const w = new Walker(f, model, eventSpotTiles(f, 5)[0], 60, 1, mulberry32(3));
    w.run();
    expect(w.events).toBeNull();
    expect(w.effects).toEqual([]);
  });
});

describe('basket events in the notes after a trip', () => {
  /** Trips alone with events (new places each trip) after some lessons, until `want` finds one. */
  function findTrip(teacher: 'grandma' | 'father', want: (w: Walker) => boolean): { w: Walker; stats: ReturnType<typeof newStats>; f: ReturnType<typeof generateForest> } {
    for (const code of CODES) {
      const f = generateForest(code);
      const rng = mulberry32(21);
      const model = createModel({ memory: 3, hint: false, hidden: FIXED.hidden }, rng);
      const stats = newStats(f);
      trainLessons(model, createAdam(model), f, teacher, 80, stats, rng);
      const starts = eventSpotTiles(f, 60);
      for (let k = 0; k < 300; k++) {
        const w = new Walker(f, model, starts[k % starts.length], 80, 1.2, mulberry32(k));
        w.events = new EventTracker(f, placeStoryEvents(f, CAST, SPOT_COUNT, tripSeed(k)), mulberry32(k));
        w.run();
        if (want(w)) return { w, stats, f };
      }
    }
    throw new Error('no such trip');
  }

  it('eaten after the fox took the cake: the fox is to blame', () => {
    const { w, stats, f } = findTrip('father', (w) => w.outcome === 'eaten' && w.effects.some((e) => e.effect === 'takeCake' && e.kind === FOX));
    const e = explainTrip(w, f, stats, false);
    expect(e.card).toBe('basketEvents');
    expect(e.text).toMatch(/fox took the cake/);
  });

  it('home after the neighbour\'s flowers, after Grandma\'s lessons: the flowers told her the errand was done', () => {
    const { w, stats, f } = findTrip('grandma', (w) => {
      const gift = w.effects.find((e) => e.effect === 'giveFlowers');
      return w.outcome === 'home' && w.basket.cake && w.pickups.flowers === 0 && !!gift && w.t - gift.t <= walkingDistances(w.forest)[w.positions[gift.t]] + 2;
    });
    const e = explainTrip(w, f, stats, false);
    expect(e.card).toBe('basketEvents');
    expect(e.text).toMatch(/neighbour gave her flowers/);
  });

  it('names where a basket change came from', () => {
    expect(effectWords({ t: 7, kind: 19, effect: 'takeCake' })).toBe('the fox took the cake at step 7');
    expect(effectWords({ t: 3, kind: 20, effect: 'giveFlowers' })).toMatch(/neighbour at step 3/);
    expect(effectWords({ t: 4, kind: 53, effect: 'takeCake' })).toBe('the cake fell into the swamp at step 4');
  });
});
