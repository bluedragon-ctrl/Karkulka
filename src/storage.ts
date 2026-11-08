/** Saving to the browser, forest links, and model files. */
import { Model, ModelJSON, modelFromJSON, modelToJSON } from './model';
import type { TrainStats } from './train';
import { Forest, TILE_KINDS, Tile } from './world';

/** Bump when tile kinds or model inputs change: older saves, links and model files no longer fit. */
export const SAVE_VERSION = 3;

export interface SavedState {
  version: typeof SAVE_VERSION;
  forest: { code: string; size: number; tiles: Tile[]; edited: boolean };
  modelTiles: string;
  /** Home on test trips since the forest changed (missing in older saves). */
  changeLog?: { label: string; home: number }[];
  settings: Record<string, unknown>;
  model: ModelJSON | null;
  stats: TrainStats | null;
}

// Version 2 added swamps, version 3 her basket (flowers, treasure, pinned basket inputs): older saves and models don't fit and are ignored.
const KEY = `karkulka-v${SAVE_VERSION}`;

export function save(state: SavedState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or disabled */ }
}

export function load(): SavedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as SavedState) : null;
    return s && s.version === SAVE_VERSION ? s : null;
  } catch { return null; }
}

export function clearSaved() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Two tiles (7 kinds each, 49 combinations; up to 8 kinds fit) in one link-safe character. */
export function packTiles(tiles: readonly Tile[]): string {
  let s = '';
  for (let i = 0; i < tiles.length; i += 2) s += B64[(tiles[i] ?? 0) * TILE_KINDS + (tiles[i + 1] ?? 0)];
  return s;
}

export function unpackTiles(s: string, n: number): Tile[] | null {
  const out: Tile[] = [];
  for (const c of s) {
    const v = B64.indexOf(c);
    if (v < 0 || v >= TILE_KINDS * TILE_KINDS) return null;
    out.push(Math.floor(v / TILE_KINDS) as Tile, (v % TILE_KINDS) as Tile);
  }
  return out.length >= n ? out.slice(0, n) : null;
}

/** Link parameter for edited tiles; it changes when the tile kinds do, so old links are read as unedited. */
const MAP_PARAM = 'map3';

export function forestLink(f: Forest, edited: boolean): string {
  const url = new URL(location.href);
  url.hash = `forest=${f.code}${edited ? `&${MAP_PARAM}=${packTiles(f.tiles)}` : ''}`;
  return url.toString();
}

export function readLink(): { code: string; tiles: string | null } | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const code = params.get('forest');
  // `map3` holds edited tiles; older links (`map` before the basket, `tiles` before swamps) are read as unedited.
  return code ? { code, tiles: params.get(MAP_PARAM) } : null;
}

export interface ModelFile {
  format: 'karkulka-model';
  version: typeof SAVE_VERSION;
  forest: { code: string; size: number; tiles: Tile[]; edited: boolean };
  model: ModelJSON;
  stats: TrainStats;
}

export function exportFile(f: Forest, edited: boolean, model: Model, stats: TrainStats): Blob {
  const file: ModelFile = {
    format: 'karkulka-model', version: SAVE_VERSION,
    forest: { code: f.code, size: f.size, tiles: f.tiles, edited },
    model: modelToJSON(model), stats,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export function parseFile(text: string): { file: ModelFile; model: Model } {
  const file = JSON.parse(text) as ModelFile;
  if (file.format !== 'karkulka-model') throw new Error('This is not a Red Riding Hood model file');
  if (file.version !== SAVE_VERSION) throw new Error('This model file is from an older version of the game (before her basket) and cannot be loaded');
  if (file.forest.tiles.length !== file.forest.size * file.forest.size) throw new Error('The forest in this file is damaged');
  return { file, model: modelFromJSON(file.model) };
}
