/** A trip alone: at each step the model predicts, one move is sampled, she takes it. */
import { Model, forward, softmax } from './model';
import type { Rng } from './rng';
import type { History } from './teachers';
import { WalkingWolf, viewWithWolves, wolvesAfter, wolvesFor } from './prowler';
import { encodeContext, snapBasket } from './tokens';
import { Basket, Effect, FLOWERS, Forest, Move, StepResult, TREASURE, BasketState, homeSector, newBasketState, pickUpAtStart, step } from './world';

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

/** A basket change by a forest event: at which step (1-based, like `t`), by which event kind. */
export interface EffectDone { t: number; kind: number; effect: Effect }

/**
 * Forest events on a trip alone (an `EventTracker`): called after each step with her positions
 * and basket; it may change the basket, and returns the basket changes it made.
 */
export interface StepEvents { after(positions: readonly number[], basket: Basket): readonly { t: number; kind: number; effect?: Effect }[] }

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
  /** Forest events that may change her basket (a trip alone with events on); null: none. */
  events: StepEvents | null = null;
  /** Basket changes made by forest events, in order. */
  readonly effects: EffectDone[] = [];
  /** The walking wolves the forest has out (`Forest.wolves`); none by default. */
  readonly wolves: WalkingWolf[];
  /** The steps (0-based move index) at which a walking wolf met her. */
  readonly wolfMet: number[] = [];
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
    pickUpAtStart(forest, start, this.trip);
    // Without walking wolves, no randomness is used here, so trips are as before.
    this.wolves = wolvesFor(forest, start, rng);
    this.history = { views: [viewWithWolves(forest, start, this.wolves)], moves: [], sectors: [homeSector(forest, start)], baskets: [snapBasket(this.trip.basket)] };
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
    if (this.wolves.length) {
      const met = wolvesAfter(this.wolves, r.pos, r.result, this.trip);
      if (met !== r.result) { r.result = met; this.wolfMet.push(this.t); }
    }
    this.history.moves.push(m);
    this.blocked.push(r.result === 'blocked');
    this.results.push(r.result);
    this.pos = r.pos;
    this.positions.push(r.pos);
    // Forest events act right after the step, so the basket she reads next already shows it.
    for (const e of this.events?.after(this.positions, this.trip.basket) ?? []) {
      if (e.effect) this.effects.push({ t: e.t, kind: e.kind, effect: e.effect });
    }
    this.baskets.push(snapBasket(this.trip.basket));
    this.energyLeft = Math.max(0, this.energyLeft - r.cost);
    if (r.result === 'home') this.outcome = 'home';
    else if (r.result === 'eaten') this.outcome = 'eaten';
    else {
      this.history.views.push(viewWithWolves(this.forest, r.pos, this.wolves));
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
