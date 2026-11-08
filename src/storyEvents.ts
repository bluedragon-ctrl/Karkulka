/**
 * Hidden forest events: an owl, a frog, an empty hut… She cannot see them and no judge
 * scores them, so they never change her walk. Walking through one makes it happen, and
 * the trip story tells about it afterwards. The cast and all story wording live in
 * `data/storyEvents.json`; this module types it, places the events in a forest (seeded,
 * from the current tiles) and works out which events a trip set off.
 */
import data from './data/storyEvents.json';
import { parentRouteTiles } from './forest';
import { Rng, rngFrom, shuffle } from './rng';
import { Forest, HOME, MOVES, PATH, SWAMP, TREE, WOLF, neighbor, tileAt, walkingDistances, xyOf } from './world';

/** Places the code knows; a kind's `fits` must be one of them. */
export const PLACES = ['anywhere', 'swamp', 'den', 'home', 'deadEnd', 'corridor', 'crossing', 'open'] as const;
export type Place = typeof PLACES[number];
export const TRIGGERS = ['step', 'hear'] as const;
export type Trigger = typeof TRIGGERS[number];

export interface EventKind {
  /** The kind number: permanent, never reused (the "Show events" button draws it). */
  id: number;
  name: string;
  fits: Place;
  /** `step`: when she steps onto the spot; `hear`: when the spot first comes into her 3 × 3 view. */
  trigger: Trigger;
  /** Story sentences, one per way it can turn out. */
  versions: string[];
  /** Her thought lines when it happens. */
  thoughts: string[];
  /** The short pop-up word over her. */
  popup: string;
}

export interface StoryData {
  events: EventKind[];
  fantasy: string[];
  openings: Record<Place, string[]>;
  basket: { grabbed: string[]; flowers: string[]; treasure: string[] };
  swamp: string[];
  bumps: string[];
  endings: { home: string[]; homeNoCake: string[]; eaten: string[]; lost: string[]; stopped: string[] };
  shapedBy: { teacher: Record<string, string>; judge: Record<string, string> };
}

export const STORY = data as StoryData;
export const CAST: readonly EventKind[] = STORY.events;
const BY_ID = new Map(CAST.map((k) => [k.id, k]));
export const eventKind = (id: number): EventKind | undefined => BY_ID.get(id);

/** The longest a pop-up word may be. */
export const MAX_POPUP = 16;

/** Problems in the data file (empty when it is fine); the tests run this. */
export function checkStoryData(d: StoryData): string[] {
  const errors: string[] = [];
  const ids = new Set<number>();
  const text = (s: unknown, where: string) => { if (typeof s !== 'string' || !s.trim()) errors.push(`${where}: empty text`); };
  for (const k of d.events) {
    const w = `event ${k.id} (${k.name})`;
    if (!Number.isInteger(k.id) || k.id < 1) errors.push(`${w}: id must be a whole number from 1`);
    if (ids.has(k.id)) errors.push(`${w}: id used twice`);
    ids.add(k.id);
    text(k.name, w);
    if (!PLACES.includes(k.fits)) errors.push(`${w}: unknown place "${k.fits}"`);
    if (!TRIGGERS.includes(k.trigger)) errors.push(`${w}: unknown trigger "${k.trigger}"`);
    if (!Array.isArray(k.versions) || k.versions.length < 2) errors.push(`${w}: needs at least 2 versions`);
    if (!Array.isArray(k.thoughts) || k.thoughts.length < 1) errors.push(`${w}: needs at least 1 thought`);
    [...(k.versions ?? []), ...(k.thoughts ?? [])].forEach((s) => text(s, w));
    text(k.popup, w);
    if (typeof k.popup === 'string' && k.popup.length > MAX_POPUP) errors.push(`${w}: pop-up longer than ${MAX_POPUP} characters`);
  }
  const lists: [string, unknown][] = [
    ['fantasy', d.fantasy], ['swamp', d.swamp], ['bumps', d.bumps],
    ...Object.entries(d.basket).map(([k, v]) => [`basket.${k}`, v] as [string, unknown]),
    ...Object.entries(d.endings).map(([k, v]) => [`endings.${k}`, v] as [string, unknown]),
    ...PLACES.map((p) => [`openings.${p}`, d.openings?.[p]] as [string, unknown]),
  ];
  for (const [name, list] of lists) {
    if (!Array.isArray(list) || !list.length) errors.push(`${name}: needs at least one line`);
    else list.forEach((s) => text(s, name));
  }
  for (const who of ['teacher', 'judge'] as const) Object.entries(d.shapedBy[who]).forEach(([k, s]) => text(s, `shapedBy.${who}.${k}`));
  return errors;
}

// ---------- places ----------

/** Tiles she can pass through or end on, next to tile i (trees and the map edge are not a way out). */
export function waysOut(f: Forest, i: number): number {
  return MOVES.filter((m) => { const n = neighbor(f, i, m); return n >= 0 && f.tiles[n] !== TREE; }).length;
}

/** Part of a 2 × 2 block with no tree: a meadow, not a corridor. */
function inMeadow(f: Forest, i: number): boolean {
  const [x, y] = xyOf(f, i);
  const open = (a: number, b: number) => tileAt(f, a, b) !== TREE;
  return [[-1, -1], [0, -1], [-1, 0], [0, 0]].some(([dx, dy]) =>
    open(x + dx, y + dy) && open(x + dx + 1, y + dy) && open(x + dx, y + dy + 1) && open(x + dx + 1, y + dy + 1));
}

/** How far a den may be for the `den` place, and home for the `home` place (in steps). */
export const NEAR_DEN = 2;
export const NEAR_HOME = 4;

/** A test for each place, worked out once for a forest. */
export function placeTests(f: Forest): (place: Place, i: number) => boolean {
  const homeDist = walkingDistances(f);
  let quiet: Set<number> | null = null; // worked out only when asked: it walks both parents' routes
  const offRoutes = (i: number) => !(quiet ??= parentRouteTiles(f)).has(i);
  const dens = f.tiles.flatMap((t, i) => (t === WOLF ? [xyOf(f, i)] : []));
  const nearDen = (i: number) => { const [x, y] = xyOf(f, i); return dens.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) <= NEAR_DEN); };
  const byNeighbour = (i: number, t: number) => MOVES.some((m) => { const n = neighbor(f, i, m); return n >= 0 && f.tiles[n] === t; });
  const straight = (i: number) => {
    const open = MOVES.filter((m) => { const n = neighbor(f, i, m); return n >= 0 && f.tiles[n] !== TREE; });
    return open.length === 2 && Math.abs(open[0] - open[1]) === 2;
  };
  return (place, i) => {
    switch (place) {
      case 'anywhere': return true;
      case 'swamp': return f.tiles[i] === SWAMP || byNeighbour(i, SWAMP);
      case 'den': return nearDen(i);
      case 'home': return homeDist[i] >= 0 && homeDist[i] <= NEAR_HOME;
      case 'deadEnd': return waysOut(f, i) === 1 || offRoutes(i);
      case 'corridor': return straight(i);
      case 'crossing': return waysOut(f, i) >= 3 && !inMeadow(f, i);
      case 'open': return waysOut(f, i) >= 3;
    }
  };
}

/** The place of a tile for the story's opening, the most telling one first. */
export function placeOf(f: Forest, i: number): Place {
  const fits = placeTests(f);
  for (const p of ['den', 'swamp', 'home', 'deadEnd', 'crossing', 'open', 'corridor'] as const) if (fits(p, i)) return p;
  return 'anywhere';
}

// ---------- placement ----------

/** Event spots per forest: measured, an average trip meets 2.2 events (32 forest codes, after 100 lessons from either parent). */
export const SPOT_COUNT = 18;

export interface EventSpot { i: number; kind: number }

/**
 * The seed of a placement. Fixed places (the default): from the forest code and size, so every
 * trip in a forest code meets the events in the same places. "New places every trip": any other
 * label, such as a random number from the story's randomness when she starts.
 */
export const fixedSeed = (f: Forest): string => `${f.code}:${f.size}`;
export const tripSeed = (n: number): string => `trip:${n >>> 0}`;

/** Whether two tiles are within each other's 3 × 3 view. */
const inView = (f: Forest, a: number, b: number): boolean => {
  const [ax, ay] = xyOf(f, a);
  const [bx, by] = xyOf(f, b);
  return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
};

/**
 * Where the event spots go, from the tiles alone: shuffled path and swamp tiles (never a
 * den, home, flowers or treasure), taken one by one while none is within another's view.
 * Its own seeded stream (from `seed`), so the forest's tiles, codes and links do not change.
 */
export function eventSpotTiles(f: Forest, count = SPOT_COUNT, seed = fixedSeed(f)): number[] {
  const rng = rngFrom(`story:${seed}`);
  const spots: number[] = [];
  const candidates = shuffle(rng, f.tiles.flatMap((t, i) => (t === PATH || t === SWAMP ? [i] : [])));
  for (const i of candidates) {
    if (spots.length >= count) break;
    if (spots.some((j) => inView(f, i, j))) continue;
    spots.push(i);
  }
  return spots;
}

/**
 * The events of a forest: the spots first (`eventSpotTiles`), then each spot gets a kind
 * that fits its place and is not used yet in this forest, from a second seeded stream (a kind
 * with its own place first, so "anywhere" kinds do not take the rarer spots).
 * Adding kinds to the cast never moves the spots. A spot where no unused kind fits stays empty.
 */
export function placeStoryEvents(f: Forest, cast: readonly EventKind[] = CAST, count = SPOT_COUNT, seed = fixedSeed(f)): EventSpot[] {
  const rng = rngFrom(`storyKinds:${seed}`);
  const fits = placeTests(f);
  const used = new Set<number>();
  const out: EventSpot[] = [];
  for (const i of eventSpotTiles(f, count, seed)) {
    // A kind with its own place goes first; "anywhere" kinds fill the rest, so they don't take a rare spot.
    const fitting = cast.filter((k) => !used.has(k.id) && fits(k.fits, i));
    const special = fitting.filter((k) => k.fits !== 'anywhere');
    const options = special.length ? special : fitting;
    const r = rng(); // one draw per spot, so a spot's kind does not shift the stream for the next
    if (!options.length) continue;
    const k = options[Math.floor(r * options.length)];
    used.add(k.id);
    out.push({ i, kind: k.id });
  }
  return out;
}

// ---------- on a trip ----------

/** One event she set off: which spot and kind, at which step (1 = after her first move), and how it turned out. */
export interface EventMet { spot: number; kind: number; t: number; version: number }

/**
 * Whether the spot sets off at step t of her positions: a `step` event when she steps onto
 * it (not when she starts there or stays put after a bump), a `hear` event when it comes into
 * her 3 × 3 view.
 */
function setsOffAt(f: Forest, s: EventSpot, positions: readonly number[], t: number): boolean {
  const k = eventKind(s.kind);
  if (!k || t < 1) return false;
  const now = positions[t];
  const before = positions[t - 1];
  if (f.tiles[now] === WOLF || f.tiles[now] === HOME) return false; // her trip ended there
  if (k.trigger === 'step') return now === s.i && before !== s.i;
  return inView(f, now, s.i) && !inView(f, before, s.i);
}

/** Every event a trip set off, in order, each at most once (versions left at 0). */
export function eventsSetOff(f: Forest, spots: readonly EventSpot[], positions: readonly number[]): EventMet[] {
  const out: EventMet[] = [];
  const done = new Set<number>();
  for (let t = 1; t < positions.length; t++) {
    for (const s of spots) {
      if (done.has(s.i) || !setsOffAt(f, s, positions, t)) continue;
      done.add(s.i);
      out.push({ spot: s.i, kind: s.kind, t, version: 0 });
    }
  }
  return out;
}

/**
 * Follows a trip alone step by step and says which events just happened. How each one
 * turns out (its version) is picked when it happens, from the story's own randomness,
 * never the walk's, so events never change her walk.
 */
export class EventTracker {
  readonly met: EventMet[] = [];
  private checked = 0;
  private readonly done = new Set<number>();

  constructor(readonly forest: Forest, readonly spots: readonly EventSpot[], private readonly rng: Rng) {}

  /** Call after each step (or after several): the events set off since the last call. */
  after(positions: readonly number[]): EventMet[] {
    const fresh: EventMet[] = [];
    for (let t = Math.max(1, this.checked + 1); t < positions.length; t++) {
      for (const s of this.spots) {
        if (this.done.has(s.i) || !setsOffAt(this.forest, s, positions, t)) continue;
        this.done.add(s.i);
        const k = eventKind(s.kind)!;
        const e = { spot: s.i, kind: s.kind, t, version: Math.floor(this.rng() * k.versions.length) };
        this.met.push(e);
        fresh.push(e);
      }
    }
    this.checked = Math.max(this.checked, positions.length - 1);
    return fresh;
  }
}
