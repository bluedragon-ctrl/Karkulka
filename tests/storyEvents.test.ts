import { describe, expect, it } from 'vitest';
import { generateForest } from '../src/forest';
import { createAdam, createModel } from '../src/model';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import {
  CAST, EventKind, EventTracker, MAX_POPUP, STORY, SPOT_COUNT, StoryData, checkStoryData, eventKind, eventSpotTiles, eventsSetOff,
  placeStoryEvents, placeTests,
} from '../src/storyEvents';
import { FIXED, JUDGES, judgeMaps, judgeRewards, newStats, runOf, trainLessons } from '../src/train';
import { HOME, PATH, SWAMP, Tile, TREE, forestFromTiles, homeIndex, xyOf } from '../src/world';

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
      expect(tr.met.map(({ version, ...e }) => ({ ...e, version: 0 }))).toEqual(eventsSetOff(f, spots, w.positions));
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
