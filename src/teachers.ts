/** The parents: two ways of walking home that she can learn from. */
import { Rng, pick } from './rng';
import { Forest, HOME, Move, MOVES, PATH, Tile, neighbor, nearWolf, viewAt, homeSector } from './world';

export type Teacher = 'mother' | 'father';
export type TeacherChoice = Teacher | 'both';

/** Extra cost the careful mother gives to tiles next to a wolf den. */
export const WOLF_PENALTY = 6;

const enterCost = (f: Forest, i: number, careful: boolean) =>
  1 + (careful && f.tiles[i] !== HOME && nearWolf(f, i) ? WOLF_PENALTY : 0);

/** Cost to walk home from every tile for one parent (Dijkstra from home). */
export function costToHome(f: Forest, teacher: Teacher): Float64Array {
  const careful = teacher === 'mother';
  const n = f.tiles.length;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  dist[f.home] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    const c = enterCost(f, u, careful);
    for (const m of MOVES) {
      const v = neighbor(f, u, m);
      if (v < 0 || f.tiles[v] !== PATH) continue;
      if (dist[u] + c < dist[v]) dist[v] = dist[u] + c;
    }
  }
  return dist;
}

/** All moves a parent considers best from a tile (ties are possible). */
export function teacherMoves(f: Forest, cost: Float64Array, teacher: Teacher, pos: number): Move[] {
  const careful = teacher === 'mother';
  let best = Infinity;
  let opts: Move[] = [];
  for (const m of MOVES) {
    const n = neighbor(f, pos, m);
    if (n < 0) continue;
    const t = f.tiles[n];
    if (t !== PATH && t !== HOME) continue;
    const c = enterCost(f, n, careful) + cost[n];
    if (c < best - 1e-9) { best = c; opts = [m]; }
    else if (Math.abs(c - best) < 1e-9) opts.push(m);
  }
  return best < Infinity ? opts : [];
}

export interface History {
  views: Tile[][];
  moves: Move[];
  sectors: number[];
}

export interface LessonWalk {
  teacher: Teacher;
  positions: number[];
  history: History;
}

/** A parent walks her home from a start tile: one lesson, one "story". */
export function walkLesson(f: Forest, teacher: Teacher, cost: Float64Array, start: number, rng: Rng): LessonWalk {
  const positions = [start];
  const history: History = { views: [viewAt(f, start)], moves: [], sectors: [homeSector(f, start)] };
  let pos = start;
  for (let guard = 0; guard < f.tiles.length * 2 && pos !== f.home; guard++) {
    const opts = teacherMoves(f, cost, teacher, pos);
    if (!opts.length) break;
    const m = pick(rng, opts);
    pos = neighbor(f, pos, m);
    history.moves.push(m);
    positions.push(pos);
    if (pos !== f.home) {
      history.views.push(viewAt(f, pos));
      history.sectors.push(homeSector(f, pos));
    }
  }
  return { teacher, positions, history };
}
