/** A tiny hand-written neural network: context in, 4 move probabilities out. */
import type { Rng } from './rng';
import { ModelConfig, inputSize } from './tokens';

export interface Model {
  cfg: ModelConfig;
  nIn: number;
  nH: number;
  w1: Float32Array; // nH × nIn
  b1: Float32Array;
  w2: Float32Array; // 4 × nH
  b2: Float32Array;
}

export const N_OUT = 4;

export function createModel(cfg: ModelConfig, rng: Rng): Model {
  const nIn = inputSize(cfg);
  const nH = cfg.hidden;
  const init = (n: number, scale: number) => Float32Array.from({ length: n }, () => (rng() * 2 - 1) * scale);
  return {
    cfg: { ...cfg },
    nIn,
    nH,
    w1: init(nH * nIn, Math.sqrt(6 / (nIn / 4 + nH))),
    b1: new Float32Array(nH),
    w2: init(N_OUT * nH, Math.sqrt(6 / (nH + N_OUT)) * 0.5),
    b2: new Float32Array(N_OUT),
  };
}

export interface Forward {
  x: Float32Array;
  nz: number[];
  h: Float32Array;
  logits: Float32Array;
}

/** The input is mostly zeros (one-hot tiles), so only non-zero inputs are visited. */
export function forward(model: Model, x: Float32Array): Forward {
  const { nIn, nH, w1, b1, w2, b2 } = model;
  const nz: number[] = [];
  for (let i = 0; i < nIn; i++) if (x[i] !== 0) nz.push(i);
  const h = new Float32Array(nH);
  for (let j = 0; j < nH; j++) {
    let s = b1[j];
    const row = j * nIn;
    for (const i of nz) s += w1[row + i] * x[i];
    h[j] = Math.tanh(s);
  }
  const logits = new Float32Array(N_OUT);
  for (let o = 0; o < N_OUT; o++) {
    let s = b2[o];
    const row = o * nH;
    for (let j = 0; j < nH; j++) s += w2[row + j] * h[j];
    logits[o] = s;
  }
  return { x, nz, h, logits };
}

/** Softmax with temperature (the boldness dial). */
export function softmax(logits: ArrayLike<number>, temperature = 1): Float32Array {
  const t = Math.max(temperature, 1e-3);
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i] / t);
  const out = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) sum += (out[i] = Math.exp(logits[i] / t - max));
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

export interface Grads { w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: Float32Array }

export const zeroGrads = (m: Model): Grads => ({
  w1: new Float32Array(m.w1.length),
  b1: new Float32Array(m.b1.length),
  w2: new Float32Array(m.w2.length),
  b2: new Float32Array(m.b2.length),
});

/** Add the gradient for one step, given d(loss)/d(logits). */
export function accumulate(model: Model, g: Grads, fw: Forward, dlogits: ArrayLike<number>) {
  const { nIn, nH, w2 } = model;
  const dh = new Float32Array(nH);
  for (let o = 0; o < N_OUT; o++) {
    const d = dlogits[o];
    if (d === 0) continue;
    g.b2[o] += d;
    const row = o * nH;
    for (let j = 0; j < nH; j++) {
      g.w2[row + j] += d * fw.h[j];
      dh[j] += d * w2[row + j];
    }
  }
  for (let j = 0; j < nH; j++) {
    const d = dh[j] * (1 - fw.h[j] * fw.h[j]);
    if (d === 0) continue;
    g.b1[j] += d;
    const row = j * nIn;
    for (const i of fw.nz) g.w1[row + i] += d * fw.x[i];
  }
}

export interface Adam { m: Grads; v: Grads; t: number }

export const createAdam = (model: Model): Adam => ({ m: zeroGrads(model), v: zeroGrads(model), t: 0 });

const KEYS = ['w1', 'b1', 'w2', 'b2'] as const;

/** One Adam update; `scale` averages the accumulated gradient. */
export function adamStep(model: Model, opt: Adam, g: Grads, lr: number, scale = 1) {
  const b1 = 0.9;
  const b2 = 0.999;
  opt.t++;
  const c1 = 1 - Math.pow(b1, opt.t);
  const c2 = 1 - Math.pow(b2, opt.t);
  for (const k of KEYS) {
    const p = model[k];
    const gk = g[k];
    const m = opt.m[k];
    const v = opt.v[k];
    for (let i = 0; i < p.length; i++) {
      const gi = gk[i] * scale;
      if (gi === 0 && m[i] === 0) continue;
      m[i] = b1 * m[i] + (1 - b1) * gi;
      v[i] = b2 * v[i] + (1 - b2) * gi * gi;
      p[i] -= (lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + 1e-8);
    }
  }
}

/** Plain gradient descent, used for practice where the feedback is noisy. */
export function sgdStep(model: Model, g: Grads, lr: number, scale = 1, clip = 1) {
  let norm = 0;
  for (const k of KEYS) for (const v of g[k]) norm += v * v;
  norm = Math.sqrt(norm) * Math.abs(scale);
  const f = lr * scale * (norm > clip ? clip / norm : 1);
  for (const k of KEYS) {
    const p = model[k];
    const gk = g[k];
    for (let i = 0; i < p.length; i++) p[i] -= f * gk[i];
  }
}

export interface ModelJSON {
  cfg: ModelConfig;
  nIn: number;
  nH: number;
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number[];
}

const round = (a: Float32Array) => Array.from(a, (v) => Math.round(v * 1e5) / 1e5);

export const modelToJSON = (m: Model): ModelJSON => ({
  cfg: m.cfg, nIn: m.nIn, nH: m.nH, w1: round(m.w1), b1: round(m.b1), w2: round(m.w2), b2: round(m.b2),
});

export function modelFromJSON(j: ModelJSON): Model {
  const m: Model = {
    cfg: { ...j.cfg }, nIn: j.nIn, nH: j.nH,
    w1: Float32Array.from(j.w1), b1: Float32Array.from(j.b1), w2: Float32Array.from(j.w2), b2: Float32Array.from(j.b2),
  };
  if (m.nIn !== inputSize(m.cfg) || m.w1.length !== m.nIn * m.nH || m.w2.length !== N_OUT * m.nH) {
    throw new Error('The model file does not match its settings');
  }
  return m;
}

export const parameterCount = (m: Model) => m.w1.length + m.b1.length + m.w2.length + m.b2.length;
