/** The memory strip: her context window as alternating view and move tokens. */
import type { History } from '../teachers';
import { ENERGY_NAMES, asSeenBy, energyLevel } from '../tokens';
import { MOVE_NAMES, Move } from '../world';
import { clear, h } from './dom';
import { basketSymbols, energySymbol, moveToken, viewToken } from './symbols';
import { Basket, fullBasket } from '../world';

/**
 * `hint` is an optional "?" button for the label, `basketHint` one for the pinned basket, `energyHint` one for the energy square.
 * The basket and energy squares sit at the left, pinned: the scrolling steps move past them.
 * `wolfToken`: she tells walking wolves from dens, so the strip shows him as his own token; otherwise as a den.
 */
/** With no walk (`hist` null), `idleBasket` is the basket shown pinned: what is packed for her next trip. */
export function renderStrip(el: HTMLElement, hist: History | null, t: number, memory: number, nextMove?: Move | null, hint?: Node, basketHint?: Node, wolfToken = false, energyHint?: Node, idleBasket?: Basket) {
  const seen = (i: number) => viewToken(asSeenBy({ wolfToken }, hist!.views[i]));
  clear(el);
  el.append(h('div', { class: 'strip-label' }, h('strong', {}, 'Memory strip', hint ?? null), h('span', {}, `her basket and energy, pinned, and her last ${memory === 1 ? 'step' : `${memory} steps`}`)));
  const basket = hist?.baskets[Math.min(t, hist.baskets.length - 1)] ?? idleBasket ?? fullBasket();
  const level = hist?.energy.length ? energyLevel(hist.energy[Math.min(t, hist.energy.length - 1)]) : ENERGY_NAMES.length - 1;
  const pinned = h('span', { class: 'strip-pinned', title: 'Her basket and her energy: pinned at the front of her memory, they never scroll out' },
    h('span', { class: 'pin', 'aria-hidden': 'true' }, 'pinned'), ...basketSymbols(basket).map((tok) => h('span', { class: 'tok' }, tok)), basketHint ?? null,
    h('span', { class: 'tok' }, energySymbol(level, ENERGY_NAMES[level])), energyHint ?? null);
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
    pair.append(h('span', { class: 'tok', title: `view at step ${i + 1}` }, seen(i)));
    pair.append(h('span', { class: 'tok', title: `move at step ${i + 1}: ${MOVE_NAMES[hist.moves[i]]}` }, moveToken(hist.moves[i], 27)));
    row.append(pair);
  }
  if (hist.views[t]) {
    row.append(h('span', { class: 'strip-pair in now' },
      h('span', { class: 'tok', title: 'what she sees now' }, seen(t)),
      h('span', { class: 'arrow-next' }, '→'),
      nextMove === undefined || nextMove === null
        ? h('span', { class: 'tok qmark', title: 'next move?' }, '?')
        : h('span', { class: 'tok', title: `next: ${MOVE_NAMES[nextMove]}` }, moveToken(nextMove, 27)),
    ));
  }
  requestAnimationFrame(() => { row.scrollLeft = row.scrollWidth; });
}
