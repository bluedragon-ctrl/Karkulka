/**
 * The big test: many trips alone in a row, then counted up. One trip says little, because
 * every move is picked by chance; many trips show what she usually does.
 */
import type { Model } from './model';
import { mulberry32, pick } from './rng';
import { Outcome, Walker } from './sim';
import { CAST, EventSpot, EventTracker, SPOT_COUNT, eventKind, placeStoryEvents, tripSeed } from './storyEvents';
import { startTiles } from './train';
import { walkingWolvesSeen } from './explain';
import { Forest, SWAMP, WOLF, densInSight, walkingDistances } from './world';

export const TEST_SIZES = [100, 500] as const;
/** From this boldness-adjusted chance, a move counts as one she was sure about (as in her thoughts' "definitely"). */
export const SURE_FROM = 0.75;
/** Coming back to one tile this many times in a trip counts as going in circles. */
export const CIRCLE_VISITS = 3;

export interface TestOptions {
  count: number;
  energy: number;
  boldness: number;
  /** Hidden forest events on (with their basket effects), and whether they move every trip. */
  events: boolean;
  newPlaces: boolean;
  /** Every trip from this tile; null: each trip from a random tile she can walk on, at least 2 steps from home. */
  start: number | null;
  seed: number;
}

/** One trip of the test, as much as the counts and the board's trails need. */
export interface TestTrip {
  start: number;
  outcome: Outcome;
  positions: number[];
  steps: number;
  /** Fewest steps home from the start. */
  shortest: number;
  energyUsed: number;
  cakeHome: boolean;
  /** Who took the cake, if anyone: the wolf at a den, or the fox (a forest event). */
  cakeBy: 'wolf' | 'fox' | null;
  flowers: number;
  treasure: number;
  /** Treasure picked up on the trip, kept or not. */
  treasurePicked: number;
  bumps: number;
  swampSteps: number;
  densSeen: number;
  circles: boolean;
  /** Moves she was sure about (boldness-adjusted chance at least SURE_FROM). */
  sureMoves: number;
  /** Event kinds she met. */
  events: number[];
  /** Times a walking wolf met her (0 when none are out). */
  wolfMet: number;
}

export interface TestReport {
  count: number;
  /** Shares of all trips. */
  home: number;
  homeNoCake: number;
  eaten: number;
  lost: number;
  /** Averages per trip, or per trip home where it says so. */
  stepsHome: number | null;
  shortestHome: number | null;
  energyUsed: number;
  flowersHome: number;
  treasure: number;
  bumps: number;
  swampSteps: number;
  densSeen: number;
  eventsMet: number;
  /** Share of all her moves she was sure about. */
  sure: number;
  /** How often the wolf grabbed the cake and the fox took it (trips). */
  cakeByWolf: number;
  cakeByFox: number;
  /** Trips in which a walking wolf met her. */
  walkingWolf: number;
  /** Event kinds by how many trips met them, most first. */
  topEvents: { kind: number; name: string; trips: number }[];
  /** How many different walks the trips made (two walks are the same when every step is). */
  distinctWalks: number;
  trips: TestTrip[];
  facts: string[];
}

/** The tiles a test trip may start on when no start is chosen. */
export const testStartTiles = (f: Forest): number[] => startTiles(f, 2);

/** Walk the test trips and count them up. Events use their own randomness, never the walk's. */
export function runTest(model: Model, f: Forest, opts: TestOptions): TestReport {
  const startRng = mulberry32(opts.seed ^ 0x5bd1e995);
  const eventRng = mulberry32(opts.seed ^ 0x27d4eb2f);
  const starts = opts.start !== null ? [opts.start] : testStartTiles(f);
  const dist = walkingDistances(f);
  const fixedSpots = opts.events && !opts.newPlaces ? placeStoryEvents(f) : [];
  const trips: TestTrip[] = [];
  if (!starts.length) return summarize(f, trips);
  for (let k = 0; k < opts.count; k++) {
    const start = starts.length === 1 ? starts[0] : pick(startRng, starts);
    const spots: EventSpot[] = !opts.events ? [] : opts.newPlaces ? placeStoryEvents(f, CAST, SPOT_COUNT, tripSeed(eventRng() * 2 ** 32)) : fixedSpots;
    // Each trip has its own walk randomness, so one trip never shifts the next.
    const w = new Walker(f, model, start, opts.energy, opts.boldness, mulberry32((opts.seed + k * 0x9e3779b9) >>> 0));
    const tracker = opts.events ? new EventTracker(f, spots, eventRng) : null;
    w.events = tracker;
    w.run();
    trips.push(tripOf(f, w, dist[start], tracker));
  }
  return summarize(f, trips);
}

function tripOf(f: Forest, w: Walker, shortest: number, tracker: EventTracker | null): TestTrip {
  const visits = new Map<number, number>();
  // Arrivals only: a bump into a tree leaves her standing where she was, which is not a circle.
  w.positions.forEach((p, i) => { if (i === 0 || p !== w.positions[i - 1]) visits.set(p, (visits.get(p) ?? 0) + 1); });
  const stood = w.outcome === 'home' || w.outcome === 'eaten' ? w.positions.slice(0, -1) : w.positions;
  const dens = new Set<number>();
  for (const p of new Set(stood)) for (const d of densInSight(f, p)) dens.add(d);
  const wolvesSeen = dens.size + walkingWolvesSeen(f, w.positions, w.wolves, stood.length);
  const fox = w.effects.some((e) => e.effect === 'takeCake');
  return {
    start: w.start,
    outcome: w.outcome ?? 'lost',
    positions: w.positions.slice(),
    steps: w.t,
    shortest,
    energyUsed: w.energy - w.energyLeft,
    cakeHome: w.outcome === 'home' && w.basket.cake,
    cakeBy: w.cakeLostAt >= 0 ? 'wolf' : fox ? 'fox' : null,
    flowers: w.outcome === 'home' ? w.basket.flowers : 0,
    treasure: w.basket.treasure,
    treasurePicked: w.pickups.treasure + w.effects.filter((e) => e.effect === 'giveTreasure').length,
    bumps: w.blocked.filter(Boolean).length,
    swampSteps: w.positions.slice(1).filter((p, i) => !w.blocked[i] && f.tiles[p] === SWAMP).length,
    densSeen: wolvesSeen,
    circles: [...visits.values()].some((v) => v >= CIRCLE_VISITS),
    sureMoves: w.decisions.filter((d, t) => d.tempered[w.history.moves[t]] >= SURE_FROM).length,
    events: tracker?.met.map((e) => e.kind) ?? [],
    wolfMet: w.wolfMet.length,
  };
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const trips = (n: number): string => `${n} trip${n === 1 ? '' : 's'}`;

export function summarize(f: Forest, list: TestTrip[]): TestReport {
  const n = Math.max(1, list.length);
  const share = (test: (t: TestTrip) => boolean) => list.filter(test).length / n;
  const home = list.filter((t) => t.outcome === 'home');
  const kinds = new Map<number, number>();
  for (const t of list) for (const k of new Set(t.events)) kinds.set(k, (kinds.get(k) ?? 0) + 1);
  const topEvents = [...kinds.entries()]
    .map(([kind, count]) => ({ kind, name: eventKind(kind)?.name ?? '?', trips: count }))
    .sort((a, b) => b.trips - a.trips || a.kind - b.kind);
  const moves = list.reduce((a, t) => a + t.steps, 0);
  const report: TestReport = {
    count: list.length,
    home: home.length / n,
    homeNoCake: share((t) => t.outcome === 'home' && !t.cakeHome),
    eaten: share((t) => t.outcome === 'eaten'),
    lost: share((t) => t.outcome === 'lost'),
    stepsHome: home.length ? mean(home.map((t) => t.steps)) : null,
    shortestHome: home.length ? mean(home.map((t) => t.shortest)) : null,
    energyUsed: mean(list.map((t) => t.energyUsed)),
    flowersHome: mean(list.map((t) => t.flowers)),
    treasure: mean(list.map((t) => t.treasure)),
    bumps: mean(list.map((t) => t.bumps)),
    swampSteps: mean(list.map((t) => t.swampSteps)),
    densSeen: mean(list.map((t) => t.densSeen)),
    eventsMet: mean(list.map((t) => t.events.length)),
    sure: moves ? list.reduce((a, t) => a + t.sureMoves, 0) / moves : 0,
    cakeByWolf: list.filter((t) => t.cakeBy === 'wolf').length,
    cakeByFox: list.filter((t) => t.cakeBy === 'fox').length,
    walkingWolf: list.filter((t) => (t.wolfMet ?? 0) > 0).length,
    topEvents,
    distinctWalks: new Set(list.map((t) => t.positions.join(','))).size,
    trips: list,
    facts: [],
  };
  report.facts = factoids(f, report);
  return report;
}

/** A few short, true remarks about the test, the most telling first. */
export function factoids(f: Forest, r: TestReport): string[] {
  const list = r.trips;
  if (!list.length) return [];
  const out: string[] = [];
  const oneStart = new Set(list.map((t) => t.start)).size === 1;

  if (oneStart && list.length > 1) {
    out.push(r.distinctWalks === list.length
      ? `All ${list.length} trips started on the same tile, and no two walks were the same.`
      : `All ${list.length} trips started on the same tile, and she walked ${r.distinctWalks} different ways.`);
  }

  out.push(`She was sure (${Math.round(SURE_FROM * 100)}% or more) about ${Math.round(r.sure * 100)}% of her moves; the others were closer calls, where chance mattered more.`);

  const home = list.filter((t) => t.outcome === 'home');
  if (home.length) {
    const quick = home.reduce((a, t) => (t.steps < a.steps ? t : a));
    const long = home.reduce((a, t) => (t.steps - t.shortest > a.steps - a.shortest ? t : a));
    const exact = home.filter((t) => t.steps === t.shortest).length;
    if (exact) out.push(`In ${trips(exact)} she found the shortest way home exactly.`);
    else out.push(`Her quickest trip home took ${quick.steps} steps.`);
    if (long.steps - long.shortest >= 10) out.push(`Her longest way round: ${long.steps} steps to get home, where ${long.shortest} would have done.`);
  }

  if (f.wolves) {
    const one = f.wolves === 1;
    out.push(r.walkingWolf
      ? `${one ? 'The walking wolf' : 'A walking wolf'} caught up with her in ${trips(r.walkingWolf)} of ${list.length}.`
      : `${one ? 'The walking wolf never' : 'No walking wolf ever'} caught up with her in ${list.length} trips.`);
  }

  const wolfHome = list.filter((t) => t.cakeBy === 'wolf' && t.outcome === 'home').length;
  if (r.cakeByWolf) out.push(`The wolf grabbed the cake ${times(r.cakeByWolf)}. ${wolfHome ? `She still got home in ${trips(wolfHome)}, without it.` : 'She never got home after that.'}`);
  if (r.cakeByFox) {
    const foxEaten = list.filter((t) => t.cakeBy === 'fox' && t.outcome === 'eaten').length;
    out.push(`The sly fox took the cake ${times(r.cakeByFox)}${foxEaten ? `; in ${trips(foxEaten)} of those, the next wolf den was the end` : ''}.`);
  }

  // The den that ended the most trips.
  const dens = new Map<number, number>();
  for (const t of list) if (t.outcome === 'eaten') { const d = t.positions[t.positions.length - 1]; dens.set(d, (dens.get(d) ?? 0) + 1); }
  const worst = [...dens.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 3 && dens.size > 1 && f.tiles[worst[0]] === WOLF) out.push(`One wolf den was the end of her ${times(worst[1])}; ${dens.size - 1} other den${dens.size === 2 ? '' : 's'} shared the rest.`);

  const bumpy = list.reduce((a, t) => (t.bumps > a.bumps ? t : a));
  if (bumpy.bumps >= 5) out.push(`Her bumpiest trip: ${bumpy.bumps} bumps into trees.`);

  const circles = list.filter((t) => t.circles).length;
  if (circles) out.push(`In ${trips(circles)} she went in circles (came to the same tile ${CIRCLE_VISITS} times or more).`);

  const picked = list.reduce((a, t) => a + t.treasurePicked, 0);
  const kept = list.reduce((a, t) => a + t.treasure, 0);
  if (picked) out.push(`She picked up ${picked} treasure${picked === 1 ? '' : 's'} in all${picked > kept ? `, and lost ${picked - kept} when a wolf ate her` : ''}.`);

  return out;
}
