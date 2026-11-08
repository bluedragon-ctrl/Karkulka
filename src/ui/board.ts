/** The forest board: tiles, overlays, figures, arrows and fog, all in one SVG. */
import { DX, DY, Forest, Move, MOVE_NAMES, Tile, isWalkable, xyOf } from '../world';
import { clear, s } from './dom';
import { COLORS, TeacherFigure, arrowPath, heartPath, parentFigure, redFigure, tileSymbol, walkingWolf, wolfHead } from './symbols';

export const T = 40;

type Layer = 'tiles' | 'heat' | 'radius' | 'changed' | 'trails' | 'trace' | 'marks' | 'actors' | 'arrows' | 'fog' | 'events' | 'fx' | 'talk';
const LAYERS: Layer[] = ['tiles', 'heat', 'radius', 'changed', 'trails', 'trace', 'marks', 'actors', 'arrows', 'fog', 'events', 'fx', 'talk'];

export class Board {
  readonly svg: SVGSVGElement;
  private readonly layers = {} as Record<Layer, SVGGElement>;
  private forest!: Forest;
  private tileEls: SVGGElement[] = [];
  /** Flower and treasure tiles already picked on the trip shown: drawn faded. */
  private picked = new Set<number>();
  private red: SVGGElement;
  private redInner: SVGGElement;
  private sweat: SVGElement;
  private energyBar: SVGGElement;
  private parent: SVGGElement | null = null;
  private parentWho: TeacherFigure | null = null;
  /** The walking wolf (an option): drawn as a wolf for the player; to her he is a den. */
  private wolf: SVGGElement;
  private painting = false;
  private redPos = -1;
  /** Her thought bubble: follows her, drawn above everything (fog and outcome pictures too). */
  private talk: SVGGElement;
  private talkLines: string[] | null = null;
  private talkBelow = false;
  private talkTimer = 0;
  /** Where the bubble was laid out (it keeps inside the board, so it depends on where she is). */
  private talkAt = -1;
  private hoverEl: SVGRectElement;

  onTileDown?: (i: number) => void;
  onTileDrag?: (i: number) => void;
  /** Show a hover outline on tiles (when they are clickable). */
  interactive = false;

  constructor(parent: HTMLElement) {
    this.svg = s('svg', { class: 'board', role: 'img', 'aria-label': 'The forest' });
    for (const l of LAYERS) this.svg.append((this.layers[l] = s('g', { class: `layer-${l}` })));
    this.hoverEl = s('rect', { width: T, height: T, fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-dasharray': '4 3', visibility: 'hidden', 'pointer-events': 'none' });
    this.layers.fx.append(this.hoverEl);

    this.red = s('g', { class: 'actor red', visibility: 'hidden' });
    this.redInner = s('g', {}, redFigure(T * 0.95));
    this.sweat = s('path', { d: 'M 10 -14 Q 14 -8 10 -5 Q 6 -8 10 -14 Z', fill: '#4aa3df', visibility: 'hidden' });
    this.energyBar = s('g', { transform: `translate(${-T * 0.4},${-T * 0.52})` });
    this.red.append(this.redInner, this.sweat, this.energyBar);
    this.wolf = s('g', { class: 'actor wolf', visibility: 'hidden' }, walkingWolf(T * 0.95), s('title', {}, 'The walking wolf: to her he looks like a wolf den'));
    this.layers.actors.append(this.wolf, this.red);
    this.talk = s('g', { class: 'actor', visibility: 'hidden', 'pointer-events': 'none' });
    this.layers.talk.append(this.talk);
    parent.append(this.svg);

    this.svg.addEventListener('pointerdown', (e) => {
      const i = this.tileFromEvent(e);
      if (i < 0) return;
      this.painting = true;
      this.onTileDown?.(i);
    });
    this.svg.addEventListener('pointermove', (e) => {
      const i = this.tileFromEvent(e);
      if (this.interactive && i >= 0) {
        const [x, y] = xyOf(this.forest, i);
        this.hoverEl.setAttribute('x', String(x * T));
        this.hoverEl.setAttribute('y', String(y * T));
        this.hoverEl.setAttribute('visibility', 'visible');
      } else this.hoverEl.setAttribute('visibility', 'hidden');
      if (this.painting && i >= 0) this.onTileDrag?.(i);
    });
    this.svg.addEventListener('pointerleave', () => this.hoverEl.setAttribute('visibility', 'hidden'));
    window.addEventListener('pointerup', () => { this.painting = false; });
  }

  private tileFromEvent(e: PointerEvent): number {
    if (!this.forest) return -1;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return -1;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const x = Math.floor(p.x / T);
    const y = Math.floor(p.y / T);
    if (x < 0 || y < 0 || x >= this.forest.size || y >= this.forest.size) return -1;
    return y * this.forest.size + x;
  }

  private center(i: number): [number, number] {
    const [x, y] = xyOf(this.forest, i);
    return [x * T + T / 2, y * T + T / 2];
  }

  setForest(f: Forest) {
    this.forest = f;
    const px = f.size * T;
    this.svg.setAttribute('viewBox', `0 0 ${px} ${px}`);
    clear(this.layers.tiles);
    this.tileEls = f.tiles.map((t, i) => {
      const [x, y] = xyOf(f, i);
      const el = tileSymbol(t, x * T, y * T, T);
      this.layers.tiles.append(el);
      return el;
    });
    this.picked.clear();
  }

  updateTile(i: number, t: Tile) {
    const [x, y] = xyOf(this.forest, i);
    const el = tileSymbol(t, x * T, y * T, T);
    this.tileEls[i].replaceWith(el);
    this.tileEls[i] = el;
    this.picked.delete(i);
  }

  /**
   * Fade the flower and treasure tiles she already picked on this trip: they stay on the
   * board (she still sees them), but stepping there again adds nothing to her basket.
   */
  setPicked(tiles: readonly number[] | null) {
    const next = new Set(tiles ?? []);
    // The first child is the tile's ground; only the flowers or the gem on it fade.
    const fade = (i: number, on: boolean) => Array.from(this.tileEls[i]?.children ?? []).slice(1)
      .forEach((c) => (on ? c.setAttribute('opacity', '0.3') : c.removeAttribute('opacity')));
    for (const i of this.picked) if (!next.has(i)) fade(i, false);
    for (const i of next) if (!this.picked.has(i)) fade(i, true);
    this.picked = next;
  }

  setHeat(values: number[] | null, label = 'lessons passed here') {
    clear(this.layers.heat);
    if (!values) return;
    const max = Math.max(1, ...values);
    values.forEach((v, i) => {
      const [x, y] = xyOf(this.forest, i);
      if (i === this.forest.home) return;
      if (v <= 0) {
        if (isWalkable(this.forest.tiles[i])) {
          this.layers.heat.append(s('rect', { x: x * T + 3, y: y * T + 3, width: T - 6, height: T - 6, fill: 'none', stroke: COLORS.heat, 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0.6 }, s('title', {}, `0 ${label}`)));
        }
        return;
      }
      this.layers.heat.append(s('rect', { x: x * T, y: y * T, width: T, height: T, fill: COLORS.heat, opacity: (0.15 + 0.6 * Math.sqrt(v / max)).toFixed(2) }, s('title', {}, `${v} ${label}`)));
    });
  }

  /** Dashed yellow-and-black edges on tiles that changed since her lessons. */
  setChanged(tiles: readonly number[] | null) {
    clear(this.layers.changed);
    if (!tiles) return;
    for (const i of tiles) {
      const [x, y] = xyOf(this.forest, i);
      const box = { x: x * T + 2, y: y * T + 2, width: T - 4, height: T - 4, fill: 'none', 'pointer-events': 'none' };
      this.layers.changed.append(
        s('rect', { ...box, stroke: COLORS.ink, 'stroke-width': 4 }),
        s('rect', { ...box, stroke: COLORS.changed, 'stroke-width': 4, 'stroke-dasharray': '5 4' }, s('title', {}, 'changed since her lessons')));
    }
  }

  /**
   * "Show events" (for testing): each hidden event spot's kind number in a small white circle
   * with a dark border, drawn above the fog. Event spots are otherwise never drawn.
   */
  setEventMarks(spots: readonly { i: number; kind: number; name?: string }[] | null) {
    clear(this.layers.events);
    if (!spots) return;
    for (const sp of spots) {
      const [x, y] = xyOf(this.forest, sp.i);
      this.layers.events.append(s('g', { transform: `translate(${x * T + T - 10},${y * T + T - 10})`, 'pointer-events': 'none' },
        s('circle', { r: 8.5, fill: '#fff', stroke: COLORS.ink, 'stroke-width': 1.5 }),
        s('text', { y: 3.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: COLORS.ink }, String(sp.kind)),
        sp.name ? s('title', {}, sp.name) : null));
    }
  }

  setRadius(tiles: Set<number> | null) {
    clear(this.layers.radius);
    if (!tiles) return;
    for (const i of tiles) {
      const [x, y] = xyOf(this.forest, i);
      this.layers.radius.append(s('rect', { x: x * T + 2, y: y * T + 2, width: T - 4, height: T - 4, fill: 'none', stroke: '#e07b00', 'stroke-width': 1.5, 'stroke-dasharray': '5 3', opacity: 0.7 }));
    }
  }

  clearTrails() { clear(this.layers.trails); }

  addTrail(positions: number[], color: string, opacity = 0.12, width = 3) {
    if (positions.length < 2) return;
    const jitter = () => (Math.random() - 0.5) * T * 0.3;
    const jx = jitter();
    const jy = jitter();
    const d = positions.map((p, k) => { const [x, y] = this.center(p); return `${k ? 'L' : 'M'} ${x + jx} ${y + jy}`; }).join(' ');
    this.layers.trails.append(s('path', { d, stroke: color, 'stroke-width': width, fill: 'none', opacity, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    while (this.layers.trails.childElementCount > 400) this.layers.trails.firstChild!.remove();
  }

  setTrace(positions: number[] | null) {
    clear(this.layers.trace);
    if (!positions || positions.length < 2) return;
    const d = positions.map((p, k) => { const [x, y] = this.center(p); return `${k ? 'L' : 'M'} ${x} ${y}`; }).join(' ');
    this.layers.trace.append(s('path', { d, stroke: COLORS.red, 'stroke-width': 3, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round', fill: 'none', opacity: 0.7 }));
  }

  setStart(i: number | null) {
    clear(this.layers.marks);
    if (i === null) return;
    const [x, y] = xyOf(this.forest, i);
    this.layers.marks.append(s('g', { transform: `translate(${x * T + 6},${y * T + 4})` },
      s('rect', { x: 0, y: 0, width: 2, height: 16, fill: COLORS.ink }),
      s('polygon', { points: '2,0 12,4 2,8', fill: COLORS.ink })));
  }

  setRed(i: number | null, opts: { energy?: number; sitting?: boolean; animate?: boolean } = {}) {
    if (i === null) { this.red.setAttribute('visibility', 'hidden'); this.redPos = -1; this.talk.setAttribute('visibility', 'hidden'); return; }
    const [cx, cy] = this.center(i);
    this.red.classList.toggle('no-anim', opts.animate === false);
    this.red.style.transform = `translate(${cx}px, ${cy}px)`;
    this.red.setAttribute('visibility', 'visible');
    this.redPos = i;
    this.talk.classList.toggle('no-anim', opts.animate === false);
    this.talk.style.transform = `translate(${cx}px, ${cy}px)`;
    if (this.talkLines && this.talkAt !== i) this.drawTalk(false);
    else this.talk.setAttribute('visibility', this.talkLines ? 'visible' : 'hidden');
    this.redInner.setAttribute('transform', opts.sitting ? `translate(0 ${T * 0.12}) scale(1 0.75)` : '');
    clear(this.energyBar);
    if (opts.energy !== undefined) {
      const e = Math.max(0, Math.min(1, opts.energy));
      this.energyBar.append(
        s('rect', { width: T * 0.8, height: 5, fill: '#fff', stroke: '#333', 'stroke-width': 0.8 }),
        s('rect', { width: T * 0.8 * e, height: 5, fill: e < 0.25 ? '#e07b00' : '#3a9d3a' }),
      );
      this.sweat.setAttribute('visibility', e < 0.25 && !opts.sitting ? 'visible' : 'hidden');
    } else this.sweat.setAttribute('visibility', 'hidden');
  }

  /** The walking wolf on tile i, or hidden (null or -1: not out, or gone with the cake). */
  setWolf(i: number | null, animate = true) {
    if (i === null || i < 0) { this.wolf.setAttribute('visibility', 'hidden'); return; }
    const [cx, cy] = this.center(i);
    this.wolf.classList.toggle('no-anim', !animate);
    this.wolf.style.transform = `translate(${cx}px, ${cy}px)`;
    this.wolf.setAttribute('visibility', 'visible');
  }

  setParent(i: number | null, who: TeacherFigure = 'mother') {
    if (i === null) { this.parent?.setAttribute('visibility', 'hidden'); return; }
    if (!this.parent || this.parentWho !== who) {
      this.parent?.remove();
      this.parent = s('g', { class: 'actor parent' }, parentFigure(T * 0.95, who));
      this.parentWho = who;
      this.layers.actors.prepend(this.parent);
    }
    const [cx, cy] = this.center(i);
    this.parent.style.transform = `translate(${cx + T * 0.18}px, ${cy - T * 0.05}px)`;
    this.parent.setAttribute('visibility', 'visible');
  }

  /** Four arrows around her; thickness shows probability. */
  setArrows(i: number | null, probs?: ArrayLike<number>, tints?: (string | null)[], highlight?: Move) {
    clear(this.layers.arrows);
    if (i === null || !probs) return;
    const [cx, cy] = this.center(i);
    for (let m = 0 as Move; m < 4; m = (m + 1) as Move) {
      const p = probs[m];
      const w = 2 + 13 * p;
      const color = tints?.[m] ?? COLORS.ink;
      const path = s('path', {
        d: arrowPath(m, cx, cy, T * 0.98, w),
        fill: color, opacity: (0.35 + 0.65 * p).toFixed(2), stroke: highlight === m ? '#fff' : 'none', 'stroke-width': 2,
        class: 'prob-arrow',
      }, s('title', {}, `${MOVE_NAMES[m]}: ${(p * 100).toFixed(1)}%`));
      this.layers.arrows.append(path);
    }
  }

  setFog(i: number | null) {
    clear(this.layers.fog);
    if (i === null) return;
    const [x, y] = xyOf(this.forest, i);
    const px = this.forest.size * T;
    const id = 'fog-mask';
    this.layers.fog.append(
      s('mask', { id }, s('rect', { width: px, height: px, fill: '#fff' }), s('rect', { x: (x - 1) * T, y: (y - 1) * T, width: T * 3, height: T * 3, rx: 6, fill: '#000' })),
      s('rect', { width: px, height: px, fill: '#18261a', opacity: 0.94, mask: `url(#${id})`, 'pointer-events': 'none' }),
    );
  }

  /**
   * Her thought, in a bubble over her head (or below her, near the top edge or when asked).
   * Call it after `setRed` has placed her. It follows her as she walks; after `ms` it goes
   * away, and with no `ms` it stays until the next thought or `clearFx`.
   */
  say(lines: string[] | null, opts: { ms?: number; below?: boolean } = {}) {
    clearTimeout(this.talkTimer);
    this.talkLines = lines?.length ? lines : null;
    this.talkBelow = !!opts.below;
    this.drawTalk(true);
    if (this.talkLines && opts.ms) this.talkTimer = window.setTimeout(() => this.say(null), opts.ms);
  }

  private drawTalk(fresh = false) {
    const lines = this.talkLines;
    this.talkAt = -1;
    if (!lines || this.redPos < 0) { this.talk.setAttribute('visibility', 'hidden'); if (!lines) clear(this.talk); return; }
    this.talkAt = this.redPos;
    const [cx, cy] = this.center(this.redPos);
    const px = this.forest.size * T;
    const fs = 14, lh = 17, pad = 7;
    const text = s('text', { 'font-size': fs, 'text-anchor': 'middle', fill: COLORS.ink });
    lines.forEach((l, k) => text.append(s('tspan', { x: 0, y: k * lh }, l)));
    clear(this.talk);
    const body = s('g', fresh ? { class: 'fx-talk' } : {});
    this.talk.append(body);
    body.append(text);
    let tw = 0;
    try { tw = text.getBBox().width; } catch { /* not laid out yet */ }
    if (!tw) tw = Math.max(...lines.map((l) => l.length)) * fs * 0.52;
    const w = tw + pad * 2;
    const hgt = lines.length * lh + pad * 2 - 4;
    // Keep the bubble inside the board.
    let left = T * 0.15 - w / 2;
    left = Math.min(Math.max(left, 2 - cx), px - 2 - w - cx);
    const below = this.talkBelow || cy - T * 0.88 - hgt < 2;
    const top = below ? T * 0.8 : -T * 0.88 - hgt;
    const dots = below ? [[4, T * 0.56, 2.2], [8, T * 0.68, 3.2]] : [[4, -T * 0.56, 2.2], [8, -T * 0.7, 3.2]];
    const shape = { fill: '#fff', stroke: COLORS.ink, 'stroke-width': 1.3 };
    body.prepend(
      ...dots.map(([x, y, r]) => s('circle', { cx: x, cy: y, r, ...shape })),
      s('rect', { x: left, y: top, width: w, height: hgt, rx: 9, ...shape }));
    text.setAttribute('transform', `translate(${left + w / 2},${top + pad + fs - 2})`);
    this.talk.setAttribute('visibility', 'visible');
  }

  clearFx() {
    this.say(null);
    for (const c of [...this.layers.fx.children]) if (c !== this.hoverEl) c.remove();
    this.svg.classList.remove('faded');
  }

  showWolf(i: number) {
    const [cx, cy] = this.center(i);
    const g = s('g', { class: 'fx-wolf', transform: `translate(${cx},${cy})` }, s('g', { class: 'pop' }, wolfHead(T * 2.2)));
    this.layers.fx.append(g);
    setTimeout(() => this.svg.classList.add('faded'), 700);
  }

  showHearts(i: number) {
    const [cx, cy] = this.center(i);
    const g = s('g', { transform: `translate(${cx},${cy})` });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      g.append(s('path', { d: heartPath(Math.cos(a) * T * 0.9, Math.sin(a) * T * 0.9, T * 0.18), fill: k % 2 ? COLORS.home : '#e86a8a', class: 'float-heart', style: `animation-delay:${k * 80}ms` }));
    }
    this.layers.fx.append(g);
  }

  /** A little "Ouch!" with a bump star where she walked into a tree. Gone after a moment. */
  showOuch(i: number, m: Move) {
    const [cx, cy] = this.center(i);
    const x = cx + DX[m] * T * 0.45;
    const y = cy + DY[m] * T * 0.45 - T * 0.35;
    const star = 'M 0 -9 L 2.6 -3.6 8.6 -2.8 4.2 1.4 5.3 7.3 0 4.5 -5.3 7.3 -4.2 1.4 -8.6 -2.8 -2.6 -3.6 Z';
    const g = s('g', { transform: `translate(${x},${y})`, 'pointer-events': 'none' },
      s('g', { class: 'fx-ouch' },
        s('path', { d: star, transform: 'scale(1.3)', fill: '#f2c14e', stroke: COLORS.ink, 'stroke-width': 1 }),
        s('text', { x: 0, y: -13, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: COLORS.ink, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, 'Ouch!')));
    this.flash(g, 1000);
  }

  /** A short pop-up word over her (the wolf grabbed the cake, flowers or treasure picked, a forest event). Gone after a moment. */
  showPop(i: number, text: string, icon?: SVGElement, lift = 0) {
    const [cx, cy] = this.center(i);
    // `lift`: when several pop up at once, each next one a row higher.
    const g = s('g', { transform: `translate(${cx},${cy - T * 0.7 - lift * 18})`, 'pointer-events': 'none' },
      s('g', { class: 'fx-ouch' },
        icon ? s('g', { transform: `translate(0 ${T * 0.15})` }, icon) : null,
        s('text', { x: 0, y: -T * 0.3, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: COLORS.ink, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, text)));
    this.flash(g, 1400);
  }

  /** A splash of water drops around her feet in a swamp. Gone after a moment. */
  showSplash(i: number) {
    const [cx, cy] = this.center(i);
    const g = s('g', { transform: `translate(${cx},${cy + T * 0.3})`, 'pointer-events': 'none' });
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.62;
      const dx = Math.cos(a) * T * 0.62;
      const dy = Math.sin(a) * T * 0.5;
      g.append(s('g', { transform: `translate(${dx.toFixed(1)},${dy.toFixed(1)})` },
        s('path', { d: 'M 0 -7 Q 5 0 5 2 A 5 5 0 0 1 -5 2 Q -5 0 0 -7 Z', fill: '#4aa3df', stroke: COLORS.waterInk, 'stroke-width': 1.2, class: 'fx-drop', style: `animation-delay:${k * 40}ms` })));
    }
    this.flash(g, 800);
  }

  private flash(g: SVGElement, ms: number) {
    this.layers.fx.append(g);
    setTimeout(() => g.remove(), ms);
  }

  showLostNote(i: number) {
    const [cx, cy] = this.center(i);
    this.layers.fx.append(s('g', { transform: `translate(${cx},${cy - T})` },
      s('rect', { x: -64, y: -16, width: 128, height: 24, rx: 6, fill: '#fff', stroke: '#333' }),
      s('text', { x: 0, y: 1, 'text-anchor': 'middle', 'font-size': 13, fill: COLORS.ink }, 'lost in the woods…')));
  }
}
