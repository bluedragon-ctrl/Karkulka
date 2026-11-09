import { describe, expect, it } from 'vitest';
import { generateForest } from '../src/forest';
import { createModel } from '../src/model';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import { tellStory } from '../src/story';
import { STORY } from '../src/storyEvents';
import { costToDen, costToHome, walkLesson } from '../src/teachers';
import { EMPTY_LINES, RISK_LINES, HOME_AFTER_ALL, Thoughts } from '../src/thoughts';
import { MEMORY_PAIRS } from '../src/tokens';
import { startTiles } from '../src/train';
import { Forest, PATH, Tile, WOLF, HOME, forestFromTiles, homeIndex, newBasketState, step, wolfOutRolls } from '../src/world';

const base = generateForest('KARKULKA');
const out = (chance: number): Forest => ({ ...base, wolfOut: chance });
const model = createModel({ memory: MEMORY_PAIRS.medium, hint: false, hidden: 16 }, mulberry32(1));

/** A row of path with a den at x = 2 and home far off: she starts at x = 1 and steps east into the den. */
function den(): Forest {
  const size = 9;
  const tiles: Tile[] = new Array(size * size).fill(PATH);
  tiles[homeIndex(size)] = HOME;
  tiles[4 * size + 2] = WOLF;
  return forestFromTiles('DEN', size, tiles);
}

describe('the wolf sometimes out (an option)', () => {
  it('is off by default: nothing is drawn, and trips are exactly as before', () => {
    expect(wolfOutRolls(base, () => { throw new Error('drawn'); })).toBeUndefined();
    expect(wolfOutRolls(out(0), () => { throw new Error('drawn'); })).toBeUndefined();
    for (const start of startTiles(base).slice(0, 20)) {
      const a = new Walker(base, model, start, 60, 1.2, mulberry32(start));
      const b = new Walker(out(0), model, start, 60, 1.2, mulberry32(start));
      a.run(); b.run();
      expect(b.positions).toEqual(a.positions);
      expect(b.results).not.toContain('empty');
    }
  });

  it('when he is out, nothing happens: she stands on the den and runs on, cake and all', () => {
    const f = den();
    const from = 4 * f.size + 1;
    const trip = newBasketState();
    expect(step(f, from, 1, trip, () => true)).toEqual({ pos: from + 1, result: 'empty', cost: 1 });
    expect(trip.basket.cake).toBe(true);
    // Home: the usual rules, the cake first, then her.
    expect(step(f, from, 1, trip, () => false).result).toBe('grabbed');
    expect(step(f, from, 1, trip, () => true).result).toBe('empty');
    expect(step(f, from, 1, trip, () => false).result).toBe('eaten');
    // Without a trip state every den eats her, as before.
    expect(step(f, from, 1, undefined, () => true).result).toBe('eaten');
  });

  it('rolls again at every step onto a den, with the chance set', () => {
    const roll = wolfOutRolls(out(0.3), mulberry32(5))!;
    let n = 0;
    for (let k = 0; k < 20000; k++) if (roll()) n++;
    expect(n / 20000).toBeGreaterThan(0.28);
    expect(n / 20000).toBeLessThan(0.32);
    expect(wolfOutRolls(out(1), mulberry32(5))!()).toBe(true);
  });

  it('always out: no den ends a trip alone, and she keeps the cake', () => {
    const f = out(1);
    let empty = 0;
    for (const start of startTiles(f).slice(0, 40)) {
      const w = new Walker(f, model, start, 80, 1.5, mulberry32(start + 7));
      w.run();
      expect(w.outcome).not.toBe('eaten');
      expect(w.basket.cake).toBe(true);
      empty += w.emptyDens;
    }
    expect(empty).toBeGreaterThan(0);
  });

  it('never in lessons: the teachers walk exactly as with the wolf home', () => {
    const costs = costToHome(base, 'father');
    for (const start of startTiles(base).slice(0, 30)) {
      for (const teacher of ['father', 'wolf'] as const) {
        const a = walkLesson(base, teacher, costs, start, mulberry32(start), costToDen(base));
        const b = walkLesson(out(1), teacher, costs, start, mulberry32(start), costToDen(base));
        expect(b.positions).toEqual(a.positions);
      }
    }
  });

  it('she thinks about her luck, and her story tells it', () => {
    const f = { ...den(), wolfOut: 0.5 };
    const from = 4 * f.size + 1;
    const state = {
      forest: f, positions: [from, from + 1], history: { moves: [1 as const], sectors: [0, 0] }, blocked: [false],
      results: ['empty' as const], decisions: [{ tempered: [0, 0.5, 0, 0] }], energy: 80, energyLeft: 79, outcome: null, pos: from + 1, t: 1,
    };
    const lines = [...EMPTY_LINES, ...RISK_LINES] as string[];
    for (let k = 0; k < 10; k++) {
      const said = new Thoughts(mulberry32(k)).after(state)!;
      expect(said.length).toBeGreaterThan(0);
      for (const l of said) expect(lines).toContain(l);
      expect(EMPTY_LINES).toContain(said[said.length - 1]);
    }
    // Eaten at a den when he might have been out: sometimes she says she took the chance.
    const eaten = { ...state, results: ['eaten' as const], outcome: 'eaten' as const };
    const all = new Set<string>();
    for (let k = 0; k < 30; k++) for (const l of new Thoughts(mulberry32(k)).after(eaten)!) all.add(l);
    expect([...all].some((l) => (HOME_AFTER_ALL as readonly string[]).includes(l))).toBe(true);

    const story = tellStory({ forest: f, start: from, positions: [from, from + 1, from + 2], results: ['empty', 'moved'], outcome: 'lost', met: [], placed: [] } as never, 0, mulberry32(1));
    expect(story.some((s) => STORY.basket.empty.includes(s.text) && !s.madeUp)).toBe(true);
    // Told once, however many times she went in and out.
    const many = tellStory({ forest: f, start: from, positions: [from, from + 1, from, from + 1, from], results: ['empty', 'moved', 'empty', 'moved'], outcome: 'lost', met: [], placed: [] } as never, 0, mulberry32(1));
    expect(many.filter((s) => STORY.basket.empty.includes(s.text)).length).toBe(1);
  });
});
