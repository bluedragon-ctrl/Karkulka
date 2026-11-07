import { describe, expect, it } from 'vitest';
import { CARDS, pct } from '../src/explain';

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
