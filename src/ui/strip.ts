/** The memory strip: her context window as alternating view and move tokens. */
import type { History } from '../teachers';
import { MOVE_NAMES, Move } from '../world';
import { clear, h } from './dom';
import { basketSymbols, moveToken, viewToken } from './symbols';
import { fullBasket } from '../world';

/**
 * `hint` is an optional "?" button for the label, `basketHint` one for the pinned basket.
 * The basket squares sit at the left, pinned: the scrolling steps move past them.
 */
export function renderStrip(el: HTMLElement, hist: History | null, t: number, memory: number, nextMove?: Move | null, hint?: Node, basketHint?: Node) {
  clear(el);
  el.append(h('div', { class: 'strip-label' }, h('strong', {}, 'Memory strip', hint ?? null), h('span', {}, `her basket, pinned, and her last ${memory === 1 ? 'step' : `${memory} steps`}`)));
  const basket = hist?.baskets[Math.min(t, hist.baskets.length - 1)] ?? fullBasket();
  const pinned = h('span', { class: 'strip-pinned', title: 'Her basket: pinned at the front of her memory, it never scrolls out' },
    h('span', { class: 'pin', 'aria-hidden': 'true' }, 'pinned'), ...basketSymbols(basket).map((tok) => h('span', { class: 'tok' }, tok)), basketHint ?? null);
  const row = h('div', { class: 'strip-row' });
  el.append(h('div', { class: 'strip-body' }, pinned, row));
  if (!hist || !hist.views.length) {
    row.append(h('span', { class: 'strip-empty' }, 'As she walks, what she sees and which way she goes appear here in turn: [view] [move] [view] [move] … → next move?'));
    return;
  }
  // Only what she remembers: her last `memory` steps and what she sees now, exactly what the model reads.
  const first = Math.max(0, t - memory);
  if (first > 0) row.append(h('span', { class: 'strip-more', title: 'older steps she has forgotten' }, '…'));
  for (let i = first; i < t; i++) {
    const pair = h('span', { class: 'strip-pair in' });
    pair.append(h('span', { class: 'tok', title: `view at step ${i + 1}` }, viewToken(hist.views[i])));
    pair.append(h('span', { class: 'tok', title: `move at step ${i + 1}: ${MOVE_NAMES[hist.moves[i]]}` }, moveToken(hist.moves[i], 27)));
    row.append(pair);
  }
  if (hist.views[t]) {
    row.append(h('span', { class: 'strip-pair in now' },
      h('span', { class: 'tok', title: 'what she sees now' }, viewToken(hist.views[t])),
      h('span', { class: 'arrow-next' }, '→'),
      nextMove === undefined || nextMove === null
        ? h('span', { class: 'tok qmark', title: 'next move?' }, '?')
        : h('span', { class: 'tok', title: `next: ${MOVE_NAMES[nextMove]}` }, moveToken(nextMove, 27)),
    ));
  }
  requestAnimationFrame(() => { row.scrollLeft = row.scrollWidth; });
}
