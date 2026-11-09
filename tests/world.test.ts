import { describe, expect, it } from 'vitest';
import { SHORTCUT_MIN_SAVING, disagreement, generateForest, parentRouteTiles, shortcutSaving } from '../src/forest';
import { packTiles, unpackTiles } from '../src/storage';
import { HUNTSMAN_ENERGY, costToHome, crowMoves, endsStuck, teacherMoves, walkLesson } from '../src/teachers';
import { startTiles } from '../src/train';
import { mulberry32 } from '../src/rng';
import {
  FLOWERS, HOME, densInSight, PATH, headsHome, SWAMP, TREASURE, isItem, newBasketState, SWAMP_COST, TREE, WOLF, cheapestToHome, energyToHome, forestFromTiles, homeIndex, moveHome, stepCost, loopCount, walkableTiles, homeSector, neighbor, pathTiles, step, tileAt, unreachableTiles, viewAt, walkingDistances,
} from '../src/world';

describe('forest generator', () => {
  it('is deterministic for a forest code', () => {
    expect(generateForest('ABC123').tiles).toEqual(generateForest('ABC123').tiles);
    expect(generateForest('ABC123').tiles).not.toEqual(generateForest('ABC124').tiles);
  });

  it.each(['KARKULKA', 'ABCDEF', 'ZZ9922', 'Q1', 'WOLF'])('follows the generator rules (%s)', (code) => {
    const f = generateForest(code);
    expect(f.tiles[f.home]).toBe(HOME);
    expect(f.home).toBe(homeIndex(15));
    // Every path tile can reach home without crossing a wolf den.
    expect(unreachableTiles(f)).toEqual([]);
    // Border is all trees.
    for (let i = 0; i < f.size; i++) {
      expect(tileAt(f, i, 0)).toBe(TREE);
      expect(tileAt(f, 0, i)).toBe(TREE);
      expect(tileAt(f, i, f.size - 1)).toBe(TREE);
      expect(tileAt(f, f.size - 1, i)).toBe(TREE);
    }
    expect(f.tiles.filter((t) => t === WOLF).length).toBeGreaterThan(3);
    expect(f.tiles.filter((t) => t === SWAMP).length).toBeGreaterThanOrEqual(4);
    expect(pathTiles(f).length).toBeGreaterThan(60);
  });

  it('keeps several routes home (loops in the walkable forest)', () => {
    for (const c of ['A', 'B', 'C', 'D']) expect(loopCount(generateForest(c))).toBeGreaterThan(8);
  });

  it('places dens where the parents disagree', () => {
    const total = ['A', 'B', 'C', 'D'].reduce((n, c) => n + disagreement(generateForest(c)), 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe('world rules', () => {
  const f = generateForest('KARKULKA');

  it('treats outside the map as trees', () => {
    expect(tileAt(f, -1, 3)).toBe(TREE);
    expect(neighbor(f, 0, 0)).toBe(-1);
    expect(step(f, 0, 0)).toEqual({ pos: 0, result: 'blocked', cost: 1 });
  });

  it('blocks moves into trees and ends trips on dens and home', () => {
    const p = pathTiles(f).find((i) => f.tiles[i - 1] === TREE)!;
    expect(step(f, p, 3)).toEqual({ pos: p, result: 'blocked', cost: 1 });
    const den = f.tiles.findIndex((t) => t === WOLF);
    const nextToDen = [den - 1, den + 1, den - f.size, den + f.size].find((i) => f.tiles[i] === PATH)!;
    const m = ([0, 1, 2, 3] as const).find((mm) => neighbor(f, nextToDen, mm) === den)!;
    expect(step(f, nextToDen, m).result).toBe('eaten');
  });

  it('sees exactly the 8 surrounding tiles', () => {
    const v = viewAt(f, f.home + f.size);
    expect(v).toHaveLength(8);
    expect(v[1]).toBe(HOME);
  });

  it('measures walking distance, not straight-line distance', () => {
    const d = walkingDistances(f);
    expect(d[f.home]).toBe(0);
    for (const i of pathTiles(f)) expect(d[i]).toBeGreaterThan(0);
  });

  it('makes swamp steps cost more energy, and bumping a tree cost 1', () => {
    const sw = f.tiles.findIndex((t) => t === SWAMP);
    const from = [sw - 1, sw + 1, sw - f.size, sw + f.size].find((i) => f.tiles[i] === PATH)!;
    const m = ([0, 1, 2, 3] as const).find((mm) => neighbor(f, from, mm) === sw)!;
    expect(step(f, from, m)).toEqual({ pos: sw, result: 'moved', cost: SWAMP_COST });
    expect(step(f, 0, 0).cost).toBe(1);
  });

  it('counts energy to home, which is at least the number of steps', () => {
    const e = energyToHome(f);
    const d = walkingDistances(f);
    for (const i of walkableTiles(f)) expect(e[i]).toBeGreaterThanOrEqual(d[i]);
    expect(walkableTiles(f).some((i) => e[i] > d[i])).toBe(true);
  });

  it('gives 8 compass sectors toward home', () => {
    expect(homeSector(f, f.home - 2)).toBe(0); // home is to the east
    expect(homeSector(f, f.home + 2)).toBe(4); // home is to the west
    expect(homeSector(f, f.home + 2 * f.size)).toBe(2); // north
  });
});

describe('parents', () => {
  const f = generateForest('KARKULKA');

  it('always walk home and never onto a den', () => {
    for (const teacher of ['mother', 'father'] as const) {
      const cost = costToHome(f, teacher);
      const rng = mulberry32(5);
      for (const start of pathTiles(f)) {
        const w = walkLesson(f, teacher, cost, start, rng);
        expect(w.positions.at(-1)).toBe(f.home);
        expect(w.positions.some((p) => f.tiles[p] === WOLF)).toBe(false);
        expect(w.history.views.length).toBe(w.history.moves.length);
      }
    }
  });

  it('the father wades through swamps far more often than the mother', () => {
    let father = 0;
    let mother = 0;
    for (const c of ['A', 'B', 'C', 'D', 'KARKULKA']) {
      const g = generateForest(c);
      const cf = costToHome(g, 'father');
      const cm = costToHome(g, 'mother');
      for (const start of pathTiles(g)) {
        if (walkLesson(g, 'father', cf, start, mulberry32(1)).positions.some((p) => g.tiles[p] === SWAMP)) father++;
        if (walkLesson(g, 'mother', cm, start, mulberry32(1)).positions.some((p) => g.tiles[p] === SWAMP)) mother++;
      }
    }
    expect(father).toBeGreaterThan(mother * 2);
  });

  it('father takes the shortest route', () => {
    const d = walkingDistances(f);
    const cost = costToHome(f, 'father');
    for (const start of pathTiles(f)) {
      expect(walkLesson(f, 'father', cost, start, mulberry32(1)).history.moves.length).toBe(d[start]);
      expect(teacherMoves(f, cost, 'father', start).length).toBeGreaterThan(0);
    }
  });
});

describe('the crow as a teacher', () => {
  const size = 7;
  const at = (x: number, y: number) => y * size + x;
  /** Trees everywhere, home at (1, 1), the given tiles open. */
  const corridor = (open: [number, number, number][]) => {
    const tiles = new Array(size * size).fill(TREE);
    tiles[at(1, 1)] = HOME;
    for (const [x, y, t] of open) tiles[at(x, y)] = t;
    return forestFromTiles('CROW', size, tiles);
  };

  it('walks straight home when nothing is in the way, the longer way first', () => {
    // From (4, 3): left is the longer way (3 against 2), so the crow goes left along row 3, then up.
    const f = corridor([[2, 1, PATH], [2, 2, PATH], [2, 3, PATH], [3, 3, PATH], [4, 3, PATH], [1, 2, PATH], [1, 3, PATH]]);
    expect(crowMoves(f, at(4, 3))).toEqual({ moves: [3], flies: false });
    const walk = walkLesson(f, 'crow', costToHome(f, 'father'), at(4, 3), mulberry32(1));
    expect(walk.positions.at(-1)).toBe(f.home);
    expect(endsStuck(walk)).toBe(false);
    expect(walk.history.moves.length).toBe(5);
  });

  it('flies over a tree and leaves her stuck: the last move is into the tree', () => {
    // From (3, 3) the way home is up or left, both trees; the parents go round by (4, 3).
    const f = corridor([[2, 1, PATH], [3, 1, PATH], [4, 1, PATH], [4, 2, PATH], [4, 3, PATH], [3, 3, PATH]]);
    expect(startTiles(f)).toContain(at(3, 3));
    expect(crowMoves(f, at(3, 3))).toEqual({ moves: [0, 3], flies: true });
    const walk = walkLesson(f, 'crow', costToHome(f, 'father'), at(3, 3), mulberry32(1));
    expect(endsStuck(walk)).toBe(true);
    expect(walk.positions).toEqual([at(3, 3), at(3, 3)]);
    expect(walk.history.moves.length).toBe(1);
    expect(walk.history.views.length).toBe(1);
    expect(step(f, at(3, 3), walk.history.moves[0]).result).toBe('blocked');
  });

  it('never steps onto a wolf den: with only a den ahead, the lesson ends', () => {
    const f = corridor([[2, 1, WOLF], [3, 1, PATH], [3, 2, PATH], [2, 2, PATH], [1, 2, PATH]]);
    expect(crowMoves(f, at(3, 1))).toEqual({ moves: [], flies: false });
    const walk = walkLesson(f, 'crow', costToHome(f, 'father'), at(3, 1), mulberry32(1));
    expect(walk.history.moves.length).toBe(0);
    expect(endsStuck(walk)).toBe(false);
  });

  it('in generated forests every move heads home, and lessons end at home, at a tree or before a den', () => {
    for (const code of ['KARKULKA', 'ABCDEF', 'ZZ9922']) {
      const f = generateForest(code);
      const cost = costToHome(f, 'father');
      for (const start of startTiles(f)) {
        const walk = walkLesson(f, 'crow', cost, start, mulberry32(2));
        walk.history.moves.forEach((m, i) => expect(headsHome(f, walk.positions[i], m)).toBe(true));
        expect(walk.positions.some((p) => f.tiles[p] === WOLF)).toBe(false);
        const end = walk.positions.at(-1)!;
        if (end === f.home || endsStuck(walk)) expect(walk.history.views.length).toBe(walk.history.moves.length);
        else expect(crowMoves(f, end).moves).toEqual([]);
      }
    }
  });
});

describe('Grandma and the magpie as teachers', () => {
  const size = 8;
  const at = (x: number, y: number) => y * size + x;
  // Home at (1, 1), a path along row 1 to (6, 1), with two side pockets below it: (3, 2) and (5, 2).
  const pockets = (a: number, b: number) => {
    const tiles = new Array(size * size).fill(TREE);
    tiles[at(1, 1)] = HOME;
    for (let x = 2; x <= 6; x++) tiles[at(x, 1)] = PATH;
    tiles[at(3, 2)] = a;
    tiles[at(5, 2)] = b;
    return forestFromTiles('ERRAND', size, tiles);
  };

  it('Grandma fetches flowers first, then walks home; the mother walks straight past', () => {
    const f = pockets(FLOWERS, PATH);
    const start = at(6, 1);
    const grandma = walkLesson(f, 'grandma', costToHome(f, 'grandma'), start, mulberry32(1));
    expect(grandma.positions).toEqual([start, at(5, 1), at(4, 1), at(3, 1), at(3, 2), at(3, 1), at(2, 1), f.home]);
    expect(grandma.history.baskets.map((b) => b.flowers)).toEqual([0, 0, 0, 0, 1, 1, 1]);
    const mother = walkLesson(f, 'mother', costToHome(f, 'mother'), start, mulberry32(1));
    expect(mother.positions).not.toContain(at(3, 2));
  });

  it('the magpie collects every treasure it can reach, then walks home', () => {
    const f = pockets(TREASURE, TREASURE);
    const walk = walkLesson(f, 'magpie', costToHome(f, 'magpie'), at(6, 1), mulberry32(1));
    expect(walk.positions).toContain(at(5, 2));
    expect(walk.positions).toContain(at(3, 2));
    expect(walk.positions.at(-1)).toBe(f.home);
    expect(walk.history.baskets.at(-1)!.treasure).toBe(2);
  });

  it('in generated forests they always end at home and never step onto a den', () => {
    for (const code of ['KARKULKA', 'ABCDEF', 'ZZ9922']) {
      const f = generateForest(code);
      for (const teacher of ['grandma', 'magpie'] as const) {
        const cost = costToHome(f, teacher);
        for (const start of startTiles(f)) {
          const walk = walkLesson(f, teacher, cost, start, mulberry32(3));
          expect(walk.positions.at(-1)).toBe(f.home);
          expect(walk.positions.some((p) => f.tiles[p] === WOLF)).toBe(false);
          expect(walk.history.views.length).toBe(walk.history.moves.length);
        }
      }
    }
  });
});

describe('the huntsman as a teacher', () => {
  it('goes out of his way to see a den, then walks home', () => {
    const size = 8;
    const at = (x: number, y: number) => y * size + x;
    // Home at (1, 1), a path along row 1 to (6, 1); a side path from (5, 1) down to (5, 4), with a den at (6, 5).
    const tiles = new Array(size * size).fill(TREE);
    tiles[at(1, 1)] = HOME;
    for (let x = 2; x <= 6; x++) tiles[at(x, 1)] = PATH;
    for (let y = 2; y <= 4; y++) tiles[at(5, y)] = PATH;
    tiles[at(6, 5)] = WOLF;
    const f = forestFromTiles('HUNT', size, tiles);
    const walk = walkLesson(f, 'huntsman', costToHome(f, 'huntsman'), at(6, 1), mulberry32(1));
    expect(walk.positions).toContain(at(5, 4));
    expect(walk.positions.at(-1)).toBe(f.home);
    const father = walkLesson(f, 'father', costToHome(f, 'father'), at(6, 1), mulberry32(1));
    expect(father.positions).not.toContain(at(5, 4));
  });

  it('in generated forests he sees more dens than the father, gets home on her energy and never steps onto a den', () => {
    for (const code of ['KARKULKA', 'ABCDEF', 'ZZ9922']) {
      const f = generateForest(code);
      let hunter = 0;
      let father = 0;
      const dens = (positions: number[]) => new Set(positions.flatMap((p) => densInSight(f, p))).size;
      for (const start of startTiles(f)) {
        const walk = walkLesson(f, 'huntsman', costToHome(f, 'huntsman'), start, mulberry32(3));
        expect(walk.positions.at(-1)).toBe(f.home);
        expect(walk.positions.some((p) => f.tiles[p] === WOLF)).toBe(false);
        expect(walk.history.views.length).toBe(walk.history.moves.length);
        // His lessons start with the huntsman's energy and never run out on the way (berries can top it up).
        expect(walk.energy).toBe(HUNTSMAN_ENERGY);
        expect(walk.history.energy[0]).toBe(HUNTSMAN_ENERGY);
        expect(walk.history.energy.every((e) => e > 0)).toBe(true);
        hunter += dens(walk.positions);
        father += dens(walkLesson(f, 'father', costToHome(f, 'father'), start, mulberry32(3)).positions);
      }
      expect(hunter).toBeGreaterThan(2 * father);
    }
  });
});

describe('her basket', () => {
  // A corridor: path, den, path, den, flowers, treasure, then home at the generator's spot is irrelevant here.
  const size = 9;
  const tiles = new Array(size * size).fill(TREE);
  const at = (x: number, y: number) => y * size + x;
  for (let x = 1; x < 8; x++) tiles[at(x, 4)] = PATH;
  tiles[at(2, 4)] = WOLF;
  tiles[at(4, 4)] = WOLF;
  tiles[at(5, 4)] = FLOWERS;
  tiles[at(6, 4)] = TREASURE;
  const f = forestFromTiles('BASKET', size, tiles);

  it('the first den takes the cake, the next one eats her', () => {
    const trip = newBasketState();
    const a = step(f, at(1, 4), 1, trip);
    expect(a.result).toBe('grabbed');
    expect(a.pos).toBe(at(2, 4)); // she stands on the den and runs on
    expect(trip.basket.cake).toBe(false);
    // Off the den and back onto the same one: eaten, and the basket is lost.
    trip.basket.flowers = 1;
    expect(step(f, at(3, 4), 3, trip).result).toBe('eaten');
    expect(trip.basket).toEqual({ cake: false, flowers: 0, treasure: 0 });
    // Without a trip state every den eats her, as before the basket.
    expect(step(f, at(1, 4), 1).result).toBe('eaten');
  });

  it('flowers and treasure count once per trip each', () => {
    const trip = newBasketState();
    expect(step(f, at(4, 4), 1, trip).result).toBe('flowers');
    expect(step(f, at(5, 4), 1, trip).result).toBe('treasure');
    expect(step(f, at(6, 4), 3, trip).result).toBe('moved'); // back onto the picked flowers
    expect(trip.basket).toEqual({ cake: true, flowers: 1, treasure: 1 });
    expect(f.tiles[at(5, 4)]).toBe(FLOWERS); // tiles never change during a trip
  });

  it.each(['KARKULKA', 'ABCDEF', 'ZZ9922', 'Q1', 'WOLF'])('the generator places 2–3 of each item off both parents\' routes (%s)', (code) => {
    const g = generateForest(code);
    const flowers = g.tiles.filter((t) => t === FLOWERS).length;
    const treasure = g.tiles.filter((t) => t === TREASURE).length;
    expect(flowers).toBeGreaterThanOrEqual(2);
    expect(flowers).toBeLessThanOrEqual(3);
    expect(treasure).toBeGreaterThanOrEqual(2);
    expect(treasure).toBeLessThanOrEqual(3);
    const used = parentRouteTiles(g);
    g.tiles.forEach((t, i) => { if (isItem(t)) expect(used.has(i)).toBe(false); });
    // Off their routes, so the parents walk home from every other tile without picking anything up.
    for (const teacher of ['mother', 'father'] as const) {
      const cost = costToHome(g, teacher);
      for (const i of walkableTiles(g)) {
        if (isItem(g.tiles[i])) continue;
        const walk = walkLesson(g, teacher, cost, i, mulberry32(1));
        expect(walk.positions.at(-1)).toBe(g.home);
        expect(walk.positions.some((p) => isItem(g.tiles[p]) || g.tiles[p] === WOLF)).toBe(false);
      }
    }
  });

  it('the parents walk over an item in their way and pick it up, as she would', () => {
    // A corridor: home, path, flowers, path, path; everything else is trees.
    const size = 9;
    const tiles = new Array(size * size).fill(TREE);
    const at = (x: number, y: number) => y * size + x;
    tiles[at(1, 1)] = HOME;
    [2, 4, 5].forEach((x) => { tiles[at(x, 1)] = PATH; });
    tiles[at(3, 1)] = FLOWERS;
    const f = forestFromTiles('ITEM', size, tiles);
    expect(startTiles(f)).toContain(at(5, 1));
    for (const teacher of ['mother', 'father', 'wolf'] as const) {
      const walk = walkLesson(f, teacher, costToHome(f, teacher), at(5, 1), mulberry32(1));
      expect(walk.positions.at(-1)).toBe(f.home);
      expect(walk.history.baskets.map((b) => b.flowers)).toEqual([0, 0, 1, 1]);
      expect(walk.history.baskets.every((b) => b.cake && b.treasure === 0)).toBe(true);
    }
  });

  it('most forests have a wolf den that is a real shortcut', () => {
    const codes = ['KARKULKA', 'ABCDEF', 'ZZ9922', 'Q1', 'WOLF', 'A', 'B', 'C'];
    const withShortcut = codes.filter((c) => {
      const g = generateForest(c);
      const d = walkingDistances(g);
      return g.tiles.some((t, i) => t === WOLF && shortcutSaving(g, i, d) >= SHORTCUT_MIN_SAVING);
    });
    expect(withShortcut.length).toBeGreaterThanOrEqual(6);
  });
});

describe('forest links', () => {
  it('pack and unpack edited tiles, swamps and items included', () => {
    const f = generateForest('LINK');
    expect(f.tiles).toContain(SWAMP);
    expect(f.tiles).toContain(FLOWERS);
    expect(f.tiles).toContain(TREASURE);
    expect(unpackTiles(packTiles(f.tiles), f.tiles.length)).toEqual(f.tiles);
    expect(unpackTiles('!!', 4)).toBeNull();
  });

  it("keep grandma's house where the player moved it", () => {
    const f = generateForest('LINK');
    const spot = pathTiles(f).find((i) => i !== f.home)!;
    const old = f.home;
    moveHome(f, spot);
    expect(f.home).toBe(spot);
    expect(f.tiles[old]).toBe(PATH);
    expect(f.tiles.filter((t) => t === HOME)).toHaveLength(1);
    const g = forestFromTiles(f.code, f.size, unpackTiles(packTiles(f.tiles), f.tiles.length)!);
    expect(g.home).toBe(spot);
    expect(energyToHome(g)[old]).toBeGreaterThan(0);
  });

  it('read tiles with no house or two houses as one house', () => {
    const f = generateForest('LINK');
    const none = f.tiles.map((t) => (t === HOME ? PATH : t));
    expect(forestFromTiles(f.code, f.size, none).home).toBe(homeIndex(f.size));
    const two = f.tiles.slice();
    two[pathTiles(f)[0]] = HOME;
    const g = forestFromTiles(f.code, f.size, two);
    expect(g.tiles.filter((t) => t === HOME)).toHaveLength(1);
    expect(g.tiles[g.home]).toBe(HOME);
  });
});

describe('shared helpers', () => {
  it('builds the same forest from saved tiles as the generator', () => {
    const f = generateForest('ABCDEF');
    expect(forestFromTiles(f.code, f.size, f.tiles.slice())).toEqual(f);
  });

  it('finds the energy home with the shared cheapest-route search', () => {
    const f = generateForest('KARKULKA');
    const e = energyToHome(f);
    const plain = cheapestToHome(f, (i) => stepCost(f.tiles[i]));
    f.tiles.forEach((t, i) => { if (t !== WOLF) expect(e[i]).toBe(plain[i]); });
    // A den (where she stands once the wolf took the cake) counts from its cheapest neighbour.
    const den = f.tiles.findIndex((t, i) => t === WOLF && Number.isFinite(e[i]));
    expect(den).toBeGreaterThanOrEqual(0);
    const off = [0, 1, 2, 3].map((m) => neighbor(f, den, m as 0)).filter((v) => v >= 0 && f.tiles[v] !== WOLF);
    expect(e[den]).toBe(Math.min(...off.map((v) => plain[v] + stepCost(f.tiles[v]))));
    // With every step costing 1 it agrees with the plain walking distance.
    const steps = cheapestToHome(f, () => 1);
    const d = walkingDistances(f);
    for (const i of walkableTiles(f)) expect(steps[i]).toBe(d[i]);
  });

  it('counts a den from its cheapest neighbour plus the step onto it, never through another den', () => {
    // Row 1: home, swamp, den A, den B, then trees; everything else is trees.
    const size = 9;
    const tiles = new Array(size * size).fill(TREE);
    const at = (x: number, y: number) => y * size + x;
    tiles[at(1, 1)] = HOME;
    tiles[at(2, 1)] = SWAMP;
    tiles[at(3, 1)] = WOLF;
    tiles[at(4, 1)] = WOLF;
    const f = forestFromTiles('DENS', size, tiles);
    const e = energyToHome(f);
    expect(e[at(2, 1)]).toBe(1);
    // Off den A onto the swamp (3), then home (1).
    expect(e[at(3, 1)]).toBe(1 + SWAMP_COST);
    // Den B only touches den A: stepping there without the cake eats her.
    expect(e[at(4, 1)]).toBe(Infinity);
  });
});
