/**
 * The teachers: two parents who walk her home their own way, the wolf in
 * disguise, whose lessons look like the father's until a den comes in sight, the
 * crow, who heads straight for home and flies on over the first tree in the way,
 * Grandma, who fetches a bunch of flowers first, and the magpie, who collects
 * every treasure before it heads home. The teachers are the same cast as the judges.
 */
import { Rng, pick } from './rng';
import { Basket, FLOWERS, Forest, HOME, TREASURE, TREE, headsHome, xyOf, Move, MOVES, SWAMP, Tile, WOLF, cheapestTo, cheapestToHome, fullBasket, isWalkable, neighbor, nearWolf, newBasketState, step, tilesWhere, viewAt, homeSector } from './world';

export type Teacher = 'mother' | 'father' | 'wolf' | 'crow' | 'grandma' | 'magpie';
export const TEACHER_KINDS: readonly Teacher[] = ['mother', 'father', 'wolf', 'crow', 'grandma', 'magpie'];
/** Who walks carefully (around swamps and away from dens): the mother, and Grandma, who walks home the mother's way. */
const isCareful = (teacher: Teacher) => teacher === 'mother' || teacher === 'grandma';
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
  // Flowers and treasure are ordinary path to the parents: they don't detour for them or around them.
  if (!careful) return 1;
  return 1 + (t === SWAMP ? SWAMP_PENALTY : 0) + (t !== HOME && nearWolf(f, i) ? WOLF_PENALTY : 0);
};

/**
 * Cost to walk home from every tile for one teacher. The wolf pretends to be the
 * hurried father; Grandma walks home the mother's way, the magpie the father's.
 */
export function costToHome(f: Forest, teacher: Teacher): Float64Array {
  const careful = isCareful(teacher);
  return cheapestToHome(f, (i) => enterCost(f, i, careful));
}

/** Cost to reach the nearest of some tiles (flower patches, treasures), the careful or the quick way. */
export const costToTiles = (f: Forest, targets: readonly number[], careful: boolean): Float64Array =>
  cheapestTo(f, targets, (i) => enterCost(f, i, careful));

/** Steps to the nearest wolf den from every tile: where the wolf really leads her. */
export const costToDen = (f: Forest): Float64Array => cheapestTo(f, tilesWhere(f, (t) => t === WOLF), () => 1);

/** The wolf's moves once a den is in sight: the quickest way into it. */
export function denMoves(f: Forest, denCost: Float64Array, pos: number): Move[] {
  let best = Infinity;
  let opts: Move[] = [];
  for (const m of MOVES) {
    const n = neighbor(f, pos, m);
    if (n < 0) continue;
    const t = f.tiles[n];
    const c = t === WOLF ? 0 : isWalkable(t) ? denCost[n] : Infinity;
    if (c < best) { best = c; opts = [m]; }
    else if (c === best && c < Infinity) opts.push(m);
  }
  return best < Infinity ? opts : [];
}

/**
 * All moves a teacher considers best from a tile (ties are possible), given the cost
 * to its goal from every tile: home, or for Grandma and the magpie the next item.
 */
export function teacherMoves(f: Forest, cost: Float64Array, teacher: Teacher, pos: number): Move[] {
  const careful = isCareful(teacher);
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

/**
 * The crow's moves from a tile: towards home as the crow flies, the longer way
 * first. It takes a step she can walk if one heads home (never onto a den, which
 * it sees from the sky). When only trees are in the way it flies on over one:
 * `flies` is set and the move is one she cannot follow.
 */
export function crowMoves(f: Forest, pos: number): { moves: Move[]; flies: boolean } {
  const [x, y] = xyOf(f, pos);
  const [hx, hy] = xyOf(f, f.home);
  const gap = (m: Move) => (m === 1 || m === 3 ? Math.abs(hx - x) : Math.abs(hy - y));
  const heading = MOVES.filter((m) => headsHome(f, pos, m)).sort((a, b) => gap(b) - gap(a));
  const tile = (m: Move) => f.tiles[neighbor(f, pos, m)];
  const best = (ms: Move[]) => ms.filter((m) => gap(m) === gap(ms[0]));
  const open = heading.filter((m) => isWalkable(tile(m)) || tile(m) === HOME);
  if (open.length) return { moves: best(open), flies: false };
  const trees = heading.filter((m) => tile(m) === TREE);
  return { moves: trees.length ? best(trees) : [], flies: trees.length > 0 };
}

export interface History {
  views: Tile[][];
  moves: Move[];
  sectors: number[];
  /** Her basket at each view (in lessons too, a flower patch or treasure the parent walks over is picked up). */
  baskets: Basket[];
}

export interface LessonWalk {
  teacher: Teacher;
  positions: number[];
  history: History;
  /** The crow flew on over a tree with its last move: she bumped into the tree and was left behind. */
  stuck?: boolean;
}

/** Whether a lesson walk ended at a wolf den (only the wolf's lessons can). */
export const endsAtDen = (f: Forest, walk: LessonWalk): boolean => f.tiles[walk.positions[walk.positions.length - 1]] === WOLF;

/** A cost map, or null when its goal can't be reached from `pos` (then the teacher simply walks home). */
const reachable = (cost: Float64Array, pos: number): Float64Array | null => (Number.isFinite(cost[pos]) ? cost : null);

/** Whether a lesson walk ended with the crow flying over a tree and leaving her stuck. */
export const endsStuck = (walk: LessonWalk): boolean => walk.stuck === true;

/**
 * A teacher walks her from a start tile: one lesson, one "story". The parents walk
 * home. The wolf walks home like the father until a den comes in sight, then leads
 * her into it. The crow heads straight for home; when a tree is in the way it flies
 * on, and the lesson ends with her bumping into the tree. `denCost` (from
 * `costToDen`) is only needed for the wolf; the crow ignores `cost`.
 */
export function walkLesson(f: Forest, teacher: Teacher, cost: Float64Array, start: number, rng: Rng, denCost?: Float64Array): LessonWalk {
  const positions = [start];
  const history: History = { views: [viewAt(f, start)], moves: [], sectors: [homeSector(f, start)], baskets: [fullBasket()] };
  // Her basket follows the same rules as on a trip alone: a flower patch or treasure on the way is picked up.
  const trip = newBasketState();
  const toDen = teacher === 'wolf' ? denCost ?? costToDen(f) : null;
  let hunting = false;
  // Grandma and the magpie first walk to an item, then home: `goal` is the cost to the item they are after.
  const errand = (): Float64Array | null => {
    if (teacher === 'grandma' && trip.basket.flowers === 0) return reachable(costToTiles(f, tilesWhere(f, (t) => t === FLOWERS), true), pos);
    if (teacher === 'magpie') return reachable(costToTiles(f, tilesWhere(f, (t, i) => t === TREASURE && !trip.picked.includes(i)), false), pos);
    return null;
  };
  let goal: Float64Array | null = null;
  let pickedSoFar = -1;
  let pos = start;
  for (let guard = 0; guard < f.tiles.length * 2 && pos !== f.home && f.tiles[pos] !== WOLF; guard++) {
    if (toDen && !hunting && nearWolf(f, pos) && denMoves(f, toDen, pos).length) hunting = true;
    const crow = teacher === 'crow' ? crowMoves(f, pos) : null;
    // A new errand after each pickup (the magpie looks for the next treasure; Grandma heads home).
    if (pickedSoFar !== trip.picked.length) { goal = errand(); pickedSoFar = trip.picked.length; }
    const opts = crow ? crow.moves : hunting && toDen ? denMoves(f, toDen, pos) : teacherMoves(f, goal ?? cost, teacher, pos);
    if (!opts.length) break;
    const m = pick(rng, opts);
    pos = step(f, pos, m, trip).pos;
    history.moves.push(m);
    positions.push(pos);
    // The crow flew over a tree; she stays put, and the lesson ends there.
    if (crow?.flies) return { teacher, positions, history, stuck: true };
    if (pos !== f.home && f.tiles[pos] !== WOLF) {
      history.views.push(viewAt(f, pos));
      history.sectors.push(homeSector(f, pos));
      history.baskets.push({ ...trip.basket });
    }
  }
  return { teacher, positions, history };
}
