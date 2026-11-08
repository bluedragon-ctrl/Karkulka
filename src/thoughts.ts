/**
 * Her little thoughts on a trip alone, just for fun: a line or two after some moves.
 * They are made up after each move is already picked, from what she saw and how likely
 * the move was, so she can say "Scary wolf to the south! Let's go south."
 * She speaks in compass words, as on a map: up the screen is north, down is south,
 * left is west and right is east.
 */
import type { Rng } from './rng';
import type { Outcome } from './sim';
import { DX, DY, Forest, HOME, Move, StepResult, SWAMP, VIEW_OFFSETS, WOLF, tileAt, xyOf } from './world';

/** What a thought needs to know about the trip so far (a `Walker` fits). */
export interface TripState {
  readonly forest: Forest;
  readonly positions: readonly number[];
  readonly history: { readonly moves: readonly Move[]; readonly sectors: readonly number[] };
  readonly blocked: readonly boolean[];
  /** What each step did (the wolf grabbed the cake, flowers picked…); optional. */
  readonly results?: readonly StepResult[];
  readonly decisions: readonly { readonly tempered: ArrayLike<number> }[];
  readonly energy: number;
  readonly energyLeft: number;
  readonly outcome: Outcome | null;
  readonly pos: number;
  readonly t: number;
}

type Line = string | ((dir: string) => string);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How sure she sounds follows the probability of the move she took. */
export const SURE: readonly Line[] = [(d) => `${cap(d)}, of course.`, (d) => `Definitely ${d}.`, (d) => `${cap(d)} for sure!`, (d) => `I know this: ${d}.`];
export const LIKELY: readonly Line[] = [(d) => `Let's go ${d}.`, (d) => `Probably ${d}.`, (d) => `${cap(d)} sounds like a good idea.`, (d) => `I think ${d}.`];
export const UNSURE: readonly Line[] = [(d) => `Hmm… ${d}? Why not.`, (d) => `Maybe ${d}?`, (d) => `Let's try ${d}.`, (d) => `No idea… ${d}?`];
export const SURE_FROM = 0.75;
export const LIKELY_FROM = 0.4;

export const WOLF_LINES: readonly Line[] = [
  (d) => `Scary wolf ${d}!`, 'Beware of the wolf!', (d) => `A wolf den ${d}! Eek!`, (d) => `Monster ${d}!`,
  'Eek, a wolf den!', (d) => `Something growls ${d}…`,
];
/** Only when the den lies the way she is going. */
const WOLF_AHEAD: readonly Line[] = ['Wolf ahead!'];
export const BUMP_LINES: readonly Line[] = ['Ouch!', 'I hit a tree.', 'Why is a tree standing here?', 'Who put this tree here?', 'Ouch, my nose!', 'Silly tree!', 'Sorry, tree.'];
export const HOME_SEEN: readonly Line[] = ["I see Grandma's house!", 'Almost home!', "Grandma's house! So close!", 'There it is!'];
export const TIRED: readonly (readonly Line[])[] = [
  [],
  ['I am getting tired.', 'This is a long walk.', 'Are we there yet?'],
  ['My legs hurt.', 'I need a rest soon.', 'So… many… steps.'],
  ['I am so sleepy…', 'Yawn… so tired.', 'Just a few more steps…'],
];
export const SWAMP_LINES: readonly Line[] = ['Splash! Wet feet.', 'Yuck, mud!', 'Squelch, squelch.', 'My socks are soaked!'];
export const LOOP_LINES: readonly Line[] = ["Haven't I been here before?", 'This place looks familiar…', 'Am I going in circles?'];
export const CAKE_LINES: readonly Line[] = ['Mmm, I smell cake!', 'Cake! This way, I think.'];
export const HOME_LINES: readonly Line[] = ['Finally!', 'Hello, Grandma!', 'Made it!', 'Home at last!'];
export const LOST_LINES: readonly Line[] = ['I need a nap…', "I'll just sit here a bit.", 'Too tired to walk on…', 'Zzz…'];
export const EATEN_LINES: readonly Line[] = ['Uh-oh…', 'Oh no!'];
export const GRABBED_LINES: readonly Line[] = ['The wolf grabbed the cake! I ran away.', 'Eek! He took the cake. Run!', 'My cake! At least I got away.'];
export const FLOWER_LINES: readonly Line[] = ['Flowers for Grandma!', 'Pretty flowers!', 'Grandma will love these.'];
export const TREASURE_LINES: readonly Line[] = ['Ooh, treasure!', 'Shiny! Mine now.', 'A treasure! Lucky me.'];

/** Compass name of each move (up the screen is north), in move order: up, right, down, left. */
export const COMPASS = ['north', 'east', 'south', 'west'] as const;

/** Where a view offset lies from her, in compass words: "to the north", "to the south-west". */
export function placeWord(dx: number, dy: number): string {
  const ns = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
  const ew = dx > 0 ? 'east' : dx < 0 ? 'west' : '';
  return `to the ${ns && ew ? `${ns}-${ew}` : ns || ew}`;
}
/** The move's compass name: north, east, south or west. */
export const moveWord = (m: Move): string => COMPASS[m];

/** Compass sector (0 = east, counter-clockwise, as in `homeSector`) of each move. */
const MOVE_SECTOR = [2, 0, 6, 4] as const;

/** Steps that must pass after a thought before the next one, by kind. */
const GAP = { event: 2, swamp: 3, loop: 4, chatter: 6 } as const;

export class Thoughts {
  private lastAt = -100;
  private lastLoopAt = -100;
  private tiredSaid = 0;
  private homeSaid = false;
  private readonly densSaid = new Set<number>();
  private readonly lastPick = new Map<readonly Line[], number>();

  constructor(private readonly rng: Rng, private readonly hint = false) {}

  /** Call after every step of the trip; returns her thought (one or two lines), or null to stay quiet. */
  after(w: TripState): string[] | null {
    const lines = this.think(w);
    if (lines) this.lastAt = w.t;
    return lines;
  }

  private think(w: TripState): string[] | null {
    const t = w.t;
    if (t < 1) return null;
    const f = w.forest;
    const m = w.history.moves[t - 1];
    const from = w.positions[t - 1];
    const p = w.decisions[t - 1]?.tempered[m] ?? 0.5;
    const decision = () => this.say(p >= SURE_FROM ? SURE : p >= LIKELY_FROM ? LIKELY : UNSURE, moveWord(m));
    const gap = t - this.lastAt;
    const chance = (x: number) => this.rng() < x;

    if (w.outcome === 'home') return [this.say(HOME_LINES)];
    if (w.outcome === 'lost') return [this.say(LOST_LINES)];
    if (w.outcome === 'eaten') {
      return chance(0.75) ? [this.wolfLine(m, DX[m], DY[m]), decision()] : [this.say(EATEN_LINES)];
    }

    // The basket: always worth a thought.
    const res = w.results?.[t - 1];
    if (res === 'grabbed') {
      for (const x of densAround(f, w.pos)) this.densSaid.add(x.i);
      return [this.say(GRABBED_LINES)];
    }
    if (res === 'flowers') return [this.say(FLOWER_LINES)];
    if (res === 'treasure') return [this.say(TREASURE_LINES)];

    if (w.blocked[t - 1] && gap >= GAP.event && chance(0.7)) {
      return chance(0.35) ? [decision(), this.say(BUMP_LINES)] : [this.say(BUMP_LINES)];
    }

    // Dens she saw when she picked this move, and had not thought about yet.
    const dens = densAround(f, from).filter((d) => !this.densSaid.has(d.i));
    if (dens.length && gap >= GAP.event) {
      const d = dens.find((d) => d.dx === DX[m] && d.dy === DY[m]) ?? dens.find((d) => sameWay(m, d.dx, d.dy)) ?? dens[0];
      for (const x of densAround(f, from)) this.densSaid.add(x.i);
      return [this.wolfLine(m, d.dx, d.dy), decision()];
    }

    if (!this.homeSaid && seesHome(f, w.pos) && gap >= GAP.event) {
      this.homeSaid = true;
      return [this.say(HOME_SEEN)];
    }

    const left = w.energyLeft / Math.max(1, w.energy);
    const tired = left <= 0.1 ? 3 : left <= 0.25 ? 2 : left <= 0.5 ? 1 : 0;
    if (tired > this.tiredSaid && gap >= GAP.event) {
      this.tiredSaid = tired;
      return [this.say(TIRED[tired])];
    }

    if (f.tiles[w.pos] === SWAMP && f.tiles[from] !== SWAMP && gap >= GAP.swamp && chance(0.6)) return [this.say(SWAMP_LINES)];

    const visits = w.positions.filter((q) => q === w.pos).length;
    if (visits >= 3 && t - this.lastLoopAt >= 12 && gap >= GAP.loop && chance(0.5)) {
      this.lastLoopAt = t;
      return [this.say(LOOP_LINES)];
    }

    if (gap < GAP.chatter) return null;
    const sector = w.history.sectors[t - 1];
    const towardCake = sector !== undefined && Math.min((sector - MOVE_SECTOR[m] + 8) % 8, (MOVE_SECTOR[m] - sector + 8) % 8) <= 1;
    if (this.hint && towardCake && chance(0.12)) return [this.say(CAKE_LINES), decision()];
    if (chance(0.2)) return [decision()];
    return null;
  }

  private wolfLine(m: Move, dx: number, dy: number): string {
    const lines = sameWay(m, dx, dy) ? [...WOLF_LINES, ...WOLF_AHEAD] : WOLF_LINES;
    return this.say(lines, placeWord(dx, dy), WOLF_LINES);
  }

  /** A random line from the list, never the same as the last one picked from it. */
  private say(lines: readonly Line[], dir = '', key: readonly Line[] = lines): string {
    const last = this.lastPick.get(key) ?? -1;
    let k = Math.floor(this.rng() * lines.length);
    if (k === last && lines.length > 1) k = (k + 1) % lines.length;
    this.lastPick.set(key, k);
    const line = lines[k];
    return typeof line === 'string' ? line : line(dir);
  }
}

/** Whether a view offset lies (at least partly) the way the move goes. */
function sameWay(m: Move, dx: number, dy: number): boolean {
  return (DX[m] !== 0 && dx === DX[m]) || (DY[m] !== 0 && dy === DY[m]);
}

function densAround(f: Forest, pos: number): { i: number; dx: number; dy: number }[] {
  const [x, y] = xyOf(f, pos);
  return VIEW_OFFSETS
    .filter(([dx, dy]) => tileAt(f, x + dx, y + dy) === WOLF)
    .map(([dx, dy]) => ({ i: (y + dy) * f.size + x + dx, dx, dy }));
}

function seesHome(f: Forest, pos: number): boolean {
  const [x, y] = xyOf(f, pos);
  return VIEW_OFFSETS.some(([dx, dy]) => tileAt(f, x + dx, y + dy) === HOME);
}
