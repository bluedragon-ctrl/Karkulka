/** World rules: tiles, moves, what she sees, and distances home. */
import { mulberry32 } from './rng';

export const PATH = 0;
export const TREE = 1;
export const WOLF = 2;
export const HOME = 3;
export const SWAMP = 4;
export const FLOWERS = 5;
export const TREASURE = 6;
export type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const TILE_KINDS = 7;
export const TILE_NAMES = ['path', 'tree', 'wolf den', "grandma's house", 'swamp', 'flowers', 'treasure'] as const;

/**
 * Not a tile: a walking wolf as she sees him. Her views (`History.views`) always record him as
 * WALKER; whether the model can tell him from a den depends on its inputs (`ModelConfig.wolfToken`).
 * Never in the forest's tiles, so links and forest codes are not touched.
 */
export const WALKER = 7;
/** What one place in her view can show: a tile, or a walking wolf. */
export type Seen = Tile | typeof WALKER;
/** Kinds a view can show when she tells walking wolves from dens: the tiles plus WALKER. */
export const VIEW_KINDS = TILE_KINDS + 1;

/** Tiles she picks something up from (once per trip each). */
export const isItem = (t: Tile): boolean => t === FLOWERS || t === TREASURE;

/** Energy one step costs when she walks onto a tile (a blocked move costs 1). */
export const SWAMP_COST = 3;
export const stepCost = (t: Tile): number => (t === SWAMP ? SWAMP_COST : 1);

/** Tiles she can stand on during a trip (home and dens end it). */
export const isWalkable = (t: Tile): boolean => t === PATH || t === SWAMP || t === FLOWERS || t === TREASURE;

/**
 * Her basket: the cake she sets out with, and what she picked up on the way.
 * It is shown to the model as pinned tokens (see `tokens.ts`).
 */
export interface Basket { cake: boolean; flowers: number; treasure: number }
export const fullBasket = (): Basket => ({ cake: true, flowers: 0, treasure: 0 });

/** The basket during a trip, with the item tiles already picked (each counts once). */
export interface BasketState { basket: Basket; picked: number[] }
export const newBasketState = (): BasketState => ({ basket: fullBasket(), picked: [] });

/** Starting on flowers or treasure, she picks them up before her first move (trips alone, lessons and practice alike). */
export function pickUpAtStart(f: Forest, start: number, trip: BasketState) {
  const t = f.tiles[start];
  if (!isItem(t) || trip.picked.includes(start)) return;
  trip.picked.push(start);
  if (t === FLOWERS) trip.basket.flowers++;
  else trip.basket.treasure++;
}

/** What a forest event can do to her basket on a trip alone: take the cake, give flowers, give a treasure. */
export const EFFECTS = ['takeCake', 'giveFlowers', 'giveTreasure'] as const;
export type Effect = typeof EFFECTS[number];

/**
 * A forest event's effect on her basket, exactly like the same change by a tile: the cake gone
 * as when the wolf grabs it (so the next den eats her), one bunch of flowers or one treasure.
 * False when there is nothing to change (no cake left to take).
 */
export function applyEffect(b: Basket, e: Effect): boolean {
  if (e === 'takeCake') {
    if (!b.cake) return false;
    b.cake = false;
  } else if (e === 'giveFlowers') b.flowers++;
  else b.treasure++;
  return true;
}

/** Moves are the output tokens: up, right, down, left. */
export type Move = 0 | 1 | 2 | 3;
export const MOVES: readonly Move[] = [0, 1, 2, 3];
export const MOVE_NAMES = ['up', 'right', 'down', 'left'] as const;
export const MOVE_ARROWS = ['↑', '→', '↓', '←'] as const;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

/** The 8 tiles around her, in reading order (her own tile is the centre). */
export const VIEW_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export const DEFAULT_SIZE = 15;

export interface Forest {
  size: number;
  tiles: Tile[];
  home: number;
  code: string;
  /** How many walking wolves are out (an option, not part of the forest code or its tiles; see `prowler.ts`). */
  wolves?: number;
  /**
   * The chance (0 to 1) that a den's wolf is out each time she steps onto it on a trip alone or a
   * practice run (an option, like `wolves`; never in lessons). Missing: 0, the wolf is always home.
   */
  wolfOut?: number;
}

export const homeIndex = (size: number): number => 3 * size + (size - 4);

/** A forest from known tiles (a save, a link or a file), without running the generator. */
/**
 * A forest from saved or linked tiles. Home is wherever the house tile is (the player may
 * have moved it); without one it goes to the generator's spot. Extra house tiles become path.
 */
export function forestFromTiles(code: string, size: number, tiles: Tile[]): Forest {
  let home = tiles.indexOf(HOME);
  if (home < 0) home = homeIndex(size);
  tiles.forEach((t, i) => { if (t === HOME && i !== home) tiles[i] = PATH; });
  tiles[home] = HOME;
  return { size, tiles, home, code };
}

/** Move grandma's house to tile `i`; the old spot becomes path. */
export function moveHome(f: Forest, i: number) {
  if (i === f.home) return;
  f.tiles[f.home] = PATH;
  f.tiles[i] = HOME;
  f.home = i;
}
export const xyOf = (f: Forest, i: number): [number, number] => [i % f.size, Math.floor(i / f.size)];

/** Tiles outside the map behave like trees. */
export function tileAt(f: Forest, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= f.size || y >= f.size) return TREE;
  return f.tiles[y * f.size + x];
}

/** Whether a move from tile `from` points towards home in a straight line (whatever is in the way). */
export function headsHome(f: Forest, from: number, m: Move): boolean {
  const [x, y] = xyOf(f, from);
  const [hx, hy] = xyOf(f, f.home);
  return DX[m] * (hx - x) + DY[m] * (hy - y) > 0;
}

export function neighbor(f: Forest, pos: number, m: Move): number {
  const x = (pos % f.size) + DX[m];
  const y = Math.floor(pos / f.size) + DY[m];
  if (x < 0 || y < 0 || x >= f.size || y >= f.size) return -1;
  return y * f.size + x;
}

/**
 * `grabbed`: the wolf took the cake and she ran on; `empty`: she stepped onto a den while the
 * wolf was out, so nothing happened and she ran on; `flowers`, `treasure`: she picked some up.
 */
export type StepResult = 'moved' | 'blocked' | 'home' | 'eaten' | 'grabbed' | 'empty' | 'flowers' | 'treasure';

/** Whether the wolf is out this time she steps onto a den: one roll per step onto a den. */
export type WolfOutRoll = () => boolean;

/**
 * The rolls for one walk in `f`, with randomness of their own drawn from `rng`, or undefined when
 * the wolf is always home (then nothing is drawn from `rng`, so every walk is as it was without the option).
 */
export function wolfOutRolls(f: Forest, rng: () => number): WolfOutRoll | undefined {
  const chance = Math.min(1, Math.max(0, f.wolfOut ?? 0));
  if (!(chance > 0)) return undefined;
  const own = mulberry32(Math.floor(rng() * 2 ** 32) >>> 0);
  // Read each time, so moving the slider during a trip counts from the next den on.
  return () => own() < Math.min(1, Math.max(0, f.wolfOut ?? 0));
}

/**
 * One step and the energy it costs. A move into a tree (or off the map) is
 * blocked: she stays put and it still costs 1. Wading into a swamp costs more.
 * With a trip state, the basket counts: the first den she steps onto takes the
 * cake instead of her (she stands on the den and runs on), and item tiles fill
 * the basket once each. Without one, every den eats her. With `wolfOut` (and a trip state), each
 * step onto a den first asks whether the wolf is out: then nothing happens and she runs on, cake and all.
 */
export function step(f: Forest, pos: number, m: Move, trip?: BasketState, wolfOut?: WolfOutRoll): { pos: number; result: StepResult; cost: number } {
  const n = neighbor(f, pos, m);
  if (n < 0) return { pos, result: 'blocked', cost: 1 };
  const t = f.tiles[n];
  if (t === TREE) return { pos, result: 'blocked', cost: 1 };
  if (t === WOLF) {
    if (trip && wolfOut?.()) return { pos: n, result: 'empty', cost: 1 };
    if (trip?.basket.cake) {
      trip.basket.cake = false;
      return { pos: n, result: 'grabbed', cost: 1 };
    }
    if (trip) trip.basket = { cake: false, flowers: 0, treasure: 0 };
    return { pos: n, result: 'eaten', cost: 1 };
  }
  if (t === HOME) return { pos: n, result: 'home', cost: 1 };
  if (trip && isItem(t) && !trip.picked.includes(n)) {
    trip.picked.push(n);
    if (t === FLOWERS) trip.basket.flowers++;
    else trip.basket.treasure++;
    return { pos: n, result: t === FLOWERS ? 'flowers' : 'treasure', cost: 1 };
  }
  return { pos: n, result: 'moved', cost: stepCost(t) };
}

/** What she sees: the 8 surrounding tiles. She never sees coordinates. */
export function viewAt(f: Forest, pos: number): Tile[] {
  const x = pos % f.size;
  const y = Math.floor(pos / f.size);
  return VIEW_OFFSETS.map(([dx, dy]) => tileAt(f, x + dx, y + dy));
}

/** Rough direction home in 8 compass sectors (0 = east, counter-clockwise). */
export function homeSector(f: Forest, pos: number): number {
  const [x, y] = xyOf(f, pos);
  const [hx, hy] = xyOf(f, f.home);
  const angle = Math.atan2(y - hy, hx - x); // y grows downwards, so flip it
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}
export const SECTOR_NAMES = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'] as const;
export const SECTOR_WORDS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'] as const;

export function nearWolf(f: Forest, i: number): boolean {
  const [x, y] = xyOf(f, i);
  return VIEW_OFFSETS.some(([dx, dy]) => tileAt(f, x + dx, y + dy) === WOLF);
}

/** The wolf dens in sight from tile i (in the 8 tiles around it). */
export function densInSight(f: Forest, i: number): number[] {
  const [x, y] = xyOf(f, i);
  const out: number[] = [];
  for (const [dx, dy] of VIEW_OFFSETS) if (tileAt(f, x + dx, y + dy) === WOLF) out.push((y + dy) * f.size + x + dx);
  return out;
}

/** Walking distance home in steps, never through wolf dens (swamps count as one step). -1 = unreachable. */
export function walkingDistances(f: Forest): Int32Array {
  const dist = new Int32Array(f.tiles.length).fill(-1);
  dist[f.home] = 0;
  const queue = [f.home];
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi];
    for (const m of MOVES) {
      const v = neighbor(f, u, m);
      if (v < 0 || dist[v] >= 0 || !isWalkable(f.tiles[v])) continue;
      dist[v] = dist[u] + 1;
      queue.push(v);
    }
  }
  return dist;
}

/**
 * Cheapest cost to reach any of `targets` from every tile (Dijkstra), where `enterCost(i)`
 * is what one step onto tile i costs. Only walkable tiles are entered. Infinity = unreachable.
 */
export function cheapestTo(f: Forest, targets: readonly number[], enterCost: (i: number) => number): Float64Array {
  const n = f.tiles.length;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  for (const t of targets) dist[t] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    const c = enterCost(u);
    for (const m of MOVES) {
      const v = neighbor(f, u, m);
      if (v >= 0 && isWalkable(f.tiles[v]) && dist[u] + c < dist[v]) dist[v] = dist[u] + c;
    }
  }
  return dist;
}

/** Cheapest cost home from every tile; see `cheapestTo`. */
export const cheapestToHome = (f: Forest, enterCost: (i: number) => number): Float64Array => cheapestTo(f, [f.home], enterCost);

/**
 * Energy needed to walk home from each tile along the cheapest route (swamps cost more). Infinity = unreachable.
 * A den tile (where she stands after the wolf took the cake) counts from its cheapest
 * neighbour, plus the step onto it. Never through another den: without the cake that eats her.
 */
export function energyToHome(f: Forest): Float64Array {
  const walk = cheapestToHome(f, (i) => stepCost(f.tiles[i]));
  const e = walk.slice();
  f.tiles.forEach((t, i) => {
    if (t !== WOLF) return;
    for (const m of MOVES) {
      const v = neighbor(f, i, m);
      if (v < 0 || f.tiles[v] === WOLF) continue;
      const c = walk[v] + stepCost(f.tiles[v]);
      if (c < e[i]) e[i] = c;
    }
  });
  return e;
}

/** Indices of the tiles that pass a test. */
export function tilesWhere(f: Forest, test: (t: Tile, i: number) => boolean): number[] {
  const out: number[] = [];
  f.tiles.forEach((t, i) => { if (test(t, i)) out.push(i); });
  return out;
}

/** Plain path tiles: where lessons and trips start. */
export const pathTiles = (f: Forest): number[] => tilesWhere(f, (t) => t === PATH);

export const walkableTiles = (f: Forest): number[] => tilesWhere(f, isWalkable);

/** Path or swamp tiles from which home cannot be reached without crossing a den. */
export function unreachableTiles(f: Forest): number[] {
  const d = walkingDistances(f);
  return walkableTiles(f).filter((i) => d[i] < 0);
}

/**
 * Number of independent loops in the walkable forest (dens and trees excluded):
 * edges − tiles + 1. Zero means exactly one route between any two places.
 */
export function loopCount(f: Forest): number {
  const open = (i: number) => isWalkable(f.tiles[i]) || f.tiles[i] === HOME;
  let tiles = 0;
  let edges = 0;
  for (let i = 0; i < f.tiles.length; i++) {
    if (!open(i)) continue;
    tiles++;
    const r = neighbor(f, i, 1);
    const d = neighbor(f, i, 2);
    if (r >= 0 && open(r)) edges++;
    if (d >= 0 && open(d)) edges++;
  }
  return edges - tiles + 1;
}

export function copyForest(f: Forest): Forest {
  return { ...f, tiles: f.tiles.slice() };
}

/** Whether every path and swamp tile can reach home without crossing a den. */
export function allReachable(f: Forest): boolean {
  const d = walkingDistances(f);
  return f.tiles.every((t, i) => !isWalkable(t) || d[i] >= 0);
}
