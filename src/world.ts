/** World rules: tiles, moves, what she sees, and the forest generator. */

export const PATH = 0;
export const TREE = 1;
export const WOLF = 2;
export const HOME = 3;
export const SWAMP = 4;
export type Tile = 0 | 1 | 2 | 3 | 4;
export const TILE_KINDS = 5;
export const TILE_NAMES = ['path', 'tree', 'wolf den', "grandma's house", 'swamp'] as const;

/** Energy one step costs when she walks onto a tile (a blocked move costs 1). */
export const SWAMP_COST = 3;
export const stepCost = (t: Tile): number => (t === SWAMP ? SWAMP_COST : 1);

/** Tiles she can stand on during a trip (home and dens end it). */
export const isWalkable = (t: Tile): boolean => t === PATH || t === SWAMP;

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
}

export const homeIndex = (size: number): number => 3 * size + (size - 4);
export const xyOf = (f: Forest, i: number): [number, number] => [i % f.size, Math.floor(i / f.size)];

/** Tiles outside the map behave like trees. */
export function tileAt(f: Forest, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= f.size || y >= f.size) return TREE;
  return f.tiles[y * f.size + x];
}

export function neighbor(f: Forest, pos: number, m: Move): number {
  const x = (pos % f.size) + DX[m];
  const y = Math.floor(pos / f.size) + DY[m];
  if (x < 0 || y < 0 || x >= f.size || y >= f.size) return -1;
  return y * f.size + x;
}

export type StepResult = 'moved' | 'blocked' | 'home' | 'eaten';

/**
 * One step and the energy it costs. A move into a tree (or off the map) is
 * blocked: she stays put and it still costs 1. Wading into a swamp costs more.
 */
export function step(f: Forest, pos: number, m: Move): { pos: number; result: StepResult; cost: number } {
  const n = neighbor(f, pos, m);
  if (n < 0) return { pos, result: 'blocked', cost: 1 };
  const t = f.tiles[n];
  if (t === TREE) return { pos, result: 'blocked', cost: 1 };
  if (t === WOLF) return { pos: n, result: 'eaten', cost: 1 };
  if (t === HOME) return { pos: n, result: 'home', cost: 1 };
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

export function nearWolf(f: Forest, i: number): boolean {
  const [x, y] = xyOf(f, i);
  return VIEW_OFFSETS.some(([dx, dy]) => tileAt(f, x + dx, y + dy) === WOLF);
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

/** Energy needed to walk home from each tile along the cheapest route (swamps cost more). Infinity = unreachable. */
export function energyToHome(f: Forest): Float64Array {
  const n = f.tiles.length;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  dist[f.home] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    const c = stepCost(f.tiles[u]);
    for (const m of MOVES) {
      const v = neighbor(f, u, m);
      if (v >= 0 && isWalkable(f.tiles[v]) && dist[u] + c < dist[v]) dist[v] = dist[u] + c;
    }
  }
  return dist;
}

/** Plain path tiles: where lessons and trips start. */
export function pathTiles(f: Forest): number[] {
  const out: number[] = [];
  f.tiles.forEach((t, i) => { if (t === PATH) out.push(i); });
  return out;
}

export function walkableTiles(f: Forest): number[] {
  const out: number[] = [];
  f.tiles.forEach((t, i) => { if (isWalkable(t)) out.push(i); });
  return out;
}

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

/** Generate the forest for a code: a maze with loops and clearings, then wolf dens. */
export function allReachable(f: Forest): boolean {
  const d = walkingDistances(f);
  return f.tiles.every((t, i) => !isWalkable(t) || d[i] >= 0);
}
