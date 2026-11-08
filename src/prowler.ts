/**
 * The walking wolf (an option): a wolf who leaves his den and walks about the forest during a
 * trip, a lesson or a practice run. To her he looks just like a wolf den: in her view his tile
 * is a den token, so the model's inputs stay the same. Only the board draws him as a wolf.
 * He meets her by the same rule as a den: with the cake he takes it and goes off to eat it;
 * without it he eats her.
 */
import { Rng, mulberry32 } from './rng';
import { BasketState, Forest, MOVES, StepResult, Tile, VIEW_OFFSETS, WOLF, densInSight, isWalkable, neighbor, tilesWhere, viewAt, xyOf } from './world';

/** He takes one step for every this many of hers, so she can get away. */
export const WOLF_PACE = 2;
/** He follows her while she is this close (in tiles, diagonals count as one): he smells her. */
export const WOLF_NOSE = 1;
/** He starts at least this many steps away from where she starts. */
export const WOLF_START_GAP = 6;

/** Tiles he walks on: the same as hers (never grandma's house, never back into a den). */
const open = (f: Forest, i: number): boolean => i >= 0 && isWalkable(f.tiles[i]);

/** Distance in tiles with diagonals counting as one (how far apart in her 3×3 view). */
export function closeness(f: Forest, a: number, b: number): number {
  const [ax, ay] = xyOf(f, a);
  const [bx, by] = xyOf(f, b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Steps from `from` to every tile he can walk on (her tile counts even if she stands on a den). */
function stepsFrom(f: Forest, from: number): Int32Array {
  const d = new Int32Array(f.tiles.length).fill(-1);
  d[from] = 0;
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const u = queue[q];
    for (const m of MOVES) {
      const v = neighbor(f, u, m);
      if (d[v] < 0 && open(f, v)) { d[v] = d[u] + 1; queue.push(v); }
    }
  }
  return d;
}

/** Where he comes out: next to a den if he can, well away from her start. -1: nowhere (he stays home). */
export function wolfStart(f: Forest, herStart: number, rng: Rng): number {
  const d = stepsFrom(f, herStart);
  const far = tilesWhere(f, (t, i) => isWalkable(t) && d[i] >= WOLF_START_GAP);
  const byDen = far.filter((i) => densInSight(f, i).length > 0);
  const from = byDen.length ? byDen : far;
  return from.length ? from[Math.floor(rng() * from.length)] : -1;
}

export class WalkingWolf {
  /** His tile, or -1 once he has gone off with the cake (or never came out). */
  pos: number;
  /** His tile at each of her positions (-1: gone), aligned with her positions. */
  readonly path: number[];
  private prev = -1;
  private ticks = 0;
  /** He has seen her and is after her. */
  private alert = false;

  constructor(readonly forest: Forest, herStart: number, private readonly rng: Rng) {
    this.pos = wolfStart(forest, herStart, rng);
    this.path = [this.pos];
  }

  get here(): boolean { return this.pos >= 0; }

  /** His turn, after one of her steps: every WOLF_PACE steps he walks one tile, after her if he smells her. */
  private walk(her: number) {
    if (!this.here) return;
    const f = this.forest;
    // When he first sees her he stops and looks up, so she always gets a step to see him and run.
    const near = closeness(f, this.pos, her) <= WOLF_NOSE;
    if (near && !this.alert) { this.alert = true; return; }
    this.alert = near;
    if (++this.ticks % WOLF_PACE) return;
    const next = MOVES.map((m) => neighbor(f, this.pos, m)).filter((n) => open(f, n) || n === her);
    if (!next.length) return;
    let to: number;
    if (near) {
      const d = stepsFrom(f, her);
      const best = Math.min(...next.map((n) => (n === her ? 0 : d[n] < 0 ? Infinity : d[n])));
      const ways = next.filter((n) => (n === her ? 0 : d[n] < 0 ? Infinity : d[n]) === best);
      to = best < Infinity ? ways[Math.floor(this.rng() * ways.length)] : this.pos;
    } else {
      // Wandering: on along the path, back only at a dead end.
      const onward = next.filter((n) => n !== this.prev && n !== her);
      const from = onward.length ? onward : next.filter((n) => n !== her);
      to = from.length ? from[Math.floor(this.rng() * from.length)] : this.pos;
    }
    this.prev = this.pos;
    this.pos = to;
  }

  /**
   * After one of her steps (she is now at `her`, `result` is what the step did): if she walked
   * into him, or he walks into her, he meets her. Returns what the step did then: `grabbed`
   * (he takes the cake and goes) or `eaten`, else `result` unchanged.
   */
  after(her: number, result: StepResult, trip: BasketState): StepResult {
    if (this.here && result !== 'home' && result !== 'eaten') {
      if (her !== this.pos) this.walk(her);
      if (her === this.pos) result = meet(trip, this);
    }
    this.path.push(this.pos);
    return result;
  }

  /** He goes off with the cake, back to his den, for the rest of the walk. */
  leave() { this.pos = -1; }
}

/** The wolf meets her: the cake if she has it (and he leaves), otherwise she is eaten. */
function meet(trip: BasketState, wolf: WalkingWolf): StepResult {
  if (trip.basket.cake) {
    trip.basket.cake = false;
    wolf.leave();
    return 'grabbed';
  }
  trip.basket = { cake: false, flowers: 0, treasure: 0 };
  return 'eaten';
}

/** What she sees at `pos`: the 8 tiles around her, with the walking wolf shown as a den. */
export function viewWithWolf(f: Forest, pos: number, wolf: WalkingWolf | null): Tile[] {
  const view = viewAt(f, pos);
  if (!wolf?.here) return view;
  const [x, y] = xyOf(f, pos);
  const [wx, wy] = xyOf(f, wolf.pos);
  const k = VIEW_OFFSETS.findIndex(([dx, dy]) => x + dx === wx && y + dy === wy);
  if (k >= 0) view[k] = WOLF;
  return view;
}

/** A walking wolf for a walk from `start`, when the forest has one; its own randomness comes from `rng`. */
export function wolfFor(f: Forest, start: number, rng: Rng): WalkingWolf | null {
  if (!f.wolfWalks) return null;
  const seed = Math.floor(rng() * 2 ** 32) >>> 0;
  const w = new WalkingWolf(f, start, mulberry32(seed));
  return w.here ? w : null;
}
