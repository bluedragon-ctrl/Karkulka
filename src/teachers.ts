/**
 * The teachers: two parents who walk her home their own way, and the wolf in
 * disguise, whose lessons look like the father's until a den comes in sight.
 */
import { Rng, pick } from './rng';
import { Basket, Forest, HOME, Move, MOVES, SWAMP, Tile, WOLF, cheapestTo, cheapestToHome, fullBasket, isItem, isWalkable, neighbor, nearWolf, tilesWhere, viewAt, homeSector } from './world';

export type Teacher = 'mother' | 'father' | 'wolf';
export const TEACHER_KINDS: readonly Teacher[] = ['mother', 'father', 'wolf'];
/** "both" mixes the parents half and half; "motherWolf" is the mother with a few of the wolf's lessons slipped in. */
export type TeacherChoice = Teacher | 'both' | 'motherWolf';

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
  const t = f.tiles[i];
  // The parents never pick anything up: they walk around flowers and treasure.
  if (isItem(t)) return Infinity;
  if (!careful) return 1;
  return 1 + (t === SWAMP ? SWAMP_PENALTY : 0) + (t !== HOME && nearWolf(f, i) ? WOLF_PENALTY : 0);
};

/** Cost to walk home from every tile for one teacher (the wolf pretends to be the hurried father). */
export function costToHome(f: Forest, teacher: Teacher): Float64Array {
  const careful = teacher === 'mother';
  return cheapestToHome(f, (i) => enterCost(f, i, careful));
}

/** Steps to the nearest wolf den from every tile: where the wolf really leads her. */
export const costToDen = (f: Forest): Float64Array => cheapestTo(f, tilesWhere(f, (t) => t === WOLF), (i) => (isItem(f.tiles[i]) ? Infinity : 1));

/** The wolf's moves once a den is in sight: the quickest way into it. */
export function denMoves(f: Forest, denCost: Float64Array, pos: number): Move[] {
  let best = Infinity;
  let opts: Move[] = [];
  for (const m of MOVES) {
    const n = neighbor(f, pos, m);
    if (n < 0) continue;
    const t = f.tiles[n];
    const c = t === WOLF ? 0 : isWalkable(t) && !isItem(t) ? denCost[n] : Infinity;
    if (c < best) { best = c; opts = [m]; }
    else if (c === best && c < Infinity) opts.push(m);
  }
  return best < Infinity ? opts : [];
}

/** All moves a teacher considers best on the way home from a tile (ties are possible). */
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
  /** Her basket at each view (lessons always carry the full basket: the parents pick nothing up). */
  baskets: Basket[];
}

export interface LessonWalk {
  teacher: Teacher;
  positions: number[];
  history: History;
}

/** Whether a lesson walk ended at a wolf den (only the wolf's lessons can). */
export const endsAtDen = (f: Forest, walk: LessonWalk): boolean => f.tiles[walk.positions[walk.positions.length - 1]] === WOLF;

/**
 * A teacher walks her from a start tile: one lesson, one "story". The parents walk
 * home. The wolf walks home like the father until a den comes in sight, then leads
 * her into it. `denCost` (from `costToDen`) is only needed for the wolf.
 */
export function walkLesson(f: Forest, teacher: Teacher, cost: Float64Array, start: number, rng: Rng, denCost?: Float64Array): LessonWalk {
  const positions = [start];
  const history: History = { views: [viewAt(f, start)], moves: [], sectors: [homeSector(f, start)], baskets: [fullBasket()] };
  const toDen = teacher === 'wolf' ? denCost ?? costToDen(f) : null;
  let hunting = false;
  let pos = start;
  for (let guard = 0; guard < f.tiles.length * 2 && pos !== f.home && f.tiles[pos] !== WOLF; guard++) {
    if (toDen && !hunting && nearWolf(f, pos) && denMoves(f, toDen, pos).length) hunting = true;
    const opts = hunting && toDen ? denMoves(f, toDen, pos) : teacherMoves(f, cost, teacher, pos);
    if (!opts.length) break;
    const m = pick(rng, opts);
    pos = neighbor(f, pos, m);
    history.moves.push(m);
    positions.push(pos);
    if (pos !== f.home && f.tiles[pos] !== WOLF) {
      history.views.push(viewAt(f, pos));
      history.sectors.push(homeSector(f, pos));
      history.baskets.push(fullBasket());
    }
  }
  return { teacher, positions, history };
}
