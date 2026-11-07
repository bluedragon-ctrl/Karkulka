/** Tiny DOM helpers. */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

const PROPS = new Set(['checked', 'value', 'disabled', 'selected', 'innerHTML', 'textContent']);

function apply(el: Element, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (PROPS.has(k)) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k === 'className' ? 'class' : k, v === true ? '' : String(v));
  }
}

export function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

const NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export const clear = (el: Element) => { el.replaceChildren(); return el; };

/** Append children to an element, skipping empty ones. */
export const add = (el: Element, ...children: Child[]) => append(el, children);
