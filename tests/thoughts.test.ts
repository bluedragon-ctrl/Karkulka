import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng';
import type { Outcome } from '../src/sim';
import { LIKELY, SURE, Thoughts, TripState, UNSURE, placeWord, moveWord } from '../src/thoughts';
import { Forest, HOME, Move, PATH, Tile, TREE, WOLF, forestFromTiles, homeIndex } from '../src/world';

const SIZE = 9;
const at = (x: number, y: number) => y * SIZE + x;

/** An open 9 × 9 forest with home at (5, 3) and the given extra tiles. */
function forest(extra: [number, number, Tile][] = []): Forest {
  const tiles: Tile[] = new Array(SIZE * SIZE).fill(PATH);
  tiles[homeIndex(SIZE)] = HOME;
  for (const [x, y, t] of extra) tiles[at(x, y)] = t;
  return forestFromTiles('TEST', SIZE, tiles);
}

/** A trip state after the given moves from `start`, with the same probability for every move. */
function trip(f: Forest, start: number, moves: Move[], o: { p?: number; outcome?: Outcome; energyLeft?: number; blocked?: boolean[]; positions?: number[] } = {}): TripState {
  const positions = o.positions ?? [start];
  if (!o.positions) {
    let pos = start;
    for (const m of moves) {
      pos += [-SIZE, 1, SIZE, -1][m];
      positions.push(pos);
    }
  }
  const tempered = [0, 0, 0, 0];
  for (const m of moves) tempered[m] = o.p ?? 0.5;
  return {
    forest: f, positions, history: { moves, sectors: positions.map(() => 0) },
    blocked: o.blocked ?? moves.map(() => false), decisions: moves.map(() => ({ tempered })),
    energy: 80, energyLeft: o.energyLeft ?? 80 - moves.length, outcome: o.outcome ?? null,
    pos: positions[positions.length - 1], t: moves.length,
  };
}

const always = () => 0;
const never = () => 0.99;
const fill = (lines: readonly (string | ((d: string) => string))[], d: string) => lines.map((l) => (typeof l === 'string' ? l : l(d)));

describe('her thoughts on a trip alone', () => {
  it('names directions like the move arrows: up is north', () => {
    expect(moveWord(0)).toBe('up');
    expect(moveWord(1)).toBe('right');
    expect(moveWord(2)).toBe('down');
    expect(moveWord(3)).toBe('left');
    expect(placeWord(0, -1)).toBe('above me');
    expect(placeWord(0, 1)).toBe('below me');
    expect(placeWord(-1, 0)).toBe('to my left');
    expect(placeWord(1, 1)).toBe('down on my right');
    expect(placeWord(-1, -1)).toBe('up on my left');
  });

  it('thinks about a wolf den she saw, then about the move she already picked', () => {
    const f = forest([[1, 7, WOLF]]);
    // From (1, 6) she sees the den below her and goes right.
    const lines = new Thoughts(always).after(trip(f, at(1, 6), [1]));
    expect(lines).toHaveLength(2);
    expect(lines![0]).toMatch(/wolf|Monster|growls/i);
    expect(lines![1]).toMatch(/right/i);
  });

  it('can say "Scary wolf below me! Let\'s go down." just before she is eaten', () => {
    const f = forest([[1, 7, WOLF]]);
    const lines = new Thoughts(always).after(trip(f, at(1, 6), [2], { outcome: 'eaten' }));
    expect(lines).toHaveLength(2);
    expect(lines![1]).toMatch(/down/i);
  });

  it('thinks about each den only once', () => {
    const f = forest([[1, 7, WOLF]]);
    const th = new Thoughts(always);
    expect(th.after(trip(f, at(1, 6), [1]))![0]).toMatch(/wolf|Monster|growls/i);
    // Two steps later the same den is still in view, but she has moved on in her head.
    const later = th.after(trip(f, at(1, 6), [1, 3, 1], { positions: [at(1, 6), at(2, 6), at(1, 6), at(2, 6)] }));
    expect(later?.[0] ?? '').not.toMatch(/wolf|Monster|growls/i);
  });

  it('sounds as sure as the probability of her move', () => {
    const f = forest();
    const said = (p: number, seed: number) => new Thoughts(mulberry32(seed)).after(trip(f, at(1, 1), [1, 1, 1, 1, 1, 1], { p }));
    for (let seed = 0; seed < 40; seed++) {
      const sure = said(0.9, seed);
      if (sure) expect(fill(SURE, 'right')).toContain(sure[0]);
      const likely = said(0.6, seed);
      if (likely) expect(fill(LIKELY, 'right')).toContain(likely[0]);
      const unsure = said(0.2, seed);
      if (unsure) expect(fill(UNSURE, 'right')).toContain(unsure[0]);
    }
  });

  it('stays quiet on most ordinary steps', () => {
    const f = forest();
    expect(new Thoughts(never).after(trip(f, at(1, 1), [1, 1, 1, 1, 1, 1, 1]))).toBeNull();
    // Just after a thought she waits a few steps before chatting again.
    const th = new Thoughts(always);
    expect(th.after(trip(f, at(1, 1), [1, 1, 1, 1, 1, 1]))).not.toBeNull();
    expect(th.after(trip(f, at(1, 1), [1, 1, 1, 1, 1, 1, 1]))).toBeNull();
  });

  it('says ouch after walking into a tree', () => {
    const f = forest([[2, 1, TREE]]);
    const lines = new Thoughts(always).after(trip(f, at(1, 1), [1], { positions: [at(1, 1), at(1, 1)], blocked: [true] }));
    expect(lines).not.toBeNull();
    expect(lines![lines!.length - 1]).toMatch(/tree|Ouch/i);
  });

  it('gets tired once per level, and sees grandma\'s house', () => {
    const f = forest();
    const th = new Thoughts(never);
    expect(th.after(trip(f, at(1, 1), [1, 1, 1], { energyLeft: 30 }))).toEqual([expect.stringMatching(/tired|long walk|there yet/)]);
    expect(th.after(trip(f, at(1, 1), [1, 1, 1, 1, 1], { energyLeft: 29 }))).toBeNull();
    expect(new Thoughts(never).after(trip(f, at(3, 3), [1]))).toEqual([expect.stringMatching(/house|home|There it is/i)]);
  });

  it('ends every trip with a thought, and varies what she says', () => {
    const f = forest();
    const seen = new Set<string>();
    for (const outcome of ['home', 'lost', 'eaten'] as const) {
      for (let seed = 0; seed < 30; seed++) {
        const lines = new Thoughts(mulberry32(seed)).after(trip(f, at(1, 1), [1], { outcome }));
        expect(lines?.length).toBeGreaterThan(0);
        seen.add(lines!.join(' '));
      }
    }
    expect(seen.size).toBeGreaterThan(6);
  });
});
