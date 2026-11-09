/** The forest generator: a maze with loops and meadows, then wolf dens. */
import { randInt, rngFrom, shuffle } from './rng';
import { costToHome, teacherMoves } from './teachers';
import {
  BERRIES, DEFAULT_SIZE, DX, DY, FLOWERS, Forest, HOME, MOVES, PATH, SWAMP, TREASURE, TREE, Tile, WOLF,
  allReachable, homeIndex, isWalkable, loopCount, nearWolf, neighbor, pathTiles, tileAt, walkingDistances, xyOf,
} from './world';

/** How much the den placement values keeping a route open, against parent disagreement. */
const LOOP_WEIGHT = 2;

/** How many tiles the careful mother and the hurried father would leave differently. */
export function disagreement(f: Forest): number {
  const mother = costToHome(f, 'mother');
  const father = costToHome(f, 'father');
  let n = 0;
  for (const i of pathTiles(f)) {
    const a = teacherMoves(f, mother, 'mother', i);
    const b = teacherMoves(f, father, 'father', i);
    if (!a.some((m) => b.includes(m))) n++;
  }
  return n;
}

export function generateForest(code: string, size = DEFAULT_SIZE): Forest {
  if (size % 2 === 0 || size < 9) throw new Error('Forest size must be odd and at least 9');
  const rng = rngFrom(`forest:${code}:${size}`);
  const tiles: Tile[] = new Array(size * size).fill(TREE);
  const at = (x: number, y: number) => y * size + x;
  const home = homeIndex(size);
  const hx = home % size;
  const hy = Math.floor(home / size);

  // 1. A maze on the odd cells: long corridors and crossings that look alike.
  const seen = new Set<number>([at(hx, hy)]);
  tiles[at(hx, hy)] = PATH;
  const stack: [number, number][] = [[hx, hy]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = shuffle(rng, [0, 1, 2, 3].map((d) => [x + DX[d] * 2, y + DY[d] * 2, d] as const)
      .filter(([nx, ny]) => nx >= 1 && ny >= 1 && nx <= size - 2 && ny <= size - 2 && !seen.has(at(nx, ny))));
    if (!options.length) { stack.pop(); continue; }
    const [nx, ny, d] = options[0];
    tiles[at(x + DX[d], y + DY[d])] = PATH;
    tiles[at(nx, ny)] = PATH;
    seen.add(at(nx, ny));
    stack.push([nx, ny]);
  }

  // 2. Knock through some walls so there are loops (several routes home).
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const wall = (x % 2) !== (y % 2);
      if (wall && tiles[at(x, y)] === TREE && rng() < 0.4) tiles[at(x, y)] = PATH;
    }
  }

  // 3. A few meadows, so not every place is a corridor.
  for (let k = 0; k < 3; k++) {
    const w = 2 + randInt(rng, 2);
    const h = 2 + randInt(rng, 2);
    const x0 = 1 + randInt(rng, size - 2 - w);
    const y0 = 1 + randInt(rng, size - 2 - h);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) tiles[at(x, y)] = PATH;
  }

  // 4. Scatter single trees in the open, keeping the forest connected and
  // never closing off a route (a tree may only stand where it adds variety).
  const forest: Forest = { size, tiles, home, code };
  tiles[home] = HOME;
  for (const i of shuffle(rng, pathTiles(forest)).slice(0, Math.round(size * 0.6))) {
    const before = loopCount(forest);
    tiles[i] = TREE;
    if (!allReachable(forest) || loopCount(forest) < before) tiles[i] = PATH;
  }

  // 5. Swamp patches (4–6): walkable but tiring. Each goes where the hurried
  // father's shortest route would wade through while the careful mother can
  // walk around on dry ground.
  const fromHome = walkingDistances(forest);
  const patches = 4 + randInt(rng, 3);
  for (let k = 0; k < patches; k++) {
    const base = disagreement(forest);
    let best: number[] | null = null;
    let bestScore = -Infinity;
    for (const i of shuffle(rng, pathTiles(forest).filter((i) => fromHome[i] >= 3)).slice(0, 20)) {
      const patch = [i];
      const next = shuffle(rng, MOVES.map((m) => neighbor(forest, i, m)).filter((j) => j >= 0 && tiles[j] === PATH && fromHome[j] >= 3));
      if (next.length && rng() < 0.6) patch.push(next[0]);
      for (const j of patch) tiles[j] = SWAMP;
      const s = disagreement(forest) - base + rng() * 0.5;
      for (const j of patch) tiles[j] = PATH;
      if (s > bestScore) { bestScore = s; best = patch; }
    }
    if (best) for (const j of best) tiles[j] = SWAMP;
  }

  // 6. Wolf dens, never cutting any path tile off from home. Each den goes where
  // the careful mother and the hurried father would part ways the most, while
  // closing off as few alternative routes as possible.
  const dist = walkingDistances(forest);
  const wanted = Math.round((size * size) / 28);
  for (let placed = 0; placed < wanted; placed++) {
    let bestTile = -1;
    let bestScore = -1;
    const candidates = shuffle(rng, pathTiles(forest).filter((i) => dist[i] >= 4)).slice(0, 24);
    for (const i of candidates) {
      const [x, y] = xyOf(forest, i);
      if ([0, 1, 2, 3].some((d) => tileAt(forest, x + DX[d], y + DY[d]) === WOLF)) continue;
      tiles[i] = WOLF;
      if (allReachable(forest)) {
        const s = disagreement(forest) + LOOP_WEIGHT * loopCount(forest) + rng() * 0.5;
        if (s > bestScore) { bestScore = s; bestTile = i; }
      }
      tiles[i] = PATH;
    }
    if (bestTile < 0) break;
    tiles[bestTile] = WOLF;
  }

  placeBasketTiles(forest);
  placeBerryBushes(forest);
  return forest;
}

/** Berry bushes per forest: 2 or 3, at least this many steps from home (where she gets tired). */
export const BERRY_BUSHES = [2, 3] as const;
export const BERRY_MIN_DIST = 5;

/**
 * Berry bushes, placed last from their own seeded stream, so the rest of each forest stays as it
 * was: 2–3, off both parents' routes (a detour, never on their way), away from home, never next
 * to an item, home or another bush. A bush goes on a path tile nobody's route uses, or, when
 * there are too few, on a tree next to a path (never on the border) where no parent's route
 * then goes through it. Some mazes have too few such spots: then fewer, but always at least one
 * (as a last resort on a parent's route). The farther half of the spots from home is preferred:
 * far from home is where she runs low.
 */
function placeBerryBushes(f: Forest) {
  const rng = rngFrom(`berries:${f.code}:${f.size}`);
  const { tiles, size } = f;
  const fromHome = walkingDistances(f);
  const around = (i: number) => MOVES.map((m) => neighbor(f, i, m)).filter((n) => n >= 0);
  const crowded = (i: number) => around(i).some((n) => n === f.home || tiles[n] === FLOWERS || tiles[n] === TREASURE || tiles[n] === BERRIES);
  // How far from home a spot is: a path tile's own distance, a tree's through its nearest open neighbour.
  const far = (i: number) => (tiles[i] === TREE ? 1 + Math.min(...around(i).map((n) => (fromHome[n] >= 0 ? fromHome[n] : Infinity))) : fromHome[i]);
  const inside = (i: number) => { const [x, y] = xyOf(f, i); return x > 0 && y > 0 && x < size - 1 && y < size - 1; };
  const preferFar = (options: number[]) => {
    options.sort((a, b) => far(b) - far(a) || a - b);
    return shuffle(rng, options.slice(0, Math.max(1, Math.ceil(options.length / 2))));
  };
  const [lo, hi] = BERRY_BUSHES;
  for (let k = lo + randInt(rng, hi - lo + 1); k > 0; k--) {
    const ok = (i: number) => Number.isFinite(far(i)) && far(i) >= BERRY_MIN_DIST && !crowded(i);
    const used = parentRouteTiles(f);
    const paths = pathTiles(f).filter((i) => !used.has(i) && ok(i));
    if (paths.length) { tiles[preferFar(paths)[0]] = BERRIES; continue; }
    // A tree by the path: kept only if it stays off the parents' routes (it must not open a shortcut).
    // Nooks first (a tree with one open neighbour: it can't open a shortcut), then the rest.
    const open = (i: number) => around(i).filter((n) => tiles[n] !== TREE).length;
    const trees = preferFar(tiles.map((_, i) => i).filter((i) => tiles[i] === TREE && inside(i) && ok(i)))
      .sort((a, b) => Number(open(a) > 1) - Number(open(b) > 1));
    let placed = false;
    for (const i of trees.slice(0, 40)) {
      tiles[i] = BERRIES;
      if (!parentRouteTiles(f).has(i)) { placed = true; break; }
      tiles[i] = TREE;
    }
    if (!placed) break;
  }
  // Every forest gets at least one: as a last resort on a path tile a parent's route crosses.
  if (!tiles.includes(BERRIES)) {
    const any = pathTiles(f).filter((i) => Number.isFinite(far(i)) && far(i) >= BERRY_MIN_DIST && !crowded(i));
    if (any.length) tiles[preferFar(any)[0]] = BERRIES;
  }
}

/** Shortcut dens per forest, and how many steps one must save at least. */
export const SHORTCUT_DENS = 3;
export const SHORTCUT_MIN_SAVING = 4;

/**
 * Steps saved by walking through tile i instead of around: for a tile between two
 * walkable tiles on opposite sides, the difference in their walking distances home,
 * less the two steps through. 0 when it is no shortcut.
 */
export function shortcutSaving(f: Forest, i: number, dist = walkingDistances(f)): number {
  let best = 0;
  for (const [a, b] of [[0, 2], [1, 3]] as const) {
    const u = neighbor(f, i, a);
    const v = neighbor(f, i, b);
    if (u < 0 || v < 0 || dist[u] < 0 || dist[v] < 0) continue;
    best = Math.max(best, Math.abs(dist[u] - dist[v]) - 2);
  }
  return best;
}

/** How many path tiles the careful mother's route home from wades through a swamp. */
export function motherWades(f: Forest): number {
  const cost = costToHome(f, 'mother');
  let n = 0;
  for (const start of pathTiles(f)) {
    let pos = start;
    for (let guard = 0; guard < f.tiles.length && pos !== f.home; guard++) {
      const m = teacherMoves(f, cost, 'mother', pos)[0];
      if (m === undefined) break;
      pos = neighbor(f, pos, m);
      if (f.tiles[pos] === SWAMP) { n++; break; }
    }
  }
  return n;
}

/**
 * Every tile some parent steps onto on the way home from another tile. Tiles not in
 * this set are off both parents' routes (dead ends, side loops nobody needs).
 */
export function parentRouteTiles(f: Forest): Set<number> {
  const used = new Set<number>();
  for (const teacher of ['mother', 'father'] as const) {
    const cost = costToHome(f, teacher);
    f.tiles.forEach((t, i) => {
      if (!isWalkable(t)) return;
      for (const m of teacherMoves(f, cost, teacher, i)) used.add(neighbor(f, i, m));
    });
  }
  return used;
}

/**
 * Her basket's part of the forest, placed after the rest from its own seeded stream:
 * a few wolf dens in gaps between two paths, where walking through saves steps (a
 * shortcut only the cake makes survivable), then 2–3 flower patches and 2–3 treasures
 * off both parents' routes, one of them near a den. Tiles that were trees become
 * dens, so every path and swamp can still reach home without crossing a den.
 */
function placeBasketTiles(f: Forest) {
  const rng = rngFrom(`basket:${f.code}:${f.size}`);
  const { tiles, size } = f;
  const touchesDen = (i: number) => MOVES.some((m) => { const n = neighbor(f, i, m); return n >= 0 && tiles[n] === WOLF; });
  const touchesHome = (i: number) => MOVES.some((m) => neighbor(f, i, m) === f.home);

  // Shortcut dens: the gaps that save the most steps.
  const dist = walkingDistances(f);
  const gaps = shuffle(rng, tiles.map((_, i) => i).filter((i) => {
    const [x, y] = xyOf(f, i);
    return tiles[i] === TREE && x > 0 && y > 0 && x < size - 1 && y < size - 1 && !touchesHome(i);
  })).map((i) => ({ i, saving: shortcutSaving(f, i, dist) }))
    .filter((g) => g.saving >= SHORTCUT_MIN_SAVING)
    .sort((a, b) => b.saving - a.saving);
  // A den in sight makes the careful mother detour; a shortcut den must not send her through
  // more swamps, or the two parents would walk too much alike.
  let wades = motherWades(f);
  let dens = 0;
  for (const g of gaps) {
    if (dens >= SHORTCUT_DENS) break;
    if (touchesDen(g.i)) continue;
    tiles[g.i] = WOLF;
    const after = motherWades(f);
    if (after > wades) { tiles[g.i] = TREE; continue; }
    wades = after;
    dens++;
  }

  // Flowers and treasure, off both parents' routes, never side by side.
  const fromHome = walkingDistances(f);
  const used = parentRouteTiles(f);
  const touchesItem = (i: number) => MOVES.some((m) => { const n = neighbor(f, i, m); return n >= 0 && (tiles[n] === FLOWERS || tiles[n] === TREASURE); });
  const spots = () => shuffle(rng, pathTiles(f).filter((i) => !used.has(i) && fromHome[i] >= 3 && !touchesHome(i) && !touchesItem(i)));
  const want: Tile[] = [];
  for (let k = 2 + randInt(rng, 2); k > 0; k--) want.push(TREASURE);
  for (let k = 2 + randInt(rng, 2); k > 0; k--) want.push(FLOWERS);
  want.forEach((kind, k) => {
    const options = spots();
    // The first item goes near a den when it can, so taking it is a real risk.
    const near = k === 0 ? options.filter((i) => nearWolf(f, i)) : [];
    const i = (near.length ? near : options)[0];
    if (i !== undefined) tiles[i] = kind;
  });
}


/** The forest-change buttons: how many tiles a small and a big change touch. */
export const CHANGE_SIZES = { small: 5, big: 15 } as const;

/**
 * Change `count` random tiles (never home) into another kind of tile, keeping every
 * path and swamp able to reach home. Seeded by `seed`, so the same forest and seed
 * always give the same change. Returns the changed forest and the changed tiles.
 */
export function changeForest(f: Forest, count: number, seed: string): { forest: Forest; changed: number[] } {
  const rng = rngFrom(`change:${seed}`);
  const tiles = f.tiles.slice();
  const g: Forest = { ...f, tiles };
  const kinds: Tile[] = [PATH, TREE, WOLF, SWAMP];
  const changed: number[] = [];
  for (let tries = 0; changed.length < count && tries < 5000; tries++) {
    const i = randInt(rng, tiles.length);
    if (i === f.home || changed.includes(i)) continue;
    const old = tiles[i];
    const options = kinds.filter((t) => t !== old);
    tiles[i] = options[randInt(rng, options.length)];
    if (allReachable(g)) changed.push(i);
    else tiles[i] = old;
  }
  return { forest: g, changed };
}
