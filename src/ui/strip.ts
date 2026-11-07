/** The memory strip: her context window as alternating view and move tokens. */
import type { History } from '../teachers';
import { MOVE_NAMES, Move } from '../world';
import { clear, h } from './dom';
import { moveToken, viewToken } from './symbols';

export function renderStrip(el: HTMLElement, hist: History | null, t: number, memory: number, nextMove?: Move | null) {
  clear(el);
  el.append(h('div', { class: 'strip-label' }, h('strong', {}, 'Memory strip'), h('span', {}, `she remembers ${memory} view–move pair${memory === 1 ? '' : 's'}`)));
  const row = h('div', { class: 'strip-row' });
  el.append(row);
  if (!hist || !hist.views.length) {
    row.append(h('span', { class: 'strip-empty' }, 'Tokens appear here as she walks: [view] [move] [view] [move] … → next move?'));
    return;
  }
  const extra = 3;
  const first = Math.max(0, t - memory - extra);
  if (first > 0) row.append(h('span', { class: 'strip-more' }, '…'));
  for (let i = first; i < t; i++) {
    const inMemory = i >= t - memory;
    const pair = h('span', { class: `strip-pair ${inMemory ? 'in' : 'out'}` });
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
