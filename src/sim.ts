/** A trip alone: at each step the model predicts, one move is sampled, she takes it. */
import { Model, forward, softmax } from './model';
import type { Rng } from './rng';
import type { History } from './teachers';
import { WalkingWolf, viewWithWolves, wolvesAfter, wolvesFor } from './prowler';
import { encodeContext, snapBasket } from './tokens';
import { BERRIES, Basket, Effect, EnergyState, FLOWERS, Forest, Move, StepResult, TREASURE, BasketState, WolfOutRoll, energyAfter, homeSector, newBasketState, pickUpAtStart, step, wolfOutRolls } from './world';

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
 * Forest events on a trip alone (an `EventTracker`): called after each step with her positions,
 * basket and energy; it may change them, and returns the changes it made.
 */
export interface StepEvents { after(positions: readonly number[], basket: Basket, energy?: EnergyState): readonly { t: number; kind: number; effect?: Effect }[] }

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
  /** Her basket after each position, starting with the start (what was packed, plus an item she starts on). */
  readonly baskets: Basket[];
  readonly trip: BasketState = newBasketState();
  /** What was packed before she set off (before any item on her start tile). */
  readonly packed: Basket;
  /** Forest events that may change her basket (a trip alone with events on); null: none. */
  events: StepEvents | null = null;
  /** Basket changes made by forest events, in order. */
  readonly effects: EffectDone[] = [];
  /** The walking wolves the forest has out (`Forest.wolves`); none by default. */
  readonly wolves: WalkingWolf[];
  /** Whether a den's wolf is out each time she steps onto one (`Forest.wolfOut`); undefined: always home. */
  private readonly wolfOut: WolfOutRoll | undefined;
  /** The steps (0-based move index) at which a walking wolf met her. */
  readonly wolfMet: number[] = [];
  energyLeft: number;
  outcome: Outcome | null = null;
  private pending: Decision | null = null;
  /** How many flowers and treasures the forest holds; the forest never changes during a trip. */
  private readonly inForest: { flowersInForest: number; treasureInForest: number; berriesInForest: number };

  constructor(
    readonly forest: Forest,
    readonly model: Model,
    readonly start: number,
    public energy: number,
    public temperature: number,
    private readonly rng: Rng,
    /** What was packed in her basket before she set off (a prompt the user writes); missing: the cake only. */
    packed?: Basket,
  ) {
    this.pos = start;
    this.positions = [start];
    if (packed) Object.assign(this.trip.basket, packed);
    this.packed = snapBasket(this.trip.basket);
    pickUpAtStart(forest, start, this.trip);
    // Without walking wolves, no randomness is used here, so trips are as before.
    this.wolves = wolvesFor(forest, start, rng);
    // Likewise: with the wolf always home, nothing is drawn.
    this.wolfOut = wolfOutRolls(forest, rng);
    this.history = { views: [viewWithWolves(forest, start, this.wolves, this.trip.picked)], moves: [], sectors: [homeSector(forest, start)], baskets: [snapBasket(this.trip.basket)], energy: [energy] };
    this.baskets = [snapBasket(this.trip.basket)];
    this.energyLeft = energy;
    const all = (t: number) => forest.tiles.filter((x) => x === t).length;
    this.inForest = { flowersInForest: all(FLOWERS), treasureInForest: all(TREASURE), berriesInForest: all(BERRIES) };
  }

  get basket(): Basket { return this.trip.basket; }

  /**
   * What she picked on this trip, out of how many are in the forest. Counts pickups even if
   * the wolf later ate her (her basket is then empty, but she did pick them).
   */
  get pickups(): { flowers: number; treasure: number; berries: number; flowersInForest: number; treasureInForest: number; berriesInForest: number } {
    const kind = (t: number) => this.trip.picked.filter((i) => this.forest.tiles[i] === t).length;
    return { flowers: kind(FLOWERS), treasure: kind(TREASURE), berries: kind(BERRIES), ...this.inForest };
  }

  /** The step at which the wolf grabbed the cake (0-based move index), or -1. */
  get cakeLostAt(): number { return this.results.indexOf('grabbed'); }

  /** How many times she stepped onto a den while its wolf was out. */
  get emptyDens(): number { return this.results.filter((r) => r === 'empty').length; }

  get t(): number { return this.history.moves.length; }
  get done(): boolean { return this.outcome !== null; }

  setEnergy(e: number) {
    this.energy = e;
    if (this.t === 0) {
      this.energyLeft = e;
      this.history.energy[0] = e;
      this.pending = null;
    }
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
    const r = step(this.forest, this.pos, m, this.trip, this.wolfOut);
    if (this.wolves.length) {
      const met = wolvesAfter(this.wolves, r.pos, r.result, this.trip);
      if (met !== r.result) { r.result = met; this.wolfMet.push(this.t); }
    }
    this.history.moves.push(m);
    this.blocked.push(r.result === 'blocked');
    this.results.push(r.result);
    this.pos = r.pos;
    this.positions.push(r.pos);
    // Berries give energy back after the step's cost, so the last step onto a bush still saves her.
    this.energyLeft = energyAfter(this.energyLeft, this.energy, r.cost, r.gain);
    // Forest events act right after the step, so the basket and energy she reads next already show it
    // (an apple, like berries, can still save her on the step that would have emptied her energy).
    const energy: EnergyState = { left: this.energyLeft, budget: this.energy };
    for (const e of this.events?.after(this.positions, this.trip.basket, energy) ?? []) {
      if (e.effect) this.effects.push({ t: e.t, kind: e.kind, effect: e.effect });
    }
    this.energyLeft = energy.left;
    this.baskets.push(snapBasket(this.trip.basket));
    if (r.result === 'home') this.outcome = 'home';
    else if (r.result === 'eaten') this.outcome = 'eaten';
    else {
      this.history.views.push(viewWithWolves(this.forest, r.pos, this.wolves, this.trip.picked));
      this.history.sectors.push(homeSector(this.forest, r.pos));
      this.history.baskets.push(snapBasket(this.trip.basket));
      this.history.energy.push(this.energyLeft);
      if (this.energyLeft <= 0) this.outcome = 'lost';
    }
    return m;
  }

  run(): Outcome {
    while (!this.done) this.step();
    return this.outcome!;
  }
}
