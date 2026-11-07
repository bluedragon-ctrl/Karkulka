/** Small "?" buttons next to controls and results; each opens its LM corner card as a popup. */
import { CARDS, CARD_DETAILS, CardKey } from '../explain';
import { h } from './dom';

let pop: HTMLDivElement | null = null;
let owner: HTMLButtonElement | null = null;
/** Which button the open popup belongs to, so it can follow the button when a panel is redrawn. */
let openId: string | null = null;

function ensurePop(): HTMLDivElement {
  if (pop) return pop;
  pop = h('div', { class: 'lm-pop', id: 'lm-pop', role: 'dialog', 'aria-labelledby': 'lm-pop-head', tabindex: -1, hidden: true });
  document.body.append(pop);
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (openId && !pop!.contains(t) && !(t instanceof Element && t.closest('.hint-q'))) closeHint();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openId) { const b = owner; closeHint(); b?.focus(); }
  });
  window.addEventListener('resize', placeHint);
  document.addEventListener('scroll', placeHint, true);
  return pop;
}

/**
 * Put the popup under its button (or above it when there is no room), inside the window.
 * After a redraw it follows a replaced button, or closes when the button is gone.
 */
export function placeHint() {
  if (!pop || !openId) return;
  if (!owner?.isConnected) {
    owner = document.querySelector<HTMLButtonElement>(`.hint-q[data-hint-id="${openId}"]`);
    if (!owner) { closeHint(); return; }
    owner.setAttribute('aria-expanded', 'true');
  }
  const r = owner.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) { closeHint(); return; }
  const gap = 8;
  const w = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const left = Math.max(gap, Math.min(window.innerWidth - w - gap, r.left + r.width / 2 - w / 2));
  const below = r.bottom + gap + ph <= window.innerHeight || r.top - gap - ph < 0;
  pop.style.left = `${left}px`;
  pop.style.top = `${below ? r.bottom + gap : r.top - gap - ph}px`;
  pop.classList.toggle('above', !below);
  pop.style.setProperty('--arrow-x', `${Math.max(14, Math.min(w - 14, r.left + r.width / 2 - left))}px`);
}

export function closeHint() {
  if (!pop) return;
  pop.hidden = true;
  owner?.setAttribute('aria-expanded', 'false');
  owner = null;
  openId = null;
}

function openHint(btn: HTMLButtonElement, key: CardKey, id: string, byKeyboard: boolean) {
  const p = ensurePop();
  owner?.setAttribute('aria-expanded', 'false');
  owner = btn;
  openId = id;
  p.replaceChildren(
    h('div', { class: 'lm-card-head' },
      h('span', { id: 'lm-pop-head' }, 'LM corner'),
      h('button', { class: 'icon', 'aria-label': 'Close', onclick: () => { const b = owner; closeHint(); b?.focus(); } }, '×')),
    h('p', {}, CARDS[key]),
    ...details(key),
  );
  p.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  placeHint();
  if (byKeyboard) p.focus();
}

/** The numbers behind a card, if it has any. */
function details(key: CardKey): HTMLElement[] {
  const d = CARD_DETAILS[key];
  if (!d) return [];
  return [h('p', { class: 'lm-detail-title' }, d.title), h('ul', { class: 'lm-detail' }, ...d.lines().map((l) => h('li', {}, l)))];
}

export interface HintOptions {
  /** Pulse the button: something just happened that this card explains. */
  fresh?: boolean;
  /** Tells buttons with the same card apart, so an open popup follows the right one after a redraw. */
  place?: string;
  /** Called when the card is opened. */
  onOpen?: (key: CardKey) => void;
}

/** A small "?" button that shows the LM corner card for `key`. */
export function hintButton(key: CardKey, opts: HintOptions = {}): HTMLButtonElement {
  const id = opts.place ? `${key}-${opts.place}` : key;
  const btn = h('button', {
    type: 'button', class: `hint-q ${opts.fresh ? 'fresh' : ''}`, 'data-hint': key, 'data-hint-id': id,
    'aria-label': 'What does this mean for a language model?', title: 'What does this mean for a language model?',
    'aria-haspopup': 'dialog', 'aria-controls': 'lm-pop', 'aria-expanded': String(openId === id),
    onclick: (e: MouseEvent) => {
      // Inside a <label>, a click must not also tick the checkbox or pick the radio button.
      e.preventDefault();
      e.stopPropagation();
      if (openId === id && owner === btn) { closeHint(); return; }
      openHint(btn, key, id, e.detail === 0);
      opts.onOpen?.(key);
    },
  }, '?');
  // A redraw replaced the button of the open popup: follow the new one.
  if (openId === id) requestAnimationFrame(placeHint);
  return btn;
}
