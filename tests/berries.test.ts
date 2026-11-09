import { describe, expect, it } from 'vitest';
import { BERRY_BUSHES, BERRY_MIN_DIST, generateForest, parentRouteTiles } from '../src/forest';
import { createModel } from '../src/model';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import { ENERGY_MARGIN, PLANS_ENERGY, TEACHER_KINDS, berryStop, energyTrack, enoughEnergy, walkLesson } from '../src/teachers';
import { ENERGY_LEVELS, energyLevel, encodeContext, BASKET_FEATS, MEMORY_PAIRS } from '../src/tokens';
import { startTiles, teacherCosts } from '../src/train';
import {
  BERRIES, BERRY_ENERGY, FLOWERS, Forest, HOME, MOVES, PATH, TREASURE, TREE, Tile, energyAfter, energyToHome, forestFromTiles,
  isWalkable, neighbor, newBasketState, step, tileAt, viewAt, walkingDistances,
} from '../src/world';

/** A corridor along row 1: her start at x = 1, a bush at x = 3, home at x = 7. */
function corridor(): Forest {
  const size = 9;
  const tiles: Tile[] = new Array(size * size).fill(TREE);
  for (let x = 1; x <= 7; x++) tiles[size + x] = PATH;
  tiles[size + 3] = BERRIES;
  tiles[size + 7] = HOME;
  return forestFromTiles('T', size, tiles);
}

describe('berry bushes', () => {
  it('give energy back once per trip, never above her starting energy', () => {
    const f = corridor();
    const trip = newBasketState();
    expect(step(f, f.size + 2, 1, trip)).toEqual({ pos: f.size + 3, result: 'berries', cost: 1, gain: BERRY_ENERGY });
    // Eaten: next time it is ordinary path.
    expect(step(f, f.size + 2, 1, trip)).toEqual({ pos: f.size + 3, result: 'moved', cost: 1 });
    // Without a trip state (the parents' route planning) a bush is path.
    expect(step(f, f.size + 2, 1).result).toBe('moved');
    expect(energyAfter(10, 30, 1, BERRY_ENERGY)).toBe(24);
    expect(energyAfter(20, 30, 1, BERRY_ENERGY)).toBe(30);
    // Stepping onto a bush with the last bit of energy still saves her.
    expect(energyAfter(1, 30, 1, BERRY_ENERGY)).toBe(BERRY_ENERGY);
    // Her basket is untouched: berries are eaten, not carried.
    expect(trip.basket).toEqual({ cake: true, flowers: 0, treasure: 0 });
  });

  it('look like path to her once eaten', () => {
    const f = corridor();
    const at = f.size + 2;
    expect(viewAt(f, at)[4]).toBe(BERRIES);
    expect(viewAt(f, at, [f.size + 3])[4]).toBe(PATH);
  });

  it('on a trip alone she gets the energy, and her pinned energy follows', () => {
    const f = corridor();
    const m = createModel({ memory: 1, hint: false, hidden: 4 }, mulberry32(1));
    // Walk right by hand: the model's guess does not matter here.
    const w = new Walker(f, m, f.size + 1, 5, 1, mulberry32(2));
    w.decide = () => ({ logits: new Float32Array([-50, 50, -50, -50]), raw: new Float32Array([0, 1, 0, 0]), hidden: new Float32Array(4), input: new Float32Array(), nz: [] });
    w.step();
    w.step();
    expect(w.results).toEqual(['moved', 'berries']);
    expect(w.energyLeft).toBe(5); // 5 − 1 − 1 + 15, at most 5
    expect(w.history.energy).toEqual([5, 4, 5]);
    expect(w.pickups.berries).toBe(1);
    expect(w.history.views[2][3]).toBe(PATH); // the eaten bush, behind her
  });
});

describe('the energy token', () => {
  it('has four absolute levels', () => {
    expect(ENERGY_LEVELS).toEqual([10, 20, 40]);
    expect([0, 9, 10, 19, 20, 39, 40, 200].map(energyLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('is pinned after the basket, one-hot', () => {
    const f = generateForest('KARKULKA');
    const costs = teacherCosts(f);
    const w = walkLesson(f, 'mother', costs.mother, startTiles(f)[0], mulberry32(1));
    const cfg = { memory: MEMORY_PAIRS.short, hint: false, hidden: 4 };
    for (let t = 0; t < w.history.views.length; t++) {
      const x = encodeContext(cfg, w.history, t);
      expect(Array.from(x.slice(BASKET_FEATS, BASKET_FEATS + 4))).toEqual([0, 1, 2, 3].map((k) => (k === energyLevel(w.history.energy[t]) ? 1 : 0)));
    }
  });
});

describe('lesson energy', () => {
  it('energyTrack and enoughEnergy: just enough never runs out before the last step', () => {
    const costs = [{ cost: 1, gain: 0 }, { cost: 3, gain: 0 }, { cost: 1, gain: 0 }];
    expect(enoughEnergy(costs)).toBe(5);
    expect(energyTrack(5, costs)).toEqual([5, 4, 1, 0]);
    // With a bush on the way, less will do.
    const withBerries = [{ cost: 1, gain: 0 }, { cost: 1, gain: BERRY_ENERGY }, { cost: 1, gain: 0 }, { cost: 1, gain: 0 }, { cost: 1, gain: 0 }];
    expect(enoughEnergy(withBerries)).toBe(3); // 6 without the bush (the berries can never lift her above her start)
  });

  it('every teacher\'s lesson has an energy track that never runs out on the way', () => {
    for (const code of ['KARKULKA', 'A1', 'ZZ9922']) {
      const f = generateForest(code);
      const costs = teacherCosts(f);
      const rng = mulberry32(5);
      for (const teacher of TEACHER_KINDS) {
        for (const start of startTiles(f).slice(0, 25)) {
          const w = walkLesson(f, teacher, costs[teacher], start, rng, costs.den);
          expect(w.history.energy).toHaveLength(w.history.views.length);
          expect(w.history.energy[0]).toBe(w.energy);
          expect(w.history.energy.every((e) => e > 0 && e <= w.energy)).toBe(true);
        }
      }
    }
  });

  it('the parents\' lessons are the same walks whatever her energy', () => {
    const f = generateForest('KARKULKA');
    const costs = teacherCosts(f);
    for (const teacher of TEACHER_KINDS.filter((t) => !PLANS_ENERGY.includes(t))) {
      for (const start of startTiles(f).slice(0, 10)) {
        const a = walkLesson(f, teacher, costs[teacher], start, mulberry32(7), costs.den, 15);
        const b = walkLesson(f, teacher, costs[teacher], start, mulberry32(7), costs.den, 90);
        expect(a.positions).toEqual(b.positions);
      }
    }
  });

  it('the hedgehog stops for berries only when she is tired, and then gets her home', () => {
    let detours = 0;
    for (const code of ['KARKULKA', 'A1', 'B2', 'C3']) {
      const f = generateForest(code);
      const costs = teacherCosts(f);
      const eh = energyToHome(f);
      for (const start of startTiles(f).filter((s) => f.tiles[s] !== BERRIES)) {
        // Plenty: straight home, past every bush.
        const rested = walkLesson(f, 'hedgehog', costs.hedgehog, start, mulberry32(1), costs.den, eh[start] + ENERGY_MARGIN + 20);
        expect(rested.positions.at(-1)).toBe(f.home);
        expect(rested.positions.slice(1, -1).filter((p) => f.tiles[p] === BERRIES)).toEqual([]);
        // Tired: if a bush is worth it, he goes there first.
        const tight = Math.max(2, Math.round(eh[start] * 0.75));
        const walk = walkLesson(f, 'hedgehog', costs.hedgehog, start, mulberry32(1), costs.den, tight);
        expect(walk.positions.at(-1)).toBe(f.home);
        if (walk.positions.some((p) => f.tiles[p] === BERRIES)) detours++;
      }
    }
    expect(detours).toBeGreaterThan(20);
  });

  it('berryStop: none with enough energy, else the nearest bush that leaves enough', () => {
    const f = corridor();
    const pos = f.size + 1;
    const eh = energyToHome(f);
    const from = new Float64Array(f.tiles.length).map((_, i) => Math.abs((i % f.size) - 1) + (Math.floor(i / f.size) === 1 ? 0 : Infinity));
    expect(berryStop(f, pos, eh[pos] + ENERGY_MARGIN, 30, from, eh, [])).toBe(-1);
    expect(berryStop(f, pos, 4, 30, from, eh, [])).toBe(f.size + 3);
    expect(berryStop(f, pos, 4, 30, from, eh, [f.size + 3])).toBe(-1);
  });
});

describe('the generator', () => {
  it('places 1–3 berry bushes (mostly 2–3) off the parents\' routes, away from home and items, never on the border', () => {
    let two = 0;
    const codes = ['KARKULKA', 'A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'ZZ9922'];
    for (const code of codes) {
      const f = generateForest(code);
      const bushes = f.tiles.flatMap((t, i) => (t === BERRIES ? [i] : []));
      expect(bushes.length).toBeGreaterThanOrEqual(1);
      expect(bushes.length).toBeLessThanOrEqual(BERRY_BUSHES[1]);
      if (bushes.length >= BERRY_BUSHES[0]) two++;
      const used = parentRouteTiles(f);
      const dist = walkingDistances(f);
      for (const b of bushes) {
        // Off the parents' routes, unless it is a forest's only bush (the last resort).
        if (bushes.length > 1) expect(used.has(b)).toBe(false);
        expect(dist[b]).toBeGreaterThanOrEqual(BERRY_MIN_DIST);
        for (const m of MOVES) {
          const n = neighbor(f, b, m);
          expect([HOME, FLOWERS, TREASURE, BERRIES]).not.toContain(f.tiles[n]);
        }
      }
      for (let i = 0; i < f.size; i++) for (const [x, y] of [[i, 0], [0, i], [i, f.size - 1], [f.size - 1, i]]) expect(tileAt(f, x, y)).toBe(TREE);
      expect(f.tiles.every((t, i) => !isWalkable(t) || dist[i] >= 0)).toBe(true);
    }
    expect(two).toBeGreaterThanOrEqual(codes.length - 2);
  });
});
