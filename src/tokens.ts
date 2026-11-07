/** Tokens and the context window: how her trip is turned into numbers. */
import type { History } from './teachers';
import { Forest, Move, PATH, Tile, TILE_KINDS, viewAt } from './world';

export type MemorySize = 'short' | 'medium' | 'long';
export const MEMORY_PAIRS: Record<MemorySize, number> = { short: 1, medium: 3, long: 6 };

export interface ModelConfig {
  /** Number of past view–move pairs she remembers. */
  memory: number;
  /** Whether the "smell of grandma's cake" (direction home) is an input. */
  hint: boolean;
  hidden: number;
}

export const VIEW_FEATS = 8 * TILE_KINDS; // 8 tiles, one-hot over 4 kinds
export const MOVE_FEATS = 4;
export const HINT_FEATS = 8;
/** One remembered pair: a "present" flag, the view, and the move. */
export const SLOT_FEATS = 1 + VIEW_FEATS + MOVE_FEATS;

export const inputSize = (cfg: Pick<ModelConfig, 'memory' | 'hint'>): number =>
  VIEW_FEATS + (cfg.hint ? HINT_FEATS : 0) + cfg.memory * SLOT_FEATS;

export const viewKey = (view: readonly Tile[]): string => view.join('');

function encodeView(out: Float32Array, offset: number, view: readonly Tile[]) {
  for (let k = 0; k < 8; k++) out[offset + k * TILE_KINDS + view[k]] = 1;
}

/**
 * The context for the decision at step t:
 * [view t-m][move t-m] … [view t-1][move t-1][view t] → next move?
 */
export function encodeContext(cfg: ModelConfig, h: History, t: number): Float32Array {
  const x = new Float32Array(inputSize(cfg));
  encodeView(x, 0, h.views[t]);
  let off = VIEW_FEATS;
  if (cfg.hint) {
    x[off + h.sectors[t]] = 1;
    off += HINT_FEATS;
  }
  for (let k = 1; k <= cfg.memory; k++, off += SLOT_FEATS) {
    const i = t - k;
    if (i < 0) continue;
    x[off] = 1;
    encodeView(x, off + 1, h.views[i]);
    x[off + 1 + VIEW_FEATS + h.moves[i]] = 1;
  }
  return x;
}

export interface ViewToken {
  id: number;
  key: string;
  view: Tile[];
  /** How many places in the forest look like this. */
  places: number[];
}

/** Output tokens get IDs 0–3; input tokens (views) follow. */
export const MOVE_TOKEN_IDS: Record<Move, number> = { 0: 0, 1: 1, 2: 2, 3: 3 };

/** Every view that can occur in this forest. */
export function buildVocabulary(f: Forest): ViewToken[] {
  const byKey = new Map<string, ViewToken>();
  f.tiles.forEach((t, i) => {
    if (t !== PATH) return;
    const view = viewAt(f, i);
    const key = viewKey(view);
    let tok = byKey.get(key);
    if (!tok) {
      tok = { id: 4 + byKey.size, key, view, places: [] };
      byKey.set(key, tok);
    }
    tok.places.push(i);
  });
  return [...byKey.values()];
}
