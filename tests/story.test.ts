import { describe, expect, it } from 'vitest';
import { generateForest } from '../src/forest';
import { createAdam, createModel } from '../src/model';
import { mulberry32 } from '../src/rng';
import { Walker } from '../src/sim';
import { MAX_SENTENCES, TripRecord, fantasyShare, madeUpExpected, shapedBy, storyCount, tellStory } from '../src/story';
import { CAST, EventTracker, SPOT_COUNT, STORY, eventKind, eventSpotTiles, metText, placeOf, placeStoryEvents, tripSeed } from '../src/storyEvents';
import { FIXED, newStats, trainLessons } from '../src/train';
import { FLOWERS } from '../src/world';

/** Some real trips in one forest, with the events they met (basket events included). */
function trips(n = 30): TripRecord[] {
  const f = generateForest('KARKULKA');
  const rng = mulberry32(5);
  const model = createModel({ memory: 3, hint: false, hidden: FIXED.hidden }, rng);
  trainLessons(model, createAdam(model), f, 'father', 60, newStats(f), rng);
  const starts = eventSpotTiles(f, 60);
  return Array.from({ length: n }, (_, k) => {
    // New places every trip, so the trips meet the basket events too.
    const spots = placeStoryEvents(f, CAST, SPOT_COUNT, tripSeed(k));
    const w = new Walker(f, model, starts[k % starts.length], 80, 1.2, mulberry32(k));
    const tr = new EventTracker(f, spots, mulberry32(50 + k));
    w.events = tr; // basket events act on her basket too
    w.run();
    return { forest: f, start: w.start, positions: w.positions, results: w.results, outcome: w.outcome, met: tr.met, placed: spots.map((s) => s.kind), shapedBy: { by: 'teacher', who: 'father' } };
  });
}

describe('her story', () => {
  const recs = trips();

  it('tells about flowers or treasure she started on', () => {
    const f = generateForest('KARKULKA');
    const start = f.tiles.indexOf(FLOWERS);
    const rec: TripRecord = { forest: f, start, positions: [start], results: [], outcome: null, met: [], placed: [], shapedBy: null };
    const story = tellStory(rec, 0.1, mulberry32(1));
    expect(story[1].part).toBe('basket');
    expect(STORY.basket.flowers).toContain(story[1].text);
  });

  it('has trips with a basket event she met, told as it turned out', () => {
    const withEffect = recs.filter((rec) => rec.met.some((e) => eventKind(e.kind)!.effect));
    expect(withEffect.length).toBeGreaterThan(0);
    withEffect.forEach((rec, k) => {
      const texts = tellStory(rec, 2.5, mulberry32(k)).map((s) => s.text);
      for (const e of rec.met.filter((m) => eventKind(m.kind)!.effect)) expect(texts).toContain(metText(e));
    });
  });

  it('makes nothing up below boldness 0.5', () => {
    recs.forEach((rec, k) => {
      for (const b of [0.1, 0.3, 0.49]) expect(tellStory(rec, b, mulberry32(k)).every((s) => !s.madeUp)).toBe(true);
    });
  });

  it('always tells the start, the basket, the wolf and the ending from the record', () => {
    recs.forEach((rec, k) => {
      for (const b of [0.3, 1, 2.5]) {
        const story = tellStory(rec, b, mulberry32(k * 7));
        expect(story[0].part).toBe('opening');
        expect(STORY.openings[placeOf(rec.forest, rec.start)]).toContain(story[0].text);
        const ending = story.find((s) => s.part === 'ending')!;
        const grabbed = rec.results.includes('grabbed') || rec.met.some((e) => e.effect === 'takeCake');
        const endings = { home: grabbed ? STORY.endings.homeNoCake : STORY.endings.home, eaten: STORY.endings.eaten, lost: STORY.endings.lost }[rec.outcome!];
        expect(endings).toContain(ending.text);
        expect(story.filter((s) => s.part === 'basket').length).toBe(rec.results.filter((r, k) => r === 'grabbed' || (r === 'empty' && k === rec.results.indexOf('empty')) || r === 'flowers' || r === 'treasure' || r === 'berries').length);
        // Every event she stepped on is told, as it turned out.
        for (const e of rec.met) {
          const kind = eventKind(e.kind)!;
          if (kind.trigger === 'step') expect(story.map((s) => s.text)).toContain(metText(e));
        }
        expect(story.at(-1)!.part).toBe('closing');
        expect(story.filter((s) => s.madeUp).every((s) => s.part === 'borrowed' || s.part === 'fantasy')).toBe(true);
      }
    });
  });

  it('borrows only events of this forest that she did not meet, and adds fantasy only when bold', () => {
    recs.forEach((rec, k) => {
      const met = new Set(rec.met.map((e) => eventKind(e.kind)!.versions).flat());
      for (const b of [0.7, 1, 1.1]) {
        for (const s of tellStory(rec, b, mulberry32(k + 100)).filter((x) => x.madeUp)) {
          expect(s.part).toBe('borrowed');
          const kind = CAST.find((c) => c.versions.includes(s.text))!;
          expect(rec.placed).toContain(kind.id);
          expect(met.has(s.text)).toBe(false);
        }
      }
    });
    // Never a made-up basket event, even when one is placed and she did not meet it.
    const madeUp = recs.flatMap((rec, k) => [0.7, 1, 1.5, 2.5].flatMap((b) => tellStory(rec, b, mulberry32(k + 7)))).filter((s) => s.part === 'borrowed');
    for (const s of madeUp) expect(CAST.find((c) => c.versions.includes(s.text))!.effect).toBeUndefined();
    expect(recs.some((rec) => rec.placed.some((id) => eventKind(id)!.effect && !rec.met.some((e) => e.kind === id)))).toBe(true);
    const bold = recs.flatMap((rec, k) => tellStory(rec, 2.5, mulberry32(k)));
    expect(bold.some((s) => s.part === 'fantasy')).toBe(true);
  });

  it('makes up more the bolder she is', () => {
    const share = (b: number) => {
      const all = recs.flatMap((rec, k) => [0, 1, 2, 3].flatMap((j) => tellStory(rec, b, mulberry32(k * 10 + j))));
      return all.filter((s) => s.madeUp).length / all.length;
    };
    expect(share(0.7)).toBeLessThan(share(1.0));
    expect(share(1.0)).toBeLessThan(share(1.5));
    expect(share(1.5)).toBeLessThan(share(2.5));
    expect(madeUpExpected(0.7)).toBeCloseTo(0.5);
    expect(madeUpExpected(1.0)).toBeCloseTo(1);
    expect(fantasyShare(1.1)).toBe(0);
  });

  it('stays short: at most 7 sentences before the closing line, unless what must be told is longer', () => {
    recs.forEach((rec, k) => {
      const story = tellStory(rec, 2.5, mulberry32(k));
      const must = 2 + rec.results.filter((r, k) => r === 'grabbed' || (r === 'empty' && k === rec.results.indexOf('empty')) || r === 'flowers' || r === 'treasure' || r === 'berries').length
        + rec.met.filter((e) => eventKind(e.kind)!.trigger === 'step').length;
      expect(story.length - 1).toBeLessThanOrEqual(Math.max(MAX_SENTENCES, must + 1));
    });
  });

  it('tells it again with the same true parts in the same order', () => {
    recs.forEach((rec, k) => {
      const parts = (seed: number) => tellStory(rec, 1.5, mulberry32(seed)).filter((s) => !s.madeUp && (s.part === 'event')).map((s) => s.text);
      expect(parts(k)).toEqual(parts(k + 1000));
    });
  });

  it('counts true and made-up sentences', () => {
    expect(storyCount([{ text: 'a', part: 'opening', madeUp: false }, { text: 'b', part: 'fantasy', madeUp: true }])).toBe('1 true, 1 made up');
  });

  it('names who shaped her: the practice judge, else the teacher', () => {
    expect(shapedBy({ magpie: 300, grandma: 100 }, { mother: 50 })).toEqual({ by: 'judge', who: 'magpie' });
    expect(shapedBy(undefined, { mother: 50, father: 80 })).toEqual({ by: 'teacher', who: 'father' });
    expect(shapedBy({}, {})).toBeNull();
  });
});
