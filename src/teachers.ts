/**
 * The teachers: two parents who walk her home their own way, the wolf in
 * disguise, whose lessons look like the father's until a den comes in sight, the
 * crow, who heads straight for home and flies on over the first tree in the way,
 * Grandma, who fetches a bunch of flowers first, the magpie, who collects
 * every treasure before it heads home, and the huntsman, who goes the long way
 * round to have a look at every wolf den. The teachers are the same cast as the judges.
 */
import { closeness, viewWithWolves, wolvesAfter, wolvesFor } from './prowler';
import { Rng, pick } from './rng';
import { Basket, copyForest, densInSight, stepCost, FLOWERS, Forest, HOME, TREASURE, TREE, headsHome, xyOf, Move, MOVES, SWAMP, Tile, WOLF, cheapestTo, cheapestToHome, isWalkable, neighbor, nearWolf, newBasketState, pickUpAtStart, step, tilesWhere, homeSector } from './world';

export type Teacher = 'mother' | 'father' | 'wolf' | 'crow' | 'grandma' | 'magpie' | 'huntsman';
export const TEACHER_KINDS: readonly Teacher[] = ['mother', 'father', 'wolf', 'crow', 'grandma', 'magpie', 'huntsman'];
/**
 * How a teacher counts a step: carefully (around swamps and away from dens: the mother, and
 * Grandma, who walks home the mother's way), steadily (by the energy it takes: the huntsman,
 * who saves his strength for a long walk), or quickly (one step is one step: everyone else).
 */
export type Way = 'careful' | 'steady' | 'quick';
const wayOf = (teacher: Teacher): Way =>
  teacher === 'mother' || teacher === 'grandma' ? 'careful' : teacher === 'huntsman' ? 'steady' : 'quick';
/** "both" mixes the parents half and half; "motherWolf" is the mother with a few of the wolf's lessons slipped in. */
export type TeacherChoice = Teacher | 'both' | 'motherWolf';

/** The energy the huntsman plans his walk around: he only goes on to another den if he can still get her home on it. */
export const HUNTSMAN_ENERGY = 90;

/** Extra cost the careful mother gives to tiles next to a wolf den. */
export const WOLF_PENALTY = 6;
/** Extra cost the careful mother gives to wading through a swamp. */
export const SWAMP_PENALTY = 8;

/**
 * What one step onto tile i is worth to a parent. The hurried father only counts
 * steps, so he wades straight through swamps and walks right past dens. The
 * careful mother avoids both, even if her route is longer.
 */
const enterCost = (f: Forest, i: number, way: Way) => {
  const t = f.tiles[i];
  // Flowers and treasure are ordinary path to the parents: they don't detour for them or around them.
  if (way === 'quick') return 1;
  if (way === 'steady') return stepCost(t);
  return 1 + (t === SWAMP ? SWAMP_PENALTY : 0) + (t !== HOME && nearWolf(f, i) ? WOLF_PENALTY : 0);
};

/**
 * Cost to walk home from every tile for one teacher. The wolf pretends to be the
 * hurried father; Grandma walks home the mother's way, the magpie the father's. The
 * huntsman walks the way that takes the least energy.
 */
export function costToHome(f: Forest, teacher: Teacher): Float64Array {
  const way = wayOf(teacher);
  return cheapestToHome(f, (i) => enterCost(f, i, way));
}

/** Cost to reach the nearest of some tiles (flower patches, treasures, spots to see a den from), one teacher's way. */
export const costToTiles = (f: Forest, targets: readonly number[], way: Way): Float64Array =>
  cheapestTo(f, targets, (i) => enterCost(f, i, way));

/** Energy to walk from `from` to every tile (the step onto each tile counts; never through a den). */
function energyFrom(f: Forest, from: number): Float64Array {
  // Walking a route backwards swaps which end's step is counted: cost(from → i) = cost(i → from) − step onto from + step onto i.
  const back = cheapestTo(f, [from], (i) => stepCost(f.tiles[i]));
  return back.map((c, i) => c - stepCost(f.tiles[from]) * (i === from ? 0 : 1) + (i === from ? 0 : stepCost(f.tiles[i])));
}

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
 * to its goal from every tile: home, or for Grandma and the magpie the next item, for the huntsman the next den.
 */
export function teacherMoves(f: Forest, cost: Float64Array, teacher: Teacher, pos: number): Move[] {
  const way = wayOf(teacher);
  let best = Infinity;
  let opts: Move[] = [];
  for (const m of MOVES) {
    const n = neighbor(f, pos, m);
    if (n < 0) continue;
    const t = f.tiles[n];
    if (!isWalkable(t) && t !== HOME) continue;
    const c = enterCost(f, n, way) + cost[n];
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
  /** Each walking wolf's tile at each of her positions (-1: gone), when any were out. */
  wolves?: number[][];
}

/** Whether a lesson walk ended at a wolf den (only the wolf's lessons can). */
export const endsAtDen = (f: Forest, walk: LessonWalk): boolean => f.tiles[walk.positions[walk.positions.length - 1]] === WOLF;

/** A cost map, or null when its goal can't be reached from `pos` (then the teacher simply walks home). */
const reachable = (cost: Float64Array, pos: number): Float64Array | null => (Number.isFinite(cost[pos]) ? cost : null);

/** The teachers start keeping away from a walking wolf when he is this close (diagonals count as one). */
export const FLEE_RANGE = 1;

/**
 * The forest as a teacher plans in it while walking wolves are near: their tiles and the tiles
 * next to them are closed, so the cheapest way goes round them (or back the way they came).
 */
export function forestAroundWolves(f: Forest, wolves: readonly number[]): Forest {
  const g = copyForest(f);
  for (const wolf of wolves) {
    g.tiles[wolf] = TREE;
    for (const m of MOVES) {
      const n = neighbor(f, wolf, m);
      if (n >= 0 && isWalkable(f.tiles[n])) g.tiles[n] = TREE;
    }
  }
  return g;
}

/** When no way round the walking wolves is open: the step that gets furthest from the nearest (never onto one). */
export function fleeMoves(f: Forest, pos: number, wolves: readonly number[]): Move[] {
  let best = -1;
  let opts: Move[] = [];
  for (const m of MOVES) {
    const n = neighbor(f, pos, m);
    if (n < 0 || wolves.includes(n) || !(isWalkable(f.tiles[n]) || f.tiles[n] === HOME)) continue;
    const [x, y] = xyOf(f, n);
    const d = Math.min(...wolves.map((wolf) => { const [wx, wy] = xyOf(f, wolf); return Math.abs(x - wx) + Math.abs(y - wy); }));
    if (d > best) { best = d; opts = [m]; } else if (d === best) opts.push(m);
  }
  return opts;
}

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
  // Her basket follows the same rules as on a trip alone: a flower patch or treasure at the start or on the way is picked up.
  const trip = newBasketState();
  pickUpAtStart(f, start, trip);
  const wolves = wolvesFor(f, start, rng);
  const history: History = { views: [viewWithWolves(f, start, wolves)], moves: [], sectors: [homeSector(f, start)], baskets: [{ ...trip.basket }] };
  const toDen = teacher === 'wolf' ? denCost ?? costToDen(f) : null;
  let hunting = false;
  // The dens the huntsman has had a look at so far.
  const seen = new Set<number>(densInSight(f, start));
  let spent = 0;
  // Grandma, the magpie and the huntsman first walk to something, then home: `goal` is the cost to what they are after.
  // `g` is the forest as planned in: the real one, or one with the walking wolves' tiles closed.
  const errand = (g: Forest, home: Float64Array): Float64Array | null => {
    if (teacher === 'grandma' && trip.basket.flowers === 0) return reachable(costToTiles(g, tilesWhere(g, (t) => t === FLOWERS), 'careful'), pos);
    if (teacher === 'magpie') return reachable(costToTiles(g, tilesWhere(g, (t, i) => t === TREASURE && !trip.picked.includes(i)), 'quick'), pos);
    if (teacher === 'huntsman') {
      // A spot to see a new den from, if he can still get her home from there on her energy.
      // He walks by energy, so the cost there and home is what the walk will really take.
      const left = HUNTSMAN_ENERGY - spent;
      const fromHere = energyFrom(g, pos);
      return reachable(costToTiles(g, tilesWhere(g, (t, i) => isWalkable(t) && fromHere[i] + home[i] <= left && densInSight(g, i).some((d) => !seen.has(d))), 'steady'), pos);
    }
    return null;
  };
  let goal: Float64Array | null = null;
  // The way round a walking wolf, kept once planned: the forest with his tiles closed, and the cost to the goal in it.
  let detour: { g: Forest; cost: Float64Array } | null = null;
  let doneSoFar = -1;
  let pos = start;
  let eaten = false;
  const out = (extra: Partial<LessonWalk> = {}): LessonWalk => ({ teacher, positions, history, ...(wolves.length ? { wolves: wolves.map((w) => w.path) } : {}), ...extra });
  for (let guard = 0; guard < f.tiles.length * 2 && pos !== f.home && f.tiles[pos] !== WOLF && !eaten; guard++) {
    if (toDen && !hunting && nearWolf(f, pos) && denMoves(f, toDen, pos).length) hunting = true;
    const crow = teacher === 'crow' ? crowMoves(f, pos) : null;
    // A new errand after each pickup or new den (the magpie looks for the next treasure, the huntsman for the next den; Grandma heads home).
    const done = teacher === 'huntsman' ? seen.size : trip.picked.length;
    if (doneSoFar !== done) { goal = errand(f, cost); doneSoFar = done; detour = null; }
    // A walking wolf near: everyone but the crow (who flies) and the wolf at his den keeps away from the
    // ones in sight, planning round them, or just getting away when there is no way round.
    const near = wolves.filter((w) => w.here && closeness(f, pos, w.pos) <= FLEE_RANGE).map((w) => w.pos);
    let opts: Move[];
    if (crow) opts = crow.moves;
    else if (hunting && toDen) opts = denMoves(f, toDen, pos);
    else if (near.length) {
      const g = forestAroundWolves(f, near);
      const home = costToHome(g, teacher);
      const way = errand(g, home) ?? home;
      opts = teacherMoves(g, way, teacher, pos);
      // A whole new road, not one step aside: she keeps to it after the wolf is out of sight, so she does not walk back to him.
      detour = opts.length ? { g, cost: way } : null;
      if (!opts.length) opts = fleeMoves(f, pos, near);
    } else if (detour && wolves.some((w) => w.here)) {
      opts = teacherMoves(detour.g, detour.cost, teacher, pos);
      if (!opts.length) { detour = null; opts = teacherMoves(f, goal ?? cost, teacher, pos); }
    } else {
      detour = null;
      opts = teacherMoves(f, goal ?? cost, teacher, pos);
    }
    if (!opts.length) break;
    const m = pick(rng, opts);
    const stepped = step(f, pos, m, trip);
    if (wolves.length) stepped.result = wolvesAfter(wolves, stepped.pos, stepped.result, trip);
    eaten = stepped.result === 'eaten';
    pos = stepped.pos;
    spent += stepped.cost;
    history.moves.push(m);
    positions.push(pos);
    for (const d of densInSight(f, pos)) seen.add(d);
    // The crow flew over a tree; she stays put, and the lesson ends there.
    if (crow?.flies) return out({ stuck: true });
    if (pos !== f.home && f.tiles[pos] !== WOLF && !eaten) {
      history.views.push(viewWithWolves(f, pos, wolves));
      history.sectors.push(homeSector(f, pos));
      history.baskets.push({ ...trip.basket });
    }
  }
  return out();
}
