import { describe, expect, it } from 'vitest';
import { BIG, CARDS } from '../src/explain';

describe('LM corner cards', () => {
  it('every card has a short, plain text', () => {
    for (const [key, text] of Object.entries(CARDS)) {
      expect(text.trim().length, key).toBeGreaterThan(20);
      // They open as small popups next to a "?" button, so they must stay short.
      expect(text.length, key).toBeLessThan(500);
    }
  });

  it('every "In a big model" part is short and belongs to a card', () => {
    expect(Object.keys(BIG).length).toBeGreaterThan(20);
    for (const [key, text] of Object.entries(BIG)) {
      expect(CARDS[key as keyof typeof CARDS], key).toBeDefined();
      expect(text!.trim().length, key).toBeGreaterThan(20);
      expect(text!.length, key).toBeLessThan(500);
    }
  });
});
