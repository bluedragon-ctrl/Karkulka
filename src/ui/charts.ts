/** Small SVG charts: the friendly outcome chart and plain line charts. */
import type { EvalPoint, Point } from '../train';
import { h, s } from './dom';
import { COLORS } from './symbols';

const W = 300;
const H = 120;

/** The hatch patterns, defined once per page so their ids stay unique. */
function ensurePatterns() {
  if (document.getElementById('pat-eaten')) return;
  const defs = s('defs', {},
    s('pattern', { id: 'pat-eaten', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: 6, height: 6, fill: COLORS.danger }), s('rect', { width: 2, height: 6, fill: '#ffffff66' })),
    s('pattern', { id: 'pat-lost', width: 5, height: 5, patternUnits: 'userSpaceOnUse' },
      s('rect', { width: 5, height: 5, fill: COLORS.lost }), s('circle', { cx: 2.5, cy: 2.5, r: 1, fill: '#ffffff88' })),
  );
  // Not display:none, which would stop the patterns from painting in some browsers.
  document.body.append(s('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute' }, defs));
}

const FILLS = { home: COLORS.home, eaten: 'url(#pat-eaten)', lost: 'url(#pat-lost)' };

/** Stacked bars of home / eaten / lost, measured on a fixed set of test trips. */
export function outcomeChart(points: EvalPoint[], xLabel: string): HTMLElement {
  const wrap = h('figure', { class: 'chart' });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H + 18}`, width: '100%', role: 'img', 'aria-label': 'Outcome chart' });
  ensurePatterns();
  const shown = points.slice(-40);
  if (!shown.length) {
    svg.append(s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', 'font-size': 12, fill: '#666' }, 'No results yet'));
  }
  const bw = W / Math.max(shown.length, 10);
  shown.forEach((p, k) => {
    let y = H;
    for (const key of ['home', 'lost', 'eaten'] as const) {
      const hgt = p[key] * H;
      y -= hgt;
      if (hgt > 0) {
        svg.append(s('rect', { x: k * bw + 0.5, y, width: Math.max(1, bw - 1), height: hgt, fill: FILLS[key] },
          s('title', {}, `after ${p.x}: ${key} ${Math.round(p[key] * 100)}%`)));
      }
    }
  });
  if (shown.length) {
    svg.append(
      s('text', { x: 0, y: H + 13, 'font-size': 10, fill: '#555' }, String(shown[0].x)),
      s('text', { x: W, y: H + 13, 'font-size': 10, fill: '#555', 'text-anchor': 'end' }, `${shown[shown.length - 1].x} ${xLabel}`),
    );
  }
  wrap.append(svg, legend());
  return wrap;
}

function legend(): HTMLElement {
  const item = (fill: string, label: string) => {
    const sw = s('svg', { width: 14, height: 14, viewBox: '0 0 14 14' }, s('rect', { width: 14, height: 14, fill, stroke: '#333', 'stroke-width': 0.5 }));
    return h('span', { class: 'legend-item' }, sw, label);
  };
  return h('figcaption', { class: 'legend' }, item(FILLS.home, 'home'), item(FILLS.eaten, 'eaten'), item(FILLS.lost, 'lost'));
}

export function lineChart(series: { points: Point[]; color: string; label: string }[], yLabel: string, fixedMax?: number): HTMLElement {
  const wrap = h('figure', { class: 'chart' });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H + 18}`, width: '100%', role: 'img', 'aria-label': yLabel });
  const all = series.flatMap((x) => x.points);
  if (!all.length) {
    svg.append(s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', 'font-size': 12, fill: '#666' }, 'No data yet'));
  } else {
    const xMin = Math.min(...all.map((p) => p.x));
    const xMax = Math.max(xMin + 1, ...all.map((p) => p.x));
    const yMin = Math.min(0, ...all.map((p) => p.y));
    const yMax = fixedMax ?? Math.max(yMin + 0.01, ...all.map((p) => p.y));
    const X = (x: number) => 30 + ((x - xMin) / (xMax - xMin)) * (W - 34);
    const Y = (y: number) => 4 + (1 - (y - yMin) / (yMax - yMin)) * (H - 8);
    svg.append(
      s('line', { x1: 30, x2: W, y1: Y(0), y2: Y(0), stroke: '#bbb' }),
      s('text', { x: 26, y: Y(yMax) + 8, 'font-size': 9, 'text-anchor': 'end', fill: '#555' }, yMax.toFixed(2)),
      s('text', { x: 26, y: Y(yMin), 'font-size': 9, 'text-anchor': 'end', fill: '#555' }, yMin.toFixed(2)),
      s('text', { x: 30, y: H + 13, 'font-size': 10, fill: '#555' }, String(xMin)),
      s('text', { x: W, y: H + 13, 'font-size': 10, fill: '#555', 'text-anchor': 'end' }, String(xMax)),
    );
    for (const ser of series) {
      if (!ser.points.length) continue;
      const d = ser.points.map((p, k) => `${k ? 'L' : 'M'} ${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
      svg.append(s('path', { d, stroke: ser.color, 'stroke-width': 2, fill: 'none' }, s('title', {}, ser.label)));
    }
  }
  wrap.append(svg, h('figcaption', { class: 'legend' }, ...series.map((x) => h('span', { class: 'legend-item' }, h('span', { class: 'swatch-line', style: `background:${x.color}` }), x.label))));
  return wrap;
}

/** Home on test trips at each step since the forest changed: one labelled bar per check. */
export function changeChart(points: { label: string; home: number }[]): HTMLElement {
  return h('div', { class: 'change-chart', role: 'list' }, ...points.map((p) => {
    const pct = Math.round(p.home * 100);
    return h('div', { class: 'change-row', role: 'listitem' },
      h('span', {}, p.label),
      h('span', { class: 'pbar', 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%;background:${COLORS.home}` })),
      h('span', { class: 'pct' }, `${pct}%`));
  }));
}

/** Counts sorted from most to least common, one bar each: the rank-frequency picture of a vocabulary. */
export function rankChart(counts: readonly number[], color: string, label: string): HTMLElement {
  const sorted = [...counts].sort((a, b) => b - a);
  const max = Math.max(1, sorted[0] ?? 0);
  const bw = (W - 34) / Math.max(1, sorted.length);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H + 18}`, width: '100%', role: 'img', 'aria-label': label });
  svg.append(
    s('line', { x1: 30, x2: W, y1: H - 4, y2: H - 4, stroke: '#bbb' }),
    s('text', { x: 26, y: 12, 'font-size': 9, 'text-anchor': 'end', fill: '#555' }, String(max)),
    s('text', { x: 26, y: H - 4, 'font-size': 9, 'text-anchor': 'end', fill: '#555' }, '0'),
    s('text', { x: 30, y: H + 13, 'font-size': 10, fill: '#555' }, 'most common'),
    s('text', { x: W, y: H + 13, 'font-size': 10, fill: '#555', 'text-anchor': 'end' }, 'rarest'),
  );
  sorted.forEach((c, i) => {
    const bh = (c / max) * (H - 8);
    if (c > 0) svg.append(s('rect', { x: 30 + i * bw, y: H - 4 - bh, width: Math.max(0.6, bw - 0.6), height: bh, fill: color }, s('title', {}, `${c}`)));
  });
  return h('figure', { class: 'chart' }, svg, h('figcaption', { class: 'legend' }, label));
}
