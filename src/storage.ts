/** Saving to the browser, forest links, and model files. */
import { Model, ModelJSON, modelFromJSON, modelToJSON } from './model';
import type { TrainStats } from './train';
import { Forest, Tile } from './world';

export interface SavedState {
  version: 1;
  forest: { code: string; size: number; tiles: Tile[]; edited: boolean };
  modelTiles: string;
  settings: Record<string, unknown>;
  model: ModelJSON | null;
  stats: TrainStats | null;
}

const KEY = 'karkulka-v1';

export function save(state: SavedState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or disabled */ }
}

export function load(): SavedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as SavedState) : null;
    return s && s.version === 1 ? s : null;
  } catch { return null; }
}

export function clearSaved() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Three tiles (4 kinds each) fit exactly in one link-safe character. */
export function packTiles(tiles: readonly Tile[]): string {
  let s = '';
  for (let i = 0; i < tiles.length; i += 3) s += B64[(tiles[i] ?? 0) * 16 + (tiles[i + 1] ?? 0) * 4 + (tiles[i + 2] ?? 0)];
  return s;
}

export function unpackTiles(s: string, n: number): Tile[] | null {
  const out: Tile[] = [];
  for (const c of s) {
    const v = B64.indexOf(c);
    if (v < 0) return null;
    out.push((v >> 4) as Tile, ((v >> 2) & 3) as Tile, (v & 3) as Tile);
  }
  return out.length >= n ? out.slice(0, n) : null;
}

export function forestLink(f: Forest, edited: boolean): string {
  const url = new URL(location.href);
  url.hash = `forest=${f.code}${edited ? `&tiles=${packTiles(f.tiles)}` : ''}`;
  return url.toString();
}

export function readLink(): { code: string; tiles: string | null } | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const code = params.get('forest');
  return code ? { code, tiles: params.get('tiles') } : null;
}

export interface ModelFile {
  format: 'karkulka-model';
  version: 1;
  forest: { code: string; size: number; tiles: Tile[]; edited: boolean };
  model: ModelJSON;
  stats: TrainStats;
}

export function exportFile(f: Forest, edited: boolean, model: Model, stats: TrainStats): Blob {
  const file: ModelFile = {
    format: 'karkulka-model', version: 1,
    forest: { code: f.code, size: f.size, tiles: f.tiles, edited },
    model: modelToJSON(model), stats,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export function parseFile(text: string): { file: ModelFile; model: Model } {
  const file = JSON.parse(text) as ModelFile;
  if (file.format !== 'karkulka-model' || file.version !== 1) throw new Error('This is not a Red Riding Hood model file');
  if (file.forest.tiles.length !== file.forest.size * file.forest.size) throw new Error('The forest in this file is damaged');
  return { file, model: modelFromJSON(file.model) };
}
