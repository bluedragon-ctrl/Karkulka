import { describe, expect, it } from 'vitest';
import { generateForest } from '../src/forest';
import { createModel } from '../src/model';
import { MAX_WOLVES, WOLF_START_GAP, WalkingWolf, closeness, viewWithWolves, wolvesAfter, wolvesFor } from '../src/prowler';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import { costToHome, walkLesson } from '../src/teachers';
import { MEMORY_PAIRS, asSeenBy } from '../src/tokens';
import { startTiles } from '../src/train';
import { VIEW_OFFSETS, WALKER, WOLF, isWalkable, newBasketState, walkingDistances, xyOf } from '../src/world';

const base = generateForest('KARKULKA');
const withWolves = (n: number) => ({ ...base, wolves: n });
const one = withWolves(1);
const model = createModel({ memory: MEMORY_PAIRS.medium, hint: false, hidden: 16 }, mulberry32(1));

describe('walking wolves', () => {
  it('none are out unless the forest says so, and then trips are exactly as before', () => {
    const start = startTiles(base)[3];
    expect(wolvesFor(base, start, mulberry32(1))).toEqual([]);
    const a = new Walker(base, model, start, 60, 0.7, mulberry32(9));
    const b = new Walker(withWolves(0), model, start, 60, 0.7, mulberry32(9));
    a.run(); b.run();
    expect(a.wolves).toEqual([]);
    expect(a.positions).toEqual(b.positions);
  });

  it('as many as asked (at most three) start well away from her and from each other, and walk only where she can', () => {
    expect(wolvesFor(withWolves(9), startTiles(base)[0], mulberry32(1)).length).toBe(MAX_WOLVES);
    for (const n of [1, 2, 3]) {
      const f = withWolves(n);
      for (const start of startTiles(f).slice(0, 15)) {
        const w = new Walker(f, model, start, 80, 0.7, mulberry32(start));
        expect(w.wolves.length).toBe(n);
        const d = walkingDistances({ ...f, home: start });
        for (const wolf of w.wolves) expect(d[wolf.pos]).toBeGreaterThanOrEqual(WOLF_START_GAP);
        for (const a of w.wolves) for (const b of w.wolves) if (a !== b) expect(closeness(f, a.pos, b.pos)).toBeGreaterThan(1);
        w.run();
        for (const wolf of w.wolves) {
          expect(wolf.path.length).toBe(w.positions.length);
          for (const p of wolf.path) if (p >= 0) expect(isWalkable(f.tiles[p]) || w.positions.includes(p)).toBe(true);
        }
        // Never two wolves on one tile.
        w.positions.forEach((_, t) => {
          const here = w.wolves.map((x) => x.path[t]).filter((p) => p >= 0);
          expect(new Set(here).size).toBe(here.length);
        });
      }
    }
  });

  it('show in her view as walking wolves, which the model reads as dens unless it has his token', () => {
    const wolf = new WalkingWolf(one, startTiles(one)[0], mulberry32(2));
    const [wx, wy] = xyOf(one, wolf.pos);
    const k = VIEW_OFFSETS.findIndex(([dx, dy]) => {
      const i = (wy - dy) * one.size + (wx - dx);
      return wx - dx >= 0 && wy - dy >= 0 && wx - dx < one.size && wy - dy < one.size && isWalkable(one.tiles[i]);
    });
    const [dx, dy] = VIEW_OFFSETS[k];
    const her = (wy - dy) * one.size + (wx - dx);
    const view = viewWithWolves(one, her, [wolf]);
    expect(view[k]).toBe(WALKER);
    expect(asSeenBy({ wolfToken: false }, view)[k]).toBe(WOLF);
    expect(asSeenBy({}, view)[k]).toBe(WOLF);
    expect(asSeenBy({ wolfToken: true }, view)[k]).toBe(WALKER);
    expect(viewWithWolves(one, her, [])[k]).toBe(one.tiles[wolf.pos]);
  });

  it('take the cake and go, or eat her when the cake is gone, like a den', () => {
    const wolf = new WalkingWolf(one, startTiles(one)[0], mulberry32(2));
    const trip = newBasketState();
    expect(wolf.after(wolf.pos, 'moved', trip)).toBe('grabbed');
    expect(trip.basket.cake).toBe(false);
    expect(wolf.here).toBe(false);
    const again = new WalkingWolf(one, startTiles(one)[0], mulberry32(2));
    expect(again.after(again.pos, 'moved', trip)).toBe('eaten');
  });

  it('the first wolf to meet her takes the cake, the next one eats her', () => {
    const [a, b] = wolvesFor(withWolves(2), startTiles(base)[0], mulberry32(5));
    const trip = newBasketState();
    expect(wolvesAfter([a], a.pos, 'moved', trip)).toBe('grabbed');
    expect(wolvesAfter([a, b], b.pos, 'moved', trip)).toBe('eaten');
  });

  it('are the same for the same randomness', () => {
    const f = withWolves(2);
    const start = startTiles(f)[5];
    const a = new Walker(f, model, start, 80, 0.7, mulberry32(4));
    const b = new Walker(f, model, start, 80, 0.7, mulberry32(4));
    a.run(); b.run();
    expect(a.wolves.map((w) => w.path)).toEqual(b.wolves.map((w) => w.path));
    expect(a.positions).toEqual(b.positions);
  });

  it('the teachers keep away from them in their lessons', () => {
    const rng = mulberry32(3);
    for (const n of [1, 3]) {
      const f = withWolves(n);
      const starts = startTiles(f);
      for (const teacher of ['mother', 'father', 'grandma'] as const) {
        const cost = costToHome(f, teacher);
        let met = 0;
        let saw = 0;
        for (let k = 0; k < 150; k++) {
          const walk = walkLesson(f, teacher, cost, starts[k % starts.length], rng);
          expect(walk.wolves!.length).toBe(n);
          for (const path of walk.wolves!) expect(path.length).toBe(walk.positions.length);
          if (walk.wolves!.some((p) => p[0] >= 0 && p.includes(-1))) met++;
          if (walk.positions.some((p, t) => walk.wolves!.some((w) => w[t] >= 0 && closeness(f, p, w[t]) <= 1))) saw++;
        }
        expect(saw).toBeGreaterThan(5);
        expect(met).toBeLessThanOrEqual(n * 3);
      }
    }
  });
});
