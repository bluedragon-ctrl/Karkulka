/** The forest generator: a maze with loops and meadows, then wolf dens. */
import { randInt, rngFrom, shuffle } from './rng';
import { costToHome, teacherMoves } from './teachers';
import {
  DEFAULT_SIZE, DX, DY, Forest, HOME, PATH, TREE, Tile, WOLF,
  allReachable, homeIndex, pathTiles, tileAt, walkingDistances, xyOf,
} from './world';

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
      if (wall && tiles[at(x, y)] === TREE && rng() < 0.3) tiles[at(x, y)] = PATH;
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

  // 4. Scatter single trees in the open, keeping the forest connected.
  const forest: Forest = { size, tiles, home, code };
  tiles[home] = HOME;
  for (const i of shuffle(rng, pathTiles(forest)).slice(0, Math.round(size * 0.6))) {
    tiles[i] = TREE;
    if (!allReachable(forest)) tiles[i] = PATH;
  }

  // 5. Wolf dens, never cutting any path tile off from home. Each den goes where
  // the careful mother and the hurried father would part ways the most.
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
        const s = disagreement(forest) + rng() * 0.5;
        if (s > bestScore) { bestScore = s; bestTile = i; }
      }
      tiles[i] = PATH;
    }
    if (bestTile < 0) break;
    tiles[bestTile] = WOLF;
  }
  return forest;
}

