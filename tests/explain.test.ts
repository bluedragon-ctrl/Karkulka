import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/explain';

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
