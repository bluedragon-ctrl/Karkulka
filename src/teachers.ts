/** The parents: two ways of walking home that she can learn from. */
import { Rng, pick } from './rng';
import { Forest, HOME, Move, MOVES, SWAMP, Tile, cheapestToHome, isWalkable, neighbor, nearWolf, viewAt, homeSector } from './world';

export type Teacher = 'mother' | 'father';
export type TeacherChoice = Teacher | 'both';

/** Extra cost the careful mother gives to tiles next to a wolf den. */
export const WOLF_PENALTY = 6;
/** Extra cost the careful mother gives to wading through a swamp. */
export const SWAMP_PENALTY = 8;

/**
 * What one step onto tile i is worth to a parent. The hurried father only counts
 * steps, so he wades straight through swamps and walks right past dens. The
 * careful mother avoids both, even if her route is longer.
 */
const enterCost = (f: Forest, i: number, careful: boolean) => {
  if (!careful) return 1;
  const t = f.tiles[i];
  return 1 + (t === SWAMP ? SWAMP_PENALTY : 0) + (t !== HOME && nearWolf(f, i) ? WOLF_PENALTY : 0);
};

/** Cost to walk home from every tile for one parent. */
export function costToHome(f: Forest, teacher: Teacher): Float64Array {
  const careful = teacher === 'mother';
  return cheapestToHome(f, (i) => enterCost(f, i, careful));
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
    if (!isWalkable(t) && t !== HOME) continue;
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
