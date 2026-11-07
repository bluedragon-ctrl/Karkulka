import { describe, expect, it } from 'vitest';
import { disagreement, generateForest } from '../src/forest';
import { packTiles, unpackTiles } from '../src/storage';
import { costToHome, teacherMoves, walkLesson } from '../src/teachers';
import { mulberry32 } from '../src/rng';
import {
  HOME, PATH, SWAMP, SWAMP_COST, TREE, WOLF, cheapestToHome, energyToHome, forestFromTiles, homeIndex, stepCost, loopCount, walkableTiles, homeSector, neighbor, pathTiles, step, tileAt, unreachableTiles, viewAt, walkingDistances,
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

describe('forest links', () => {
  it('pack and unpack edited tiles, swamps included', () => {
    const f = generateForest('LINK');
    expect(f.tiles).toContain(SWAMP);
    expect(unpackTiles(packTiles(f.tiles), f.tiles.length)).toEqual(f.tiles);
    expect(unpackTiles('!!', 4)).toBeNull();
  });
});

describe('shared helpers', () => {
  it('builds the same forest from saved tiles as the generator', () => {
    const f = generateForest('ABCDEF');
    expect(forestFromTiles(f.code, f.size, f.tiles.slice())).toEqual(f);
  });

  it('finds the energy home with the shared cheapest-route search', () => {
    const f = generateForest('KARKULKA');
    expect(energyToHome(f)).toEqual(cheapestToHome(f, (i) => stepCost(f.tiles[i])));
    // With every step costing 1 it agrees with the plain walking distance.
    const steps = cheapestToHome(f, () => 1);
    const d = walkingDistances(f);
    for (const i of walkableTiles(f)) expect(steps[i]).toBe(d[i]);
  });
});
