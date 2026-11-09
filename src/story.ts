/**
 * Her story after a trip alone: told from the trip record (where she started, the events she
 * met, her basket, swamps, bumps, how it ended), mixed with bits the storyteller makes up.
 * Each sentence is marked true or made up. The bolder she is, the more is made up: first
 * events borrowed from this forest that she never met (believable, like real hallucinations),
 * then pure fantasy. The start, the basket, the wolf, events that changed the basket and the
 * ending always come from the record, and a made-up part is never an event that changes the basket.
 */
import type { Rng } from './rng';
import type { Outcome } from './sim';
import { CAST, EventMet, STORY, eventKind, metText, placeOf } from './storyEvents';
import { FLOWERS, Forest, StepResult, SWAMP, TREASURE } from './world';

/** What really happened on a trip (a `Walker` plus the events it met). */
export interface TripRecord {
  forest: Forest;
  start: number;
  positions: readonly number[];
  results: readonly StepResult[];
  /** null: the trip was cut short with Stop. */
  outcome: Outcome | null;
  /** Forest events she met, in order (empty with events off). */
  met: readonly EventMet[];
  /** Event kinds placed in this forest; empty with events off (borrowed events then come from the whole cast). */
  placed: readonly number[];
  /** Who shaped her: her practice judge, or her teacher when she had no practice. */
  shapedBy: { by: 'judge' | 'teacher'; who: string } | null;
}

export type SentencePart = 'opening' | 'event' | 'basket' | 'swamp' | 'bumps' | 'ending' | 'closing' | 'borrowed' | 'fantasy';

export interface StorySentence {
  text: string;
  part: SentencePart;
  /** Made up by the storyteller, not in the trip record. */
  madeUp: boolean;
}

/** At most this many sentences before the closing line; extra sound events, swamps and bumps go first. */
export const MAX_SENTENCES = 7;
/** Below this boldness nothing is made up; from `FANTASY_FROM` pure fantasy joins borrowed events. */
export const MADE_UP_FROM = 0.5;
export const FANTASY_FROM = 1.2;

/**
 * How many made-up sentences a story gets on average at a boldness: none below 0.5; one in
 * about every other story at 0.7 (the default), about one at 1.0; then more, up to 4 at 2.5
 * (capped by the story length: about 3 of the 7 sentences in practice).
 */
export function madeUpExpected(boldness: number): number {
  if (boldness < MADE_UP_FROM) return 0;
  if (boldness < FANTASY_FROM) return Math.max(0, 0.5 + (boldness - 0.7) * (0.5 / 0.3));
  return 4 / 3 + (Math.min(boldness, 2.5) - FANTASY_FROM) * ((4 - 4 / 3) / (2.5 - FANTASY_FROM));
}

/** The share of made-up sentences that are pure fantasy rather than borrowed events: from 0 at 1.2 up to 0.6 at 2.5. */
export function fantasyShare(boldness: number): number {
  return boldness < FANTASY_FROM ? 0 : 0.6 * Math.min(1, (boldness - FANTASY_FROM) / (2.5 - FANTASY_FROM));
}

const pickFrom = (rng: Rng, list: readonly string[]): string => list[Math.floor(rng() * list.length)];

/** Who shaped her, for the closing line: the judge with the most practice runs, else the teacher with the most lessons. */
export function shapedBy(judgeRuns: Partial<Record<string, number>> | undefined, teacherCounts: Partial<Record<string, number>>): TripRecord['shapedBy'] {
  const most = (counts: Partial<Record<string, number>> | undefined) =>
    Object.entries(counts ?? {}).filter(([, n]) => (n ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0];
  const judge = most(judgeRuns);
  if (judge) return { by: 'judge', who: judge };
  const teacher = most(teacherCounts);
  return teacher ? { by: 'teacher', who: teacher } : null;
}

/** A true happening in the middle of the story, with the step it happened at. */
interface Happening { t: number; s: StorySentence; keep: boolean }

/**
 * Tell the story of a trip. The same record always gives the same true parts in the same
 * order; the wording and the made-up parts come from `rng` (so "Tell it again" differs).
 */
export function tellStory(rec: TripRecord, boldness: number, rng: Rng): StorySentence[] {
  const f = rec.forest;
  const truth = (text: string, part: SentencePart): StorySentence => ({ text, part, madeUp: false });

  // The middle, in the order it happened.
  const middle: Happening[] = [];
  // Starting on flowers or treasure, she picked them up before her first move.
  const startTile = f.tiles[rec.start];
  if (startTile === FLOWERS || startTile === TREASURE) middle.push({ t: 0, s: truth(pickFrom(rng, STORY.basket[startTile === FLOWERS ? 'flowers' : 'treasure']), 'basket'), keep: true });
  // A den with the wolf out is told once: a wolf-taught walk can go in and out of dens many times.
  const firstEmpty = rec.results.indexOf('empty');
  rec.results.forEach((r, k) => {
    if (r === 'grabbed' || (r === 'empty' && k === firstEmpty) || r === 'flowers' || r === 'treasure' || r === 'berries') middle.push({ t: k + 1, s: truth(pickFrom(rng, STORY.basket[r]), 'basket'), keep: true });
  });
  for (const e of rec.met) {
    const kind = eventKind(e.kind);
    if (!kind) continue;
    middle.push({ t: e.t, s: truth(metText(e), 'event'), keep: kind.trigger === 'step' });
  }
  const swampAt = rec.positions.findIndex((p, k) => k > 0 && f.tiles[p] === SWAMP && rec.positions[k - 1] !== p);
  if (swampAt > 0) middle.push({ t: swampAt, s: truth(pickFrom(rng, STORY.swamp), 'swamp'), keep: false });
  const bumpAt = rec.results.indexOf('blocked');
  if (bumpAt >= 0) middle.push({ t: bumpAt + 1, s: truth(pickFrom(rng, STORY.bumps), 'bumps'), keep: false });
  middle.sort((a, b) => a.t - b.t);

  // Made-up sentences: how many, then which.
  const expected = madeUpExpected(boldness);
  let madeUp = Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);

  // Too long? Sound events, swamps and bumps go first (the last ones first), leaving room for the
  // made-up parts expected at this boldness, so a retelling keeps the same true parts. Then, if
  // still too long, fewer made-up parts (keeping one).
  const trueRoom = MAX_SENTENCES - 2 - Math.round(expected);
  for (let k = dropIndex(middle); middle.length > trueRoom && k >= 0; k = dropIndex(middle)) middle.splice(k, 1);
  if (madeUp > 1) madeUp = Math.max(1, Math.min(madeUp, MAX_SENTENCES - 2 - middle.length));

  const met = new Set(rec.met.map((e) => e.kind));
  // Never an event that changes the basket: a made-up "the fox took the cake" would contradict how she arrived.
  const borrowable = (rec.placed.length ? rec.placed : CAST.map((k) => k.id)).filter((id) => !met.has(id) && !eventKind(id)?.effect);
  const fantasy = [...STORY.fantasy];
  const made: StorySentence[] = [];
  for (let k = 0; k < madeUp; k++) {
    const wantFantasy = rng() < fantasyShare(boldness) || !borrowable.length;
    if (wantFantasy && fantasy.length) {
      made.push({ text: fantasy.splice(Math.floor(rng() * fantasy.length), 1)[0], part: 'fantasy', madeUp: true });
    } else if (borrowable.length) {
      const kind = eventKind(borrowable.splice(Math.floor(rng() * borrowable.length), 1)[0])!;
      made.push({ text: pickFrom(rng, kind.versions), part: 'borrowed', madeUp: true });
    }
  }

  // Made-up parts slip in anywhere between the opening and the ending.
  const body = middle.map((m) => m.s);
  for (const m of made) body.splice(Math.floor(rng() * (body.length + 1)), 0, m);

  const lostCake = rec.results.includes('grabbed');
  const ending = rec.outcome === 'home' ? (lostCake ? STORY.endings.homeNoCake : STORY.endings.home)
    : rec.outcome === 'eaten' ? STORY.endings.eaten : rec.outcome === 'lost' ? STORY.endings.lost : STORY.endings.stopped;
  const out = [truth(pickFrom(rng, STORY.openings[placeOf(f, rec.start)]), 'opening'), ...body, truth(pickFrom(rng, ending), 'ending')];
  const closing = rec.shapedBy && STORY.shapedBy[rec.shapedBy.by][rec.shapedBy.who];
  if (closing) out.push(truth(closing, 'closing'));
  return out;
}

/** Which happening to leave out when the story is too long: the last sound event, then the bumps, then the swamp. */
function dropIndex(middle: Happening[]): number {
  const last = (test: (h: Happening) => boolean) => { for (let k = middle.length - 1; k >= 0; k--) if (test(middle[k])) return k; return -1; };
  for (const test of [(h: Happening) => h.s.part === 'event' && !h.keep, (h: Happening) => h.s.part === 'bumps', (h: Happening) => h.s.part === 'swamp']) {
    const k = last(test);
    if (k >= 0) return k;
  }
  return -1;
}

/** "4 true, 1 made up". */
export function storyCount(story: readonly StorySentence[]): string {
  const made = story.filter((s) => s.madeUp).length;
  return `${story.length - made} true, ${made} made up`;
}
