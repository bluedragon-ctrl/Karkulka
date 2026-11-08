import { describe, expect, it } from 'vitest';
import { CARDS, CARD_DETAILS, pct } from '../src/explain';

describe('LM corner cards', () => {
  it('every card has a short, plain text', () => {
    for (const [key, text] of Object.entries(CARDS)) {
      expect(text.trim().length, key).toBeGreaterThan(20);
      // They open as small popups next to a "?" button, so they must stay short,
      // even with the comparison to a real chatbot.
      expect(text.length, key).toBeLessThan(300);
    }
  });

  it('most cards compare the idea with a real chatbot', () => {
    const withChatbot = Object.values(CARDS).filter((t) => /chatbot/i.test(t));
    expect(withChatbot.length).toBeGreaterThan(30);
  });
});

describe('percentages in her notes', () => {
  it('never rounds a real chance to 0% or 100%', () => {
    expect(pct(0.003)).toBe('less than 1%');
    expect(pct(0.997)).toBe('over 99%');
    expect(pct(0.42)).toBe('42%');
    expect(pct(0)).toBe('0%');
    expect(pct(1)).toBe('100%');
  });
});

describe('the numbers behind the judges', () => {
  it('every judge card lists how a run is scored', () => {
    for (const key of ['judgeGrandma', 'judgeFather', 'judgeMother', 'judgeCrow', 'judgeWolf'] as const) {
      const d = CARD_DETAILS[key];
      expect(d, key).toBeDefined();
      expect(d!.lines().length, key).toBeGreaterThan(1);
      expect(d!.lines().some((l) => /[+−]\d|^0 /.test(l)), key).toBe(true);
    }
  });
});

describe('what she picked', () => {
  it('always names both counts out of how many the forest has', async () => {
    const { pickupLine } = await import('../src/explain');
    expect(pickupLine({ flowers: 1, treasure: 0, flowersInForest: 3, treasureInForest: 2 })).toBe('Picked 1 of 3 flower patches and 0 of 2 treasures.');
    expect(pickupLine({ flowers: 0, treasure: 1, flowersInForest: 1, treasureInForest: 1 })).toBe('Picked 0 of 1 flower patch and 1 of 1 treasure.');
  });

  it('counts pickups on a trip, even when the wolf eats her afterwards', async () => {
    const { generateForest } = await import('../src/forest');
    const { createModel } = await import('../src/model');
    const { mulberry32 } = await import('../src/rng');
    const { Walker } = await import('../src/sim');
    const { FLOWERS, TREASURE, neighbor, MOVES, isWalkable } = await import('../src/world');
    const f = generateForest('KARKULKA');
    const flower = f.tiles.indexOf(FLOWERS);
    const m = createModel({ memory: 1, hint: false, hidden: 8 }, mulberry32(1));
    // Start next to a flower patch and step onto it by hand.
    const mv = MOVES.find((d) => { const n = neighbor(f, flower, d); return n >= 0 && isWalkable(f.tiles[n]); })!;
    const start = neighbor(f, flower, mv);
    const w = new Walker(f, m, start, 50, 1, mulberry32(2));
    w.trip.picked.push(flower);
    const p = w.pickups;
    expect(p.flowers).toBe(1);
    expect(p.treasure).toBe(0);
    expect(p.flowersInForest).toBe(f.tiles.filter((t) => t === FLOWERS).length);
    expect(p.treasureInForest).toBe(f.tiles.filter((t) => t === TREASURE).length);
  });
});
