import type {
  AutonomousMissionLoopAnchorV1,
  AutonomousMissionLoopStateV1,
  AutonomousMissionLoopStoreV1,
} from "./autonomous-mission-loop-contracts.js";
import { autonomousMissionLoopDigestV1 } from "./autonomous-mission-loop-validation.js";

/**
 * Deterministic atomic reference store. Its separate maps model state/anchor
 * identity, but only a production monotonic boundary provides rollback
 * resistance outside this process.
 */
export class InMemoryAutonomousMissionLoopStoreV1 implements AutonomousMissionLoopStoreV1 {
  readonly #states = new Map<string, AutonomousMissionLoopStateV1>();
  readonly #anchors = new Map<string, AutonomousMissionLoopAnchorV1>();

  async loadCurrent(input: {
    readonly stateKey: string;
    readonly anchorKey: string;
  }): Promise<{
    readonly state: AutonomousMissionLoopStateV1 | null;
    readonly anchor: AutonomousMissionLoopAnchorV1 | null;
  }> {
    const state = this.#states.get(input.stateKey);
    const anchor = this.#anchors.get(input.anchorKey);
    if ((state === undefined) !== (anchor === undefined))
      throw new TypeError("autonomous mission loop state and anchor diverged");
    if (
      state &&
      anchor &&
      (anchor.stateKey !== state.stateKey ||
        anchor.revision !== state.revision ||
        anchor.stateDigest !== state.stateDigest ||
        anchor.logicalTimeHighWaterMs !== state.logicalTimeHighWaterMs)
    )
      throw new TypeError("autonomous mission loop state and anchor diverged");
    return Object.freeze({
      state: state ? structuredClone(state) : null,
      anchor: anchor ? structuredClone(anchor) : null,
    });
  }

  async save(input: {
    readonly state: AutonomousMissionLoopStateV1;
    readonly anchorKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: AutonomousMissionLoopStateV1["stateDigest"] | null;
  }): Promise<boolean> {
    assertStateDigest(input.state);
    const current = this.#states.get(input.state.stateKey) ?? null;
    const anchor = this.#anchors.get(input.anchorKey) ?? null;
    if ((current === null) !== (anchor === null))
      throw new TypeError("autonomous mission loop state and anchor diverged");
    if (
      current &&
      anchor &&
      (anchor.stateKey !== current.stateKey ||
        anchor.revision !== current.revision ||
        anchor.stateDigest !== current.stateDigest ||
        anchor.logicalTimeHighWaterMs !== current.logicalTimeHighWaterMs)
    )
      throw new TypeError("autonomous mission loop state and anchor diverged");
    if (
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest ||
      (anchor?.revision ?? null) !== input.expectedRevision ||
      (anchor?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    if (
      current === null
        ? input.state.revision !== 0 ||
          input.state.predecessorStateDigest !== null
        : input.state.revision !== current.revision + 1 ||
          input.state.predecessorStateDigest !== current.stateDigest ||
          input.state.logicalTimeHighWaterMs < current.logicalTimeHighWaterMs
    )
      throw new TypeError("autonomous mission loop state does not advance");
    const state = structuredClone(input.state);
    this.#states.set(state.stateKey, state);
    this.#anchors.set(input.anchorKey, {
      stateKey: state.stateKey,
      revision: input.state.revision,
      logicalTimeHighWaterMs: input.state.logicalTimeHighWaterMs,
      stateDigest: input.state.stateDigest,
    });
    return true;
  }
}

function assertStateDigest(state: AutonomousMissionLoopStateV1): void {
  const { stateDigest, ...body } = state;
  if (
    autonomousMissionLoopDigestV1("autonomous-loop-state", body) !==
    stateDigest
  )
    throw new TypeError("autonomous mission loop state digest is invalid");
}
