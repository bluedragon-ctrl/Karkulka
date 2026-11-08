/** A trip alone: at each step the model predicts, one move is sampled, she takes it. */
import { Model, forward, softmax } from './model';
import type { Rng } from './rng';
import type { History } from './teachers';
import { encodeContext, snapBasket } from './tokens';
import { Basket, FLOWERS, Forest, Move, StepResult, TREASURE, BasketState, homeSector, newBasketState, step, viewAt } from './world';

export type Outcome = 'home' | 'eaten' | 'lost';

export function sample(probs: ArrayLike<number>, rng: Rng): Move {
  let r = rng();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return i as Move;
  }
  return (probs.length - 1) as Move;
}

/** The model's probabilities for the move at step t of any walk (before boldness). */
export function predictAt(model: Model, h: History, t: number): Float32Array {
  return softmax(forward(model, encodeContext(model.cfg, h, t)).logits);
}

export interface Decision {
  logits: Float32Array;
  raw: Float32Array;
  hidden: Float32Array;
  input: Float32Array;
  /** Indices of the non-zero inputs (kept so training can reuse this step). */
  nz: number[];
}

export class Walker {
  pos: number;
  readonly positions: number[];
  readonly history: History;
  /** Decisions made at each step, with the boldness used at the time. */
  readonly decisions: (Decision & { tempered: Float32Array; temperature: number })[] = [];
  readonly blocked: boolean[] = [];
  /** What each step did (moved, blocked, the wolf grabbed the cake, flowers picked…). */
  readonly results: StepResult[] = [];
  /** Her basket after each position, starting with the start (the full basket). */
  readonly baskets: Basket[];
  readonly trip: BasketState = newBasketState();
  energyLeft: number;
  outcome: Outcome | null = null;
  private pending: Decision | null = null;
  /** How many flowers and treasures the forest holds; the forest never changes during a trip. */
  private readonly inForest: { flowersInForest: number; treasureInForest: number };

  constructor(
    readonly forest: Forest,
    readonly model: Model,
    readonly start: number,
    public energy: number,
    public temperature: number,
    private readonly rng: Rng,
  ) {
    this.pos = start;
    this.positions = [start];
    this.history = { views: [viewAt(forest, start)], moves: [], sectors: [homeSector(forest, start)], baskets: [snapBasket(this.trip.basket)] };
    this.baskets = [snapBasket(this.trip.basket)];
    this.energyLeft = energy;
    const all = (t: number) => forest.tiles.filter((x) => x === t).length;
    this.inForest = { flowersInForest: all(FLOWERS), treasureInForest: all(TREASURE) };
  }

  get basket(): Basket { return this.trip.basket; }

  /**
   * What she picked on this trip, out of how many are in the forest. Counts pickups even if
   * the wolf later ate her (her basket is then empty, but she did pick them).
   */
  get pickups(): { flowers: number; treasure: number; flowersInForest: number; treasureInForest: number } {
    const kind = (t: number) => this.trip.picked.filter((i) => this.forest.tiles[i] === t).length;
    return { flowers: kind(FLOWERS), treasure: kind(TREASURE), ...this.inForest };
  }

  /** The step at which the wolf grabbed the cake (0-based move index), or -1. */
  get cakeLostAt(): number { return this.results.indexOf('grabbed'); }

  get t(): number { return this.history.moves.length; }
  get done(): boolean { return this.outcome !== null; }

  setEnergy(e: number) {
    this.energy = e;
    if (this.t === 0) this.energyLeft = e;
  }

  /** The model's probabilities for the next move (before boldness). */
  decide(): Decision {
    if (!this.pending) {
      const input = encodeContext(this.model.cfg, this.history, this.t);
      const fw = forward(this.model, input);
      this.pending = { logits: fw.logits, raw: softmax(fw.logits), hidden: fw.h, input, nz: fw.nz };
    }
    return this.pending;
  }

  tempered(): Float32Array { return softmax(this.decide().logits, this.temperature); }

  step(): Move | null {
    if (this.done) return null;
    const d = this.decide();
    const tempered = softmax(d.logits, this.temperature);
    const m = sample(tempered, this.rng);
    this.decisions.push({ ...d, tempered, temperature: this.temperature });
    this.pending = null;
    const r = step(this.forest, this.pos, m, this.trip);
    this.history.moves.push(m);
    this.blocked.push(r.result === 'blocked');
    this.results.push(r.result);
    this.baskets.push(snapBasket(this.trip.basket));
    this.pos = r.pos;
    this.positions.push(r.pos);
    this.energyLeft = Math.max(0, this.energyLeft - r.cost);
    if (r.result === 'home') this.outcome = 'home';
    else if (r.result === 'eaten') this.outcome = 'eaten';
    else {
      this.history.views.push(viewAt(this.forest, r.pos));
      this.history.sectors.push(homeSector(this.forest, r.pos));
      this.history.baskets.push(snapBasket(this.trip.basket));
      if (this.energyLeft <= 0) this.outcome = 'lost';
    }
    return m;
  }

  run(): Outcome {
    while (!this.done) this.step();
    return this.outcome!;
  }
}
