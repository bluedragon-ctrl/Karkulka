import { describe, expect, it } from 'vitest';
import { INSIGHTS } from '../src/insights';

describe('"How big models do it" insights', () => {
  it('has content for every tab', () => {
    for (const tab of ['forest', 'lessons', 'trip', 'practice', 'inside'] as const) {
      const ins = INSIGHTS[tab];
      expect(ins.title.length).toBeGreaterThan(0);
      expect(ins.items.length).toBeGreaterThanOrEqual(5);
      for (const it of ins.items) {
        expect(it.game.trim().length).toBeGreaterThan(0);
        expect(it.real.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
