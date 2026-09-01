import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import {
  type MorphologyHeadCommitV1,
  type MorphologyHeadStoreV1,
  type MorphologyHeadV1,
} from "./morphogenesis-contracts.js";
import {
  createMorphologyHeadV1,
  validateMorphologyHeadV1,
} from "./morphogenesis-validation.js";

/** Single-process reference store. It provides no durable rollback witness. */
export class InMemoryMorphologyHeadStoreV1 implements MorphologyHeadStoreV1 {
  readonly #heads = new Map<string, MorphologyHeadV1>();

  async load(stateKey: string): Promise<MorphologyHeadV1 | null> {
    const head = this.#heads.get(stateKey);
    return head ? immutable(head) : null;
  }

  async save(input: {
    readonly head: MorphologyHeadV1;
    readonly expectedRevision: number | null;
    readonly expectedHeadDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    const head = validateMorphologyHeadV1(input.head);
    const current = this.#heads.get(head.stateKey);
    if (input.expectedRevision === null) {
      if (
        current !== undefined ||
        input.expectedHeadDigest !== null ||
        head.revision !== 0
      )
        return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      current.headDigest !== input.expectedHeadDigest ||
      head.revision !== current.revision + 1 ||
      head.predecessorHeadDigest !== current.headDigest ||
      head.scopeDigest !== current.scopeDigest ||
      head.policyDigest !== current.policyDigest ||
      head.morphologyEpoch !== current.morphologyEpoch + 1 ||
      head.logicalTimeHighWaterMs < current.logicalTimeHighWaterMs
    )
      return false;
    this.#heads.set(head.stateKey, immutable(head));
    return true;
  }
}

export function createInitialMorphologyHeadV1(input: {
  readonly stateKey: string;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly morphologyEpoch: number;
  readonly snapshotDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}): MorphologyHeadV1 {
  return createMorphologyHeadV1({
    stateKey: input.stateKey,
    scopeDigest: input.scopeDigest,
    policyDigest: input.policyDigest,
    revision: 0,
    morphologyEpoch: input.morphologyEpoch,
    snapshotDigest: input.snapshotDigest,
    acceptedProposalDigest: null,
    decisionDigest: null,
    receiptDigest: null,
    logicalTimeHighWaterMs: input.logicalTimeMs,
    predecessorHeadDigest: null,
  });
}

export function createSuccessorMorphologyHeadV1(input: {
  readonly current: MorphologyHeadV1;
  readonly commit: MorphologyHeadCommitV1;
}): MorphologyHeadV1 {
  const current = validateMorphologyHeadV1(input.current);
  if (
    input.commit.stateKey !== current.stateKey ||
    input.commit.scopeDigest !== current.scopeDigest ||
    input.commit.policyDigest !== current.policyDigest ||
    input.commit.expectedMorphologyEpoch !== current.morphologyEpoch ||
    input.commit.logicalTimeMs < current.logicalTimeHighWaterMs
  )
    throw new TypeError("morphology head commit is stale or cross-scoped");
  return createMorphologyHeadV1({
    stateKey: current.stateKey,
    scopeDigest: current.scopeDigest,
    policyDigest: current.policyDigest,
    revision: current.revision + 1,
    morphologyEpoch: current.morphologyEpoch + 1,
    snapshotDigest: input.commit.snapshotDigest,
    acceptedProposalDigest: input.commit.proposalDigest,
    decisionDigest: input.commit.decisionDigest,
    receiptDigest: input.commit.receiptDigest,
    logicalTimeHighWaterMs: input.commit.logicalTimeMs,
    predecessorHeadDigest: current.headDigest,
  });
}

export class MorphologyHeadRuntimeV1 {
  readonly #maximumCommitAttempts: number;

  constructor(
    readonly options: {
      readonly store: MorphologyHeadStoreV1;
      readonly maximumCommitAttempts: number;
    },
  ) {
    if (
      !options.store ||
      !Number.isSafeInteger(options.maximumCommitAttempts) ||
      options.maximumCommitAttempts < 1 ||
      options.maximumCommitAttempts > 1_000
    )
      throw new TypeError("morphology head runtime options are invalid");
    this.#maximumCommitAttempts = options.maximumCommitAttempts;
  }

  async initialize(head: MorphologyHeadV1): Promise<MorphologyHeadV1> {
    const validated = validateMorphologyHeadV1(head);
    if (
      await this.options.store.save({
        head: validated,
        expectedRevision: null,
        expectedHeadDigest: null,
      })
    )
      return validated;
    const current = await this.options.store.load(validated.stateKey);
    if (current?.headDigest === validated.headDigest) return current;
    throw new Error("morphology head initialization conflicts");
  }

  async commit(commit: MorphologyHeadCommitV1): Promise<MorphologyHeadV1> {
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const current = await this.options.store.load(commit.stateKey);
      if (!current) throw new Error("morphology head is not initialized");
      if (
        current.acceptedProposalDigest === commit.proposalDigest &&
        current.decisionDigest === commit.decisionDigest &&
        current.receiptDigest === commit.receiptDigest &&
        current.snapshotDigest === commit.snapshotDigest
      )
        return current;
      const successor = createSuccessorMorphologyHeadV1({ current, commit });
      if (
        await this.options.store.save({
          head: successor,
          expectedRevision: current.revision,
          expectedHeadDigest: current.headDigest,
        })
      )
        return successor;
    }
    throw new Error("morphology head commit attempts exhausted");
  }
}

function immutable<T>(input: T): T {
  return deepFreeze(structuredClone(input));
}

function deepFreeze<T>(input: T): T {
  if (input && typeof input === "object" && !Object.isFrozen(input)) {
    Object.freeze(input);
    for (const key of Object.getOwnPropertyNames(input))
      deepFreeze((input as Record<string, unknown>)[key]);
  }
  return input;
}
