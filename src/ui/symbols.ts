/** Simple symbolic SVG shapes, drawn for this project. Shape plus colour, never colour alone. */
import { DX, DY, HOME, Move, PATH, SWAMP, TREE, Tile, WOLF } from '../world';
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
  water: '#8cc3d9',
  waterInk: '#2f6f8f',
  reed: '#5b7a2e',
  grandma: '#5f7a8a',
  hair: '#d9d9d9',
  crow: '#1f1f24',
  beak: '#e0a020',
};

export const heartPath = (cx: number, cy: number, r: number) =>
  `M ${cx} ${cy + r * 0.9} C ${cx - r * 1.6} ${cy - r * 0.2}, ${cx - r * 0.6} ${cy - r * 1.3}, ${cx} ${cy - r * 0.35} ` +
  `C ${cx + r * 0.6} ${cy - r * 1.3}, ${cx + r * 1.6} ${cy - r * 0.2}, ${cx} ${cy + r * 0.9} Z`;

/** One tile at (x, y) with side S. */
export function tileSymbol(t: Tile, x: number, y: number, S: number): SVGGElement {
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

/** A parent: mother has a long skirt, father a hat. */
export function parentFigure(S: number, who: 'mother' | 'father'): SVGGElement {
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

/** A small tile for tokens, readable at tiny sizes. */
function miniTile(t: Tile, x: number, y: number, c: number): SVGElement {
  const g = s('g', { transform: `translate(${x},${y})` });
  if (t === PATH) g.append(s('rect', { width: c, height: c, fill: COLORS.path }));
  else if (t === TREE) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.meadow }),
      s('polygon', { points: `${c / 2},${c * 0.12} ${c * 0.9},${c * 0.85} ${c * 0.1},${c * 0.85}`, fill: COLORS.tree }));
  } else if (t === SWAMP) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.water }),
      s('path', { d: `M ${c * 0.1} ${c * 0.55} q ${c * 0.2} ${-c * 0.25} ${c * 0.4} 0 t ${c * 0.4} 0`, stroke: COLORS.waterInk, 'stroke-width': c * 0.16, fill: 'none' }));
  } else if (t === WOLF) {
    g.append(s('rect', { width: c, height: c, fill: COLORS.den }),
      s('rect', { x: c * 0.15, y: c * 0.15, width: c * 0.7, height: c * 0.7, fill: 'none', stroke: COLORS.danger, 'stroke-width': c * 0.18 }));
  } else {
    g.append(s('rect', { width: c, height: c, fill: COLORS.home }),
      s('polygon', { points: `${c * 0.1},${c * 0.55} ${c / 2},${c * 0.12} ${c * 0.9},${c * 0.55}`, fill: COLORS.roof }));
  }
  return g;
}

/** A view token: the 8 tiles around her, with her in the middle. */
export function viewToken(view: readonly Tile[], cell = 9): SVGSVGElement {
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
