/** Simple symbolic SVG shapes, drawn for this project. Shape plus colour, never colour alone. */
import { BERRIES, Basket, DX, DY, FLOWERS, HOME, Move, PATH, SWAMP, Seen, TREASURE, TREE, Tile, WALKER, WOLF } from '../world';
import { s } from './dom';

export const COLORS = {
  path: '#ecdfb8',
  meadow: '#b8d39a',
  tree: '#2f6b3a',
  trunk: '#6b4a2b',
  den: '#3b2e27',
  danger: '#c62828',
  home: '#f2c14e',
  roof: '#8a4b16',
  red: '#d62828',
  skin: '#f3d2ad',
  mother: '#7b4fb8',
  father: '#1f78b4',
  ink: '#2a2a2a',
  lost: '#7d7d7d',
  heat: '#00a3a3',
  /** Edge of a tile that changed after her lessons (dashed, with black). */
  changed: '#ffd400',
  water: '#8cc3d9',
  waterInk: '#2f6f8f',
  reed: '#5b7a2e',
  grandma: '#5f7a8a',
  hair: '#d9d9d9',
  crow: '#1f1f24',
  beak: '#e0a020',
  /** Flowers: white petals round a pink middle. */
  petal: '#ffffff',
  bloom: '#d65aa0',
  stem: '#4f8a3a',
  /** Treasure: a violet gem (yellow is home's, red is hers and danger's). */
  gem: '#8e44ad',
  gemLight: '#c39bd3',
  gemInk: '#4a235a',
  /** Cake in her basket. */
  cake: '#c98a4b',
  icing: '#fff6e8',
  /** The magpie's blue tail and wing. */
  magpie: '#2d6cdf',
  /** The huntsman's olive coat. */
  huntsman: '#6b8e23',
  /** A berry bush: a round leafy bush with indigo berries (never red: red is hers and danger's). */
  bush: '#4f8a3a',
  bushInk: '#2f5a24',
  berry: '#3d3f9e',
  /** The hedgehog's brown spines. */
  hedgehog: '#8d6e63',
  spines: '#5d4037',
  /** The energy token's battery. */
  battery: '#3f8f4f',
};

/** A round leafy bush centred on (cx, cy) with half-width r; with its indigo berries unless eaten (bare). */
export function bush(cx: number, cy: number, r: number, bare = false): SVGGElement {
  const leaf = (x: number, y: number, k: number) => s('circle', { cx: cx + x * r, cy: cy + y * r, r: k * r, fill: COLORS.bush, stroke: COLORS.bushInk, 'stroke-width': r * 0.08 });
  const g = s('g', { opacity: bare ? 0.55 : 1 }, leaf(-0.45, 0.2, 0.55), leaf(0.45, 0.2, 0.55), leaf(0, -0.25, 0.6), leaf(0, 0.35, 0.5));
  if (!bare) {
    for (const [x, y] of [[-0.45, 0.1], [0.1, -0.35], [0.5, 0.25], [-0.05, 0.4], [0.3, -0.05], [-0.3, -0.25]]) {
      g.append(s('circle', { cx: cx + x * r, cy: cy + y * r, r: r * 0.16, fill: COLORS.berry, stroke: '#1d1f5e', 'stroke-width': r * 0.04 }));
    }
  }
  return g;
}

/**
 * A battery with 0–3 bars for her energy level (0 = almost none … 3 = plenty), centred on
 * (cx, cy) with half-width r: the number of bars says it, not only the colour.
 */
export function battery(cx: number, cy: number, r: number, level: number): SVGGElement {
  const w = r * 1.7;
  const hgt = r * 1.0;
  const x0 = cx - w / 2 - r * 0.08;
  const g = s('g', {},
    s('rect', { x: x0, y: cy - hgt / 2, width: w, height: hgt, rx: r * 0.15, fill: '#fff', stroke: COLORS.ink, 'stroke-width': r * 0.14 }),
    s('rect', { x: x0 + w, y: cy - hgt * 0.22, width: r * 0.18, height: hgt * 0.44, fill: COLORS.ink }));
  const bw = (w - r * 0.4) / 3;
  for (let k = 0; k < level; k++) {
    g.append(s('rect', { x: x0 + r * 0.17 + k * (bw + r * 0.03), y: cy - hgt / 2 + r * 0.17, width: bw - r * 0.03, height: hgt - r * 0.34, fill: level === 0 ? COLORS.lost : COLORS.battery }));
  }
  return g;
}

/** A small flower centred on (cx, cy): five white petals round a pink middle. */
function flower(cx: number, cy: number, r: number): SVGElement[] {
  const out: SVGElement[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5 - Math.PI / 2;
    out.push(s('circle', { cx: cx + Math.cos(a) * r * 0.62, cy: cy + Math.sin(a) * r * 0.62, r: r * 0.42, fill: COLORS.petal, stroke: '#9a9a9a', 'stroke-width': r * 0.08 }));
  }
  out.push(s('circle', { cx, cy, r: r * 0.36, fill: COLORS.bloom }));
  return out;
}

/** A violet gem centred on (cx, cy) with half-width r: a cut stone, shape plus colour. */
export function gem(cx: number, cy: number, r: number): SVGGElement {
  return s('g', {},
    s('polygon', { points: `${cx - r},${cy - r * 0.3} ${cx - r * 0.55},${cy - r * 0.8} ${cx + r * 0.55},${cy - r * 0.8} ${cx + r},${cy - r * 0.3} ${cx},${cy + r}`, fill: COLORS.gem, stroke: COLORS.gemInk, 'stroke-width': r * 0.12, 'stroke-linejoin': 'round' }),
    s('polygon', { points: `${cx - r * 0.55},${cy - r * 0.8} ${cx - r * 0.2},${cy - r * 0.3} ${cx + r * 0.2},${cy - r * 0.3} ${cx + r * 0.55},${cy - r * 0.8}`, fill: COLORS.gemLight }),
    s('line', { x1: cx - r, y1: cy - r * 0.3, x2: cx + r, y2: cy - r * 0.3, stroke: COLORS.gemInk, 'stroke-width': r * 0.08 }),
  );
}

/** A round cake centred on (cx, cy) with half-width r: brown sponge, white icing, a pink cherry. */
export function cake(cx: number, cy: number, r: number): SVGGElement {
  return s('g', {},
    s('rect', { x: cx - r, y: cy - r * 0.35, width: r * 2, height: r * 1.1, rx: r * 0.15, fill: COLORS.cake, stroke: COLORS.trunk, 'stroke-width': r * 0.1 }),
    s('path', { d: `M ${cx - r} ${cy - r * 0.2} Q ${cx - r} ${cy - r * 0.6} ${cx} ${cy - r * 0.6} Q ${cx + r} ${cy - r * 0.6} ${cx + r} ${cy - r * 0.2} q ${-r * 0.33} ${r * 0.3} ${-r * 0.66} 0 t ${-r * 0.67} 0 t ${-r * 0.67} 0 Z`, fill: COLORS.icing, stroke: '#b9a88e', 'stroke-width': r * 0.08 }),
    s('circle', { cx, cy: cy - r * 0.72, r: r * 0.22, fill: COLORS.bloom }),
  );
}

/** Story marks: a small brown footprint for a true sentence (it really happened). */
export function footprintMark(size = 16): SVGSVGElement {
  return s('svg', { width: size, height: size, viewBox: '-8 -8 16 16', 'aria-label': 'true', role: 'img' },
    s('ellipse', { cx: 0.6, cy: -2.2, rx: 3.6, ry: 4.6, fill: COLORS.trunk }),
    s('ellipse', { cx: -0.4, cy: 5, rx: 2.6, ry: 2.4, fill: COLORS.trunk }));
}

/** Story marks: a grey dashed cloud for a made-up sentence (the storyteller invented it). */
export function cloudMark(size = 16): SVGSVGElement {
  return s('svg', { width: size, height: size, viewBox: '-9 -8 18 16', 'aria-label': 'made up', role: 'img' },
    s('path', { d: 'M -5.5 4.5 A 3.2 3.2 0 0 1 -6 -1.6 A 4 4 0 0 1 0 -4.8 A 3.6 3.6 0 0 1 6.4 -1 A 2.8 2.8 0 0 1 5.6 4.5 Z',
      fill: '#f4f4f4', stroke: '#7d7d7d', 'stroke-width': 1.3, 'stroke-dasharray': '2 1.5', 'stroke-linejoin': 'round' }));
}

export const heartPath = (cx: number, cy: number, r: number) =>
  `M ${cx} ${cy + r * 0.9} C ${cx - r * 1.6} ${cy - r * 0.2}, ${cx - r * 0.6} ${cy - r * 1.3}, ${cx} ${cy - r * 0.35} ` +
  `C ${cx + r * 0.6} ${cy - r * 1.3}, ${cx + r * 1.6} ${cy - r * 0.2}, ${cx} ${cy + r * 0.9} Z`;

/** One tile at (x, y) with side S. `bare`: a berry bush she has eaten on this trip. */
export function tileSymbol(t: Tile, x: number, y: number, S: number, bare = false): SVGGElement {
  const g = s('g', { transform: `translate(${x},${y})`, class: `tile tile-${t}` });
  const bg = t === TREE ? COLORS.meadow : t === SWAMP ? COLORS.water : COLORS.path;
  g.append(s('rect', { width: S, height: S, fill: bg }));
  if (t === TREE) {
    g.append(
      s('rect', { x: S * 0.44, y: S * 0.68, width: S * 0.12, height: S * 0.2, fill: COLORS.trunk }),
      s('polygon', { points: `${S * 0.5},${S * 0.1} ${S * 0.86},${S * 0.72} ${S * 0.14},${S * 0.72}`, fill: COLORS.tree }),
    );
  } else if (t === WOLF) {
    g.append(
      s('rect', { x: S * 0.06, y: S * 0.06, width: S * 0.88, height: S * 0.88, fill: 'none', stroke: COLORS.danger, 'stroke-width': S * 0.06, 'stroke-dasharray': `${S * 0.14} ${S * 0.08}` }),
      s('path', { d: `M ${S * 0.2} ${S * 0.82} Q ${S * 0.2} ${S * 0.22} ${S * 0.5} ${S * 0.22} Q ${S * 0.8} ${S * 0.22} ${S * 0.8} ${S * 0.82} Z`, fill: COLORS.den }),
      s('circle', { cx: S * 0.41, cy: S * 0.56, r: S * 0.05, fill: '#ffd54a' }),
      s('circle', { cx: S * 0.59, cy: S * 0.56, r: S * 0.05, fill: '#ffd54a' }),
    );
  } else if (t === SWAMP) {
    // Wavy water lines plus reeds: readable by shape, not only by colour.
    const wave = (y: number) => `M ${S * 0.12} ${y} q ${S * 0.095} ${-S * 0.08} ${S * 0.19} 0 t ${S * 0.19} 0 t ${S * 0.19} 0 t ${S * 0.19} 0`;
    g.append(
      s('path', { d: wave(S * 0.36), stroke: COLORS.waterInk, 'stroke-width': S * 0.045, fill: 'none', 'stroke-linecap': 'round' }),
      s('path', { d: wave(S * 0.62), stroke: COLORS.waterInk, 'stroke-width': S * 0.045, fill: 'none', 'stroke-linecap': 'round' }),
      s('path', { d: `M ${S * 0.78} ${S * 0.88} L ${S * 0.74} ${S * 0.5} M ${S * 0.84} ${S * 0.88} L ${S * 0.88} ${S * 0.56}`, stroke: COLORS.reed, 'stroke-width': S * 0.04, 'stroke-linecap': 'round' }),
      s('ellipse', { cx: S * 0.74, cy: S * 0.48, rx: S * 0.03, ry: S * 0.07, fill: COLORS.trunk }),
    );
  } else if (t === FLOWERS) {
    g.append(
      s('path', { d: `M ${S * 0.3} ${S * 0.85} L ${S * 0.32} ${S * 0.42} M ${S * 0.66} ${S * 0.85} L ${S * 0.64} ${S * 0.36} M ${S * 0.48} ${S * 0.88} L ${S * 0.5} ${S * 0.6}`, stroke: COLORS.stem, 'stroke-width': S * 0.05, 'stroke-linecap': 'round' }),
      ...flower(S * 0.32, S * 0.36, S * 0.13), ...flower(S * 0.64, S * 0.3, S * 0.13), ...flower(S * 0.5, S * 0.6, S * 0.11),
    );
  } else if (t === TREASURE) {
    g.append(
      s('ellipse', { cx: S * 0.5, cy: S * 0.8, rx: S * 0.3, ry: S * 0.07, fill: '#00000022' }),
      gem(S * 0.5, S * 0.5, S * 0.28),
    );
  } else if (t === BERRIES) {
    g.append(
      s('ellipse', { cx: S * 0.5, cy: S * 0.84, rx: S * 0.32, ry: S * 0.06, fill: '#00000022' }),
      bush(S * 0.5, S * 0.52, S * 0.36, bare),
    );
  } else if (t === HOME) {
    g.append(
      s('rect', { width: S, height: S, fill: '#fbe7a8' }),
      s('rect', { x: S * 0.22, y: S * 0.46, width: S * 0.56, height: S * 0.4, fill: COLORS.home, stroke: COLORS.roof, 'stroke-width': S * 0.03 }),
      s('polygon', { points: `${S * 0.1},${S * 0.5} ${S * 0.5},${S * 0.14} ${S * 0.9},${S * 0.5}`, fill: COLORS.roof }),
      s('path', { d: heartPath(S * 0.5, S * 0.64, S * 0.1), fill: COLORS.roof }),
    );
  }
  return g;
}

/** Red Riding Hood, centred on (0, 0). An original design: a red hooded cloak. */
export function redFigure(S: number): SVGGElement {
  return s('g', { class: 'red-figure' },
    s('path', { d: `M 0 ${-S * 0.24} L ${S * 0.28} ${S * 0.34} Q 0 ${S * 0.42} ${-S * 0.28} ${S * 0.34} Z`, fill: COLORS.red, stroke: '#7a1010', 'stroke-width': S * 0.02 }),
    s('circle', { cx: 0, cy: -S * 0.13, r: S * 0.17, fill: COLORS.red, stroke: '#7a1010', 'stroke-width': S * 0.02 }),
    s('circle', { cx: 0, cy: -S * 0.1, r: S * 0.1, fill: COLORS.skin }),
    s('circle', { cx: -S * 0.035, cy: -S * 0.11, r: S * 0.015, fill: COLORS.ink }),
    s('circle', { cx: S * 0.035, cy: -S * 0.11, r: S * 0.015, fill: COLORS.ink }),
    s('rect', { x: S * 0.16, y: S * 0.08, width: S * 0.16, height: S * 0.1, rx: S * 0.03, fill: '#b07a3c', stroke: COLORS.trunk, 'stroke-width': S * 0.015 }),
  );
}

/** Who can teach her: the same cast as the judges (the wolf comes in disguise). */
export type TeacherFigure = 'mother' | 'father' | 'wolf' | 'crow' | 'grandma' | 'magpie' | 'huntsman' | 'hedgehog';

/** A teacher: mother has a long skirt, father a hat; the others have their own figures. */
export function parentFigure(S: number, who: TeacherFigure): SVGGElement {
  if (who === 'wolf') return wolfInDisguise(S);
  if (who === 'crow') return crowFigure(S);
  if (who === 'grandma') return grandmaFigure(S);
  if (who === 'magpie') return magpieFigure(S);
  if (who === 'huntsman') return huntsmanFigure(S);
  if (who === 'hedgehog') return hedgehogFigure(S);
  const c = who === 'mother' ? COLORS.mother : COLORS.father;
  const g = s('g', { class: 'parent-figure' });
  if (who === 'mother') {
    g.append(s('path', { d: `M 0 ${-S * 0.18} L ${S * 0.26} ${S * 0.38} L ${-S * 0.26} ${S * 0.38} Z`, fill: c }));
  } else {
    g.append(s('rect', { x: -S * 0.17, y: -S * 0.16, width: S * 0.34, height: S * 0.54, rx: S * 0.08, fill: c }));
  }
  g.append(s('circle', { cx: 0, cy: -S * 0.26, r: S * 0.12, fill: COLORS.skin, stroke: c, 'stroke-width': S * 0.03 }));
  if (who === 'father') {
    g.append(s('rect', { x: -S * 0.17, y: -S * 0.43, width: S * 0.34, height: S * 0.06, fill: COLORS.ink }),
      s('rect', { x: -S * 0.1, y: -S * 0.52, width: S * 0.2, height: S * 0.1, fill: COLORS.ink }));
  }
  return g;
}

/** Grandma, centred on (0, 0): a rounded shawl, white hair in a bun, and glasses. */
export function grandmaFigure(S: number): SVGGElement {
  const c = COLORS.grandma;
  return s('g', { class: 'grandma-figure' },
    s('path', { d: `M ${-S * 0.28} ${S * 0.38} Q ${-S * 0.3} ${-S * 0.12} 0 ${-S * 0.14} Q ${S * 0.3} ${-S * 0.12} ${S * 0.28} ${S * 0.38} Z`, fill: c }),
    s('circle', { cx: 0, cy: -S * 0.43, r: S * 0.08, fill: COLORS.hair, stroke: '#9a9a9a', 'stroke-width': S * 0.02 }),
    s('circle', { cx: 0, cy: -S * 0.26, r: S * 0.13, fill: COLORS.skin, stroke: '#9a9a9a', 'stroke-width': S * 0.03 }),
    s('path', { d: `M ${-S * 0.13} ${-S * 0.29} Q 0 ${-S * 0.44} ${S * 0.13} ${-S * 0.29}`, fill: COLORS.hair, stroke: '#9a9a9a', 'stroke-width': S * 0.02 }),
    s('circle', { cx: -S * 0.05, cy: -S * 0.24, r: S * 0.035, fill: 'none', stroke: COLORS.ink, 'stroke-width': S * 0.015 }),
    s('circle', { cx: S * 0.05, cy: -S * 0.24, r: S * 0.035, fill: 'none', stroke: COLORS.ink, 'stroke-width': S * 0.015 }),
  );
}

/** A crow seen from the side, centred on (0, 0): black body, round head, short yellow beak. */
export function crowFigure(S: number): SVGGElement {
  return s('g', { class: 'crow-figure' },
    s('polygon', { points: `${-S * 0.18},${S * 0.04} ${-S * 0.46},${S * 0.2} ${-S * 0.42},${S * 0.3} ${-S * 0.1},${S * 0.16}`, fill: COLORS.crow }),
    s('ellipse', { cx: 0, cy: S * 0.08, rx: S * 0.26, ry: S * 0.18, fill: COLORS.crow }),
    s('path', { d: `M ${-S * 0.12} ${S * 0.02} Q ${S * 0.06} ${-S * 0.04} ${S * 0.14} ${S * 0.12}`, stroke: '#55555e', 'stroke-width': S * 0.03, fill: 'none' }),
    s('circle', { cx: S * 0.22, cy: -S * 0.12, r: S * 0.13, fill: COLORS.crow }),
    s('polygon', { points: `${S * 0.33},${-S * 0.16} ${S * 0.5},${-S * 0.1} ${S * 0.33},${-S * 0.05}`, fill: COLORS.beak }),
    s('circle', { cx: S * 0.25, cy: -S * 0.15, r: S * 0.03, fill: '#fff' }),
    s('line', { x1: -S * 0.04, y1: S * 0.25, x2: -S * 0.06, y2: S * 0.38, stroke: COLORS.beak, 'stroke-width': S * 0.03 }),
    s('line', { x1: S * 0.06, y1: S * 0.25, x2: S * 0.06, y2: S * 0.38, stroke: COLORS.beak, 'stroke-width': S * 0.03 }),
  );
}

/** The wolf in grandma's clothes, centred on (0, 0): her shawl, a frilled white bonnet, grey ears and snout poking out. */
export function wolfInDisguise(S: number): SVGGElement {
  const fur = '#8a8a92';
  return s('g', { class: 'wolf-disguise' },
    s('path', { d: `M ${-S * 0.28} ${S * 0.38} Q ${-S * 0.3} ${-S * 0.1} 0 ${-S * 0.12} Q ${S * 0.3} ${-S * 0.1} ${S * 0.28} ${S * 0.38} Z`, fill: COLORS.grandma }),
    s('polygon', { points: `${-S * 0.15},${-S * 0.36} ${-S * 0.2},${-S * 0.56} ${-S * 0.04},${-S * 0.42}`, fill: '#6d6d74' }),
    s('polygon', { points: `${S * 0.15},${-S * 0.36} ${S * 0.2},${-S * 0.56} ${S * 0.04},${-S * 0.42}`, fill: '#6d6d74' }),
    s('ellipse', { cx: 0, cy: -S * 0.26, rx: S * 0.15, ry: S * 0.14, fill: fur }),
    s('path', { d: `M ${-S * 0.19} ${-S * 0.24} Q ${-S * 0.2} ${-S * 0.46} 0 ${-S * 0.46} Q ${S * 0.2} ${-S * 0.46} ${S * 0.19} ${-S * 0.24} Q 0 ${-S * 0.36} ${-S * 0.19} ${-S * 0.24} Z`, fill: '#fff', stroke: '#9a9a9a', 'stroke-width': S * 0.02 }),
    s('ellipse', { cx: 0, cy: -S * 0.17, rx: S * 0.08, ry: S * 0.06, fill: '#d9d9de' }),
    s('circle', { cx: -S * 0.06, cy: -S * 0.26, r: S * 0.025, fill: '#ffd54a', stroke: COLORS.ink, 'stroke-width': S * 0.01 }),
    s('circle', { cx: S * 0.06, cy: -S * 0.26, r: S * 0.025, fill: '#ffd54a', stroke: COLORS.ink, 'stroke-width': S * 0.01 }),
    s('ellipse', { cx: 0, cy: -S * 0.19, rx: S * 0.03, ry: S * 0.022, fill: COLORS.ink }),
  );
}

/** A magpie seen from the side, centred on (0, 0): black head, white belly, a long blue tail. */
export function magpieFigure(S: number): SVGGElement {
  return s('g', { class: 'magpie-figure' },
    s('polygon', { points: `${-S * 0.16},${S * 0.04} ${-S * 0.5},${S * 0.26} ${-S * 0.46},${S * 0.34} ${-S * 0.08},${S * 0.16}`, fill: COLORS.magpie, stroke: COLORS.crow, 'stroke-width': S * 0.02 }),
    s('ellipse', { cx: 0, cy: S * 0.08, rx: S * 0.25, ry: S * 0.17, fill: COLORS.crow }),
    s('ellipse', { cx: S * 0.06, cy: S * 0.14, rx: S * 0.15, ry: S * 0.1, fill: '#fff', stroke: '#9a9a9a', 'stroke-width': S * 0.015 }),
    s('path', { d: `M ${-S * 0.16} ${S * 0.02} Q ${S * 0.02} ${-S * 0.06} ${S * 0.1} ${S * 0.06}`, stroke: COLORS.magpie, 'stroke-width': S * 0.05, fill: 'none' }),
    s('circle', { cx: S * 0.22, cy: -S * 0.12, r: S * 0.12, fill: COLORS.crow }),
    s('polygon', { points: `${S * 0.32},${-S * 0.15} ${S * 0.46},${-S * 0.1} ${S * 0.32},${-S * 0.06}`, fill: COLORS.crow }),
    s('circle', { cx: S * 0.25, cy: -S * 0.15, r: S * 0.03, fill: '#fff' }),
    s('line', { x1: -S * 0.02, y1: S * 0.24, x2: -S * 0.04, y2: S * 0.38, stroke: COLORS.ink, 'stroke-width': S * 0.03 }),
    s('line', { x1: S * 0.08, y1: S * 0.24, x2: S * 0.08, y2: S * 0.38, stroke: COLORS.ink, 'stroke-width': S * 0.03 }),
    gem(S * 0.42, S * 0.3, S * 0.09),
  );
}

/** The huntsman, centred on (0, 0): an olive coat with a brown belt, a brown hat with a feather, and a horn at his side. */
export function huntsmanFigure(S: number): SVGGElement {
  const c = COLORS.huntsman;
  return s('g', { class: 'huntsman-figure' },
    s('rect', { x: -S * 0.18, y: -S * 0.16, width: S * 0.36, height: S * 0.54, rx: S * 0.06, fill: c }),
    s('rect', { x: -S * 0.18, y: S * 0.08, width: S * 0.36, height: S * 0.05, fill: COLORS.trunk }),
    s('circle', { cx: 0, cy: -S * 0.26, r: S * 0.12, fill: COLORS.skin, stroke: c, 'stroke-width': S * 0.03 }),
    s('path', { d: `M ${-S * 0.06} ${-S * 0.2} Q 0 ${-S * 0.15} ${S * 0.06} ${-S * 0.2}`, stroke: COLORS.trunk, 'stroke-width': S * 0.03, fill: 'none' }),
    s('ellipse', { cx: 0, cy: -S * 0.37, rx: S * 0.2, ry: S * 0.04, fill: COLORS.trunk }),
    s('path', { d: `M ${-S * 0.11} ${-S * 0.37} Q ${-S * 0.1} ${-S * 0.52} 0 ${-S * 0.52} Q ${S * 0.1} ${-S * 0.52} ${S * 0.11} ${-S * 0.37} Z`, fill: COLORS.trunk }),
    s('path', { d: `M ${S * 0.08} ${-S * 0.44} Q ${S * 0.22} ${-S * 0.58} ${S * 0.3} ${-S * 0.52}`, stroke: c, 'stroke-width': S * 0.04, fill: 'none', 'stroke-linecap': 'round' }),
    s('path', { d: `M ${S * 0.16} ${S * 0.02} Q ${S * 0.36} ${S * 0.06} ${S * 0.32} ${S * 0.3}`, stroke: '#e0a020', 'stroke-width': S * 0.05, fill: 'none', 'stroke-linecap': 'round' }),
    s('circle', { cx: S * 0.32, cy: S * 0.31, r: S * 0.05, fill: '#e0a020', stroke: COLORS.trunk, 'stroke-width': S * 0.015 }),
  );
}

/** A hedgehog seen from the side, centred on (0, 0): a round back of brown spines, a pale face with a black nose, and an indigo berry on his spines. */
export function hedgehogFigure(S: number): SVGGElement {
  const spikes: string[] = [];
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI + (k / 10) * Math.PI * 0.95;
    const rr = k % 2 ? S * 0.42 : S * 0.32;
    spikes.push(`${(-S * 0.04 + Math.cos(a) * rr).toFixed(2)},${(S * 0.2 + Math.sin(a) * rr).toFixed(2)}`);
  }
  return s('g', { class: 'hedgehog-figure' },
    s('polygon', { points: `${-S * 0.36},${S * 0.2} ${spikes.join(' ')} ${S * 0.26},${S * 0.2}`, fill: COLORS.spines, stroke: COLORS.spines, 'stroke-width': S * 0.02, 'stroke-linejoin': 'round' }),
    s('ellipse', { cx: -S * 0.04, cy: S * 0.14, rx: S * 0.3, ry: S * 0.2, fill: COLORS.hedgehog }),
    s('path', { d: `M ${S * 0.12} ${S * 0.26} Q ${S * 0.14} ${-S * 0.04} ${S * 0.3} ${S * 0.04} L ${S * 0.46} ${S * 0.16} Q ${S * 0.36} ${S * 0.28} ${S * 0.12} ${S * 0.26} Z`, fill: '#e8cfa8', stroke: COLORS.spines, 'stroke-width': S * 0.02 }),
    s('circle', { cx: S * 0.46, cy: S * 0.16, r: S * 0.04, fill: COLORS.ink }),
    s('circle', { cx: S * 0.28, cy: S * 0.08, r: S * 0.03, fill: COLORS.ink }),
    s('line', { x1: -S * 0.2, y1: S * 0.32, x2: -S * 0.2, y2: S * 0.4, stroke: COLORS.spines, 'stroke-width': S * 0.05, 'stroke-linecap': 'round' }),
    s('line', { x1: S * 0.1, y1: S * 0.32, x2: S * 0.1, y2: S * 0.4, stroke: COLORS.spines, 'stroke-width': S * 0.05, 'stroke-linecap': 'round' }),
    s('circle', { cx: -S * 0.1, cy: -S * 0.16, r: S * 0.08, fill: COLORS.berry, stroke: '#1d1f5e', 'stroke-width': S * 0.02 }),
  );
}

/** Her energy as a pinned token for the memory strip: a battery with 0–3 bars. */
export function energySymbol(level: number, name: string, size = 27): SVGSVGElement {
  const svg = s('svg', { width: size, height: size, viewBox: '0 0 27 27', class: 'token basket-token energy-token' });
  svg.append(s('rect', { x: 0.5, y: 0.5, width: 26, height: 26, rx: 4, fill: '#fffaf0', stroke: '#555' }), battery(13.5, 13.5, 8, level), s('title', {}, `energy: ${name}`));
  return svg;
}

/**
 * Her basket as three pinned tokens for the memory strip: the cake (crossed out once the
 * wolf took it), flowers 0 / 1 / 2+ and treasure 0 / 1 / 2+, each with a picture and a number.
 */
export function basketSymbols(b: Basket, size = 27): SVGSVGElement[] {
  const box = (title: string, ...kids: SVGElement[]) => {
    const svg = s('svg', { width: size, height: size, viewBox: '0 0 27 27', class: 'token basket-token' });
    svg.append(s('rect', { x: 0.5, y: 0.5, width: 26, height: 26, rx: 4, fill: '#fffaf0', stroke: '#555' }), ...kids, s('title', {}, title));
    return svg;
  };
  const count = (n: number) => s('text', { x: 24, y: 24.5, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'end', fill: COLORS.ink }, n >= 2 ? '2+' : String(n));
  const cakeBox = b.cake
    ? box('cake: yes', cake(13.5, 15, 8))
    : box('cake: no (the wolf took it)', s('g', { opacity: 0.35 }, cake(13.5, 15, 8)),
      s('line', { x1: 5, y1: 5, x2: 22, y2: 22, stroke: COLORS.ink, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
  return [
    cakeBox,
    box(`flowers: ${b.flowers >= 2 ? '2 or more' : b.flowers}`, ...flower(10, 10, 6), count(b.flowers)),
    box(`treasure: ${b.treasure >= 2 ? '2 or more' : b.treasure}`, gem(10, 10, 6), count(b.treasure)),
  ];
}

/** A friendly cartoon wolf head, centred on (0, 0). */
export function wolfHead(S: number): SVGGElement {
  return s('g', { class: 'wolf-head' },
    s('polygon', { points: `${-S * 0.4},${-S * 0.2} ${-S * 0.3},${-S * 0.62} ${-S * 0.08},${-S * 0.32}`, fill: '#6d6d74' }),
    s('polygon', { points: `${S * 0.4},${-S * 0.2} ${S * 0.3},${-S * 0.62} ${S * 0.08},${-S * 0.32}`, fill: '#6d6d74' }),
    s('ellipse', { cx: 0, cy: 0, rx: S * 0.45, ry: S * 0.4, fill: '#8a8a92' }),
    s('ellipse', { cx: 0, cy: S * 0.18, rx: S * 0.22, ry: S * 0.16, fill: '#d9d9de' }),
    s('circle', { cx: -S * 0.16, cy: -S * 0.08, r: S * 0.06, fill: '#ffd54a', stroke: COLORS.ink, 'stroke-width': S * 0.02 }),
    s('circle', { cx: S * 0.16, cy: -S * 0.08, r: S * 0.06, fill: '#ffd54a', stroke: COLORS.ink, 'stroke-width': S * 0.02 }),
    s('ellipse', { cx: 0, cy: S * 0.08, rx: S * 0.07, ry: S * 0.05, fill: COLORS.ink }),
    s('path', { d: `M ${-S * 0.1} ${S * 0.22} Q 0 ${S * 0.3} ${S * 0.1} ${S * 0.22}`, stroke: COLORS.ink, 'stroke-width': S * 0.025, fill: 'none' }),
  );
}

/**
 * The walking wolf on the board, centred on (0, 0): the wolf's head with paws, inside the den's
 * dashed red edge (round here), because to her he is just a wolf den that moves.
 */
export function walkingWolf(S: number): SVGGElement {
  const paw = (x: number) => s('ellipse', { cx: x, cy: S * 0.33, rx: S * 0.09, ry: S * 0.06, fill: '#6d6d74', stroke: COLORS.ink, 'stroke-width': S * 0.015 });
  return s('g', { class: 'walking-wolf' },
    s('circle', { r: S * 0.47, fill: '#ffffffaa', stroke: COLORS.danger, 'stroke-width': S * 0.06, 'stroke-dasharray': `${S * 0.14} ${S * 0.08}` }),
    paw(-S * 0.2), paw(S * 0.2),
    s('g', { transform: `translate(0 ${-S * 0.02})` }, wolfHead(S * 0.62)));
}

/** A small tile for tokens, readable at tiny sizes (WALKER: a walking wolf, a grey round head in a red ring). */
function miniTile(t: Seen, x: number, y: number, c: number): SVGElement {
  const g = s('g', { transform: `translate(${x},${y})` });
  if (t === WALKER) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.path }),
      s('circle', { cx: c / 2, cy: c / 2, r: c * 0.4, fill: '#6d6d74', stroke: COLORS.danger, 'stroke-width': c * 0.14 }));
  } else if (t === PATH) g.append(s('rect', { width: c, height: c, fill: COLORS.path }));
  else if (t === TREE) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.meadow }),
      s('polygon', { points: `${c / 2},${c * 0.12} ${c * 0.9},${c * 0.85} ${c * 0.1},${c * 0.85}`, fill: COLORS.tree }));
  } else if (t === SWAMP) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.water }),
      s('path', { d: `M ${c * 0.1} ${c * 0.55} q ${c * 0.2} ${-c * 0.25} ${c * 0.4} 0 t ${c * 0.4} 0`, stroke: COLORS.waterInk, 'stroke-width': c * 0.16, fill: 'none' }));
  } else if (t === WOLF) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.den }),
      s('rect', { x: c * 0.15, y: c * 0.15, width: c * 0.7, height: c * 0.7, fill: 'none', stroke: COLORS.danger, 'stroke-width': c * 0.18 }));
  } else if (t === FLOWERS) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.path }), ...flower(c / 2, c / 2, c * 0.3));
  } else if (t === TREASURE) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.path }), gem(c / 2, c / 2, c * 0.36));
  } else if (t === BERRIES) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.path }), bush(c / 2, c / 2, c * 0.4));
  } else {
    g.append(s('rect', { width: c, height: c, fill: COLORS.home }),
      s('polygon', { points: `${c * 0.1},${c * 0.55} ${c / 2},${c * 0.12} ${c * 0.9},${c * 0.55}`, fill: COLORS.roof }));
  }
  return g;
}

/** A view token: the 8 tiles around her, with her in the middle. */
export function viewToken(view: readonly Seen[], cell = 9): SVGSVGElement {
  const size = cell * 3;
  const svg = s('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'token view-token' });
  let k = 0;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (x === 1 && y === 1) {
        svg.append(s('rect', { x: cell, y: cell, width: cell, height: cell, fill: COLORS.path }),
          s('circle', { cx: cell * 1.5, cy: cell * 1.5, r: cell * 0.32, fill: COLORS.red }));
      } else svg.append(miniTile(view[k++], x * cell, y * cell, cell));
    }
  }
  svg.append(s('rect', { width: size, height: size, fill: 'none', stroke: '#555', 'stroke-width': 1 }));
  return svg;
}

export function arrowPath(m: Move, cx: number, cy: number, len: number, w: number): string {
  // Arrow pointing up from (cx, cy), then rotated.
  const head = Math.min(len * 0.45, w * 2.2 + 4);
  const hw = w / 2 + head * 0.55;
  const pts = [
    [-w / 2, -len * 0.25], [-w / 2, -(len - head)], [-hw, -(len - head)], [0, -len],
    [hw, -(len - head)], [w / 2, -(len - head)], [w / 2, -len * 0.25],
  ];
  const a = (m * Math.PI) / 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return 'M ' + pts.map(([x, y]) => `${(cx + x * cos - y * sin).toFixed(2)} ${(cy + x * sin + y * cos).toFixed(2)}`).join(' L ') + ' Z';
}

export function moveToken(m: Move, size = 27, label?: string): SVGSVGElement {
  const svg = s('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'token move-token' });
  svg.append(s('rect', { x: 0.5, y: 0.5, width: size - 1, height: size - 1, rx: 4, fill: '#fff', stroke: '#555' }),
    s('path', { d: arrowPath(m, size / 2 - DX[m] * size * 0.39, size / 2 - DY[m] * size * 0.39, size * 0.62, size * 0.16), fill: COLORS.ink }));
  if (label) svg.append(s('title', {}, label));
  return svg;
}
