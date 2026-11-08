import { describe, expect, it } from 'vitest';
import { generateForest } from '../src/forest';
import { createModel } from '../src/model';
import { WOLF_START_GAP, WalkingWolf, closeness, viewWithWolf, wolfFor } from '../src/prowler';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import { costToHome, walkLesson } from '../src/teachers';
import { MEMORY_PAIRS } from '../src/tokens';
import { startTiles } from '../src/train';
import { VIEW_OFFSETS, WOLF, isWalkable, newBasketState, walkingDistances, xyOf } from '../src/world';

const base = generateForest('KARKULKA');
const withWolf = { ...base, wolfWalks: true };
const model = createModel({ memory: MEMORY_PAIRS.medium, hint: false, hidden: 16 }, mulberry32(1));

describe('the walking wolf', () => {
  it('is not out unless the forest says so, and then trips are exactly as before', () => {
    const start = startTiles(base)[3];
    expect(wolfFor(base, start, mulberry32(1))).toBeNull();
    const a = new Walker(base, model, start, 60, 0.7, mulberry32(9));
    const b = new Walker({ ...base, wolfWalks: false }, model, start, 60, 0.7, mulberry32(9));
    a.run(); b.run();
    expect(a.wolf).toBeNull();
    expect(a.positions).toEqual(b.positions);
  });

  it('starts well away from her and walks only where she can', () => {
    for (const start of startTiles(withWolf).slice(0, 20)) {
      const w = new Walker(withWolf, model, start, 80, 0.7, mulberry32(start));
      expect(w.wolf).not.toBeNull();
      const d = walkingDistances({ ...withWolf, home: start });
      expect(d[w.wolf!.pos]).toBeGreaterThanOrEqual(WOLF_START_GAP);
      w.run();
      expect(w.wolf!.path.length).toBe(w.positions.length);
      for (const p of w.wolf!.path) if (p >= 0) expect(isWalkable(withWolf.tiles[p]) || w.positions.includes(p)).toBe(true);
    }
  });

  it('looks like a wolf den to her when he is next to her', () => {
    const wolf = new WalkingWolf(withWolf, startTiles(withWolf)[0], mulberry32(2));
    const [wx, wy] = xyOf(withWolf, wolf.pos);
    const k = VIEW_OFFSETS.findIndex(([dx, dy]) => {
      const i = (wy - dy) * withWolf.size + (wx - dx);
      return wx - dx >= 0 && wy - dy >= 0 && wx - dx < withWolf.size && wy - dy < withWolf.size && isWalkable(withWolf.tiles[i]);
    });
    const [dx, dy] = VIEW_OFFSETS[k];
    const her = (wy - dy) * withWolf.size + (wx - dx);
    expect(viewWithWolf(withWolf, her, wolf)[k]).toBe(WOLF);
    expect(viewWithWolf(withWolf, her, null)[k]).toBe(withWolf.tiles[wolf.pos]);
  });

  it('takes the cake and goes, or eats her when the cake is gone, like a den', () => {
    const wolf = new WalkingWolf(withWolf, startTiles(withWolf)[0], mulberry32(2));
    const trip = newBasketState();
    expect(wolf.after(wolf.pos, 'moved', trip)).toBe('grabbed');
    expect(trip.basket.cake).toBe(false);
    expect(wolf.here).toBe(false);
    const again = new WalkingWolf(withWolf, startTiles(withWolf)[0], mulberry32(2));
    expect(again.after(again.pos, 'moved', trip)).toBe('eaten');
  });

  it('is the same for the same randomness', () => {
    const start = startTiles(withWolf)[5];
    const a = new Walker(withWolf, model, start, 80, 0.7, mulberry32(4));
    const b = new Walker(withWolf, model, start, 80, 0.7, mulberry32(4));
    a.run(); b.run();
    expect(a.wolf!.path).toEqual(b.wolf!.path);
    expect(a.positions).toEqual(b.positions);
  });

  it('the teachers keep away from him in their lessons', () => {
    const rng = mulberry32(3);
    const starts = startTiles(withWolf);
    for (const teacher of ['mother', 'father', 'grandma'] as const) {
      const cost = costToHome(withWolf, teacher);
      let caught = 0;
      let saw = 0;
      for (let k = 0; k < 150; k++) {
        const walk = walkLesson(withWolf, teacher, cost, starts[k % starts.length], rng);
        expect(walk.wolf!.length).toBe(walk.positions.length);
        if (walk.wolf![0] >= 0 && walk.wolf!.includes(-1)) caught++;
        if (walk.positions.some((p, t) => walk.wolf![t] >= 0 && closeness(withWolf, p, walk.wolf![t]) <= 1)) saw++;
      }
      expect(saw).toBeGreaterThan(5);
      expect(caught).toBeLessThanOrEqual(3);
    }
  });
});
