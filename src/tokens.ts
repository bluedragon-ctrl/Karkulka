/** Tokens and the context window: how her trip is turned into numbers. */
import type { History } from './teachers';
import { Basket, Forest, Seen, TILE_KINDS, Tile, VIEW_KINDS, WALKER, WOLF, isWalkable, viewAt } from './world';

export type MemorySize = 'short' | 'medium' | 'long';
export const MEMORY_PAIRS: Record<MemorySize, number> = { short: 1, medium: 3, long: 6 };

export interface ModelConfig {
  /** Number of past view–move pairs she remembers. */
  memory: number;
  /** Whether the "smell of grandma's cake" (direction home) is an input. */
  hint: boolean;
  /**
   * Whether a walking wolf has his own token in her views. Off (or missing, in older saves and
   * model files): he is shown to her as a wolf den.
   */
  wolfToken?: boolean;
  hidden: number;
}

/** How many kinds one place in her view is one-hot over: the tile kinds, plus the walking wolf if she tells him apart. */
export const viewKinds = (cfg: Pick<ModelConfig, 'wolfToken'>): number => (cfg.wolfToken ? VIEW_KINDS : TILE_KINDS);
/** One view: 8 tiles, one-hot over the view kinds. */
export const viewFeats = (cfg: Pick<ModelConfig, 'wolfToken'>): number => 8 * viewKinds(cfg);
/** One view without the walking-wolf token (the default). */
export const VIEW_FEATS = 8 * TILE_KINDS;
export const MOVE_FEATS = 4;
export const HINT_FEATS = 8;
/** Pinned basket tokens: cake yes / no, flowers 0 / 1 / 2+, treasure 0 / 1 / 2+ (one-hot each). */
export const BASKET_FEATS = 2 + 3 + 3;
/** One remembered pair: a "present" flag, the view, and the move. */
export const slotFeats = (cfg: Pick<ModelConfig, 'wolfToken'>): number => 1 + viewFeats(cfg) + MOVE_FEATS;
/** One remembered pair without the walking-wolf token (the default). */
export const SLOT_FEATS = 1 + VIEW_FEATS + MOVE_FEATS;

export const inputSize = (cfg: Pick<ModelConfig, 'memory' | 'hint' | 'wolfToken'>): number =>
  BASKET_FEATS + viewFeats(cfg) + (cfg.hint ? HINT_FEATS : 0) + cfg.memory * slotFeats(cfg);

/** A view as the model reads it: without the walking-wolf token, a walking wolf is a den. */
export const asSeenBy = (cfg: Pick<ModelConfig, 'wolfToken'>, view: readonly Seen[]): Seen[] =>
  (cfg.wolfToken ? [...view] : view.map((v) => (v === WALKER ? WOLF : v)));

/** The three pinned basket tokens as one-hot positions: [cake, flowers, treasure]. */
export const basketTokens = (b: Basket): [number, number, number] =>
  [b.cake ? 1 : 0, Math.min(2, b.flowers), Math.min(2, b.treasure)];

/** Copy of a basket, for histories (the trip's own basket keeps changing). */
export const snapBasket = (b: Basket): Basket => ({ cake: b.cake, flowers: b.flowers, treasure: b.treasure });

export const viewKey = (view: readonly Seen[]): string => view.join('');

function encodeView(out: Float32Array, offset: number, view: readonly Seen[], wolfToken: boolean) {
  const kinds = wolfToken ? VIEW_KINDS : TILE_KINDS;
  for (let k = 0; k < 8; k++) out[offset + k * kinds + (view[k] === WALKER && !wolfToken ? WOLF : view[k])] = 1;
}

/**
 * The context for the decision at step t:
 * [cake][flowers][treasure] | [view t-m][move t-m] … [view t-1][move t-1][view t] → next move?
 * The basket tokens are pinned: they describe her basket now and never scroll out.
 */
export function encodeContext(cfg: ModelConfig, h: History, t: number): Float32Array {
  const x = new Float32Array(inputSize(cfg));
  const [cake, flowers, treasure] = basketTokens(h.baskets[t]);
  x[cake] = 1;
  x[2 + flowers] = 1;
  x[5 + treasure] = 1;
  const wt = !!cfg.wolfToken;
  const vf = viewFeats(cfg);
  let off = BASKET_FEATS;
  encodeView(x, off, h.views[t], wt);
  off += vf;
  if (cfg.hint) {
    x[off + h.sectors[t]] = 1;
    off += HINT_FEATS;
  }
  for (let k = 1, sf = slotFeats(cfg); k <= cfg.memory; k++, off += sf) {
    const i = t - k;
    if (i < 0) continue;
    x[off] = 1;
    encodeView(x, off + 1, h.views[i], wt);
    x[off + 1 + vf + h.moves[i]] = 1;
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

/** Every view that can occur in this forest. Moves are tokens 0–3, so views start at 4. */
export function buildVocabulary(f: Forest): ViewToken[] {
  const byKey = new Map<string, ViewToken>();
  f.tiles.forEach((t, i) => {
    if (!isWalkable(t)) return;
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
