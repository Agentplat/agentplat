import type {
  MeshDurableJournalDraft,
  MeshDurablePeerSnapshot,
  MeshDurableScope,
} from "@agentplat/mesh/durability";
import type { MeshJsonValue } from "@agentplat/mesh-protocol";

import {
  AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1,
  type AutonomousMissionLoopAnchorV1,
  type AutonomousMissionLoopStateV1,
  type AutonomousMissionLoopStoreV1,
} from "./autonomous-mission-loop-contracts.js";
import { autonomousMissionLoopDigestV1 } from "./autonomous-mission-loop-validation.js";

/**
 * Transaction boundary required by the Mesh-backed adapter. `commit` must CAS
 * the replaceable Mesh snapshot and advance `nextAnchor` atomically. The anchor
 * is stored on an independent monotonic/non-reversible boundary and therefore
 * is not part of, derived from, or restorable with `snapshot`.
 */
export interface MeshDurableAutonomousMissionLoopRepositoryV1 {
  loadCurrent(input: {
    readonly scope: MeshDurableScope;
    readonly stateKey: string;
    readonly anchorKey: string;
  }): Promise<{
    readonly snapshot: MeshDurablePeerSnapshot | null;
    readonly anchor: AutonomousMissionLoopAnchorV1 | null;
  }>;
  commit(input: {
    readonly scope: MeshDurableScope;
    readonly stateKey: string;
    readonly anchorKey: string;
    readonly expectedSnapshotRevision: number | null;
    readonly expectedStateRevision: number | null;
    readonly expectedStateDigest: AutonomousMissionLoopStateV1["stateDigest"] | null;
    readonly expectedAnchor: AutonomousMissionLoopAnchorV1 | null;
    readonly transitionId: string;
    readonly nextState: MeshJsonValue;
    readonly nextStateDescriptor: {
      readonly format: typeof AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1;
      readonly schemaVersion: 1;
    };
    readonly journal: readonly MeshDurableJournalDraft[];
    readonly nextAnchor: AutonomousMissionLoopAnchorV1;
  }): Promise<boolean>;
}

/**
 * Durable peer-local adapter over an atomic state+independent-anchor
 * repository. Any missing or divergent half fails closed; this adapter never
 * manufactures or repairs an anchor from the Mesh snapshot.
 */
export class MeshDurableAutonomousMissionLoopStoreV1
  implements AutonomousMissionLoopStoreV1
{
  readonly #repository: MeshDurableAutonomousMissionLoopRepositoryV1;
  readonly #scope: MeshDurableScope;

  constructor(input: {
    readonly repository: MeshDurableAutonomousMissionLoopRepositoryV1;
    readonly scope: MeshDurableScope;
  }) {
    if (
      !input?.repository ||
      typeof input.repository.loadCurrent !== "function" ||
      typeof input.repository.commit !== "function"
    )
      throw new TypeError(
        "autonomous mission loop atomic state and anchor repository is required",
      );
    this.#repository = input.repository;
    this.#scope = normalizeScope(input.scope);
  }

  async loadCurrent(input: {
    readonly stateKey: string;
    readonly anchorKey: string;
  }): Promise<{
    readonly state: AutonomousMissionLoopStateV1 | null;
    readonly anchor: AutonomousMissionLoopAnchorV1 | null;
  }> {
    const stateKey = identifier(input.stateKey, "stateKey");
    const anchorKey = identifier(input.anchorKey, "anchorKey");
    const current = await this.#repository.loadCurrent({
      scope: this.#scope,
      stateKey,
      anchorKey,
    });
    const state = current.snapshot ? decode(current.snapshot, stateKey) : null;
    const anchor = current.anchor;
    if ((state === null) !== (anchor === null))
      throw new TypeError("autonomous mission loop durable pair is incomplete");
    if (
      state &&
      anchor &&
      (anchor.stateKey !== state.stateKey ||
        anchor.revision !== state.revision ||
        anchor.stateDigest !== state.stateDigest ||
        anchor.logicalTimeHighWaterMs !== state.logicalTimeHighWaterMs)
    )
      throw new TypeError("autonomous mission loop durable pair diverged");
    return Object.freeze({ state, anchor });
  }

  async save(input: {
    readonly state: AutonomousMissionLoopStateV1;
    readonly anchorKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: AutonomousMissionLoopStateV1["stateDigest"] | null;
  }): Promise<boolean> {
    assertStateDigest(input.state);
    const stateKey = identifier(input.state.stateKey, "stateKey");
    const anchorKey = identifier(input.anchorKey, "anchorKey");
    const current = await this.#repository.loadCurrent({
      scope: this.#scope,
      stateKey,
      anchorKey,
    });
    const state = current.snapshot ? decode(current.snapshot, stateKey) : null;
    const anchor = current.anchor;
    assertConsistentPair(state, anchor);
    if (input.expectedRevision === null || input.expectedStateDigest === null) {
      if (
        input.expectedRevision !== null ||
        input.expectedStateDigest !== null ||
        state ||
        anchor ||
        input.state.revision !== 0 ||
        input.state.predecessorStateDigest !== null
      )
        return false;
    } else if (
      !state ||
      !anchor ||
      state.revision !== input.expectedRevision ||
      state.stateDigest !== input.expectedStateDigest ||
      input.state.revision !== state.revision + 1 ||
      input.state.predecessorStateDigest !== state.stateDigest ||
      input.state.logicalTimeHighWaterMs < state.logicalTimeHighWaterMs
    ) {
      return false;
    }
    const nextAnchor = Object.freeze({
      stateKey,
      revision: input.state.revision,
      logicalTimeHighWaterMs: input.state.logicalTimeHighWaterMs,
      stateDigest: input.state.stateDigest,
    });
    const transitionId = `autonomous-loop.${input.state.revision}.${input.state.stateDigest.slice(7, 23)}`;
    return this.#repository.commit({
      scope: this.#scope,
      stateKey,
      anchorKey,
      expectedSnapshotRevision: current.snapshot?.revision ?? null,
      expectedStateRevision: input.expectedRevision,
      expectedStateDigest: input.expectedStateDigest,
      expectedAnchor: anchor,
      transitionId,
      nextState: json(input.state),
      nextStateDescriptor: {
        format: AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1,
        schemaVersion: 1,
      },
      journal: [
        {
          entryId: transitionId,
          kind:
            input.state.revision === 0
              ? "autonomous.mission-loop.initialized"
              : "autonomous.mission-loop.committed",
        },
      ],
      nextAnchor,
    });
  }
}

function assertConsistentPair(
  state: AutonomousMissionLoopStateV1 | null,
  anchor: AutonomousMissionLoopAnchorV1 | null,
): void {
  if ((state === null) !== (anchor === null))
    throw new TypeError("autonomous mission loop durable pair is incomplete");
  if (
    state &&
    anchor &&
    (anchor.stateKey !== state.stateKey ||
      anchor.revision !== state.revision ||
      anchor.stateDigest !== state.stateDigest ||
      anchor.logicalTimeHighWaterMs !== state.logicalTimeHighWaterMs)
  )
    throw new TypeError("autonomous mission loop durable pair diverged");
}

function decode(
  snapshot: MeshDurablePeerSnapshot,
  stateKey: string,
): AutonomousMissionLoopStateV1 {
  if (
    snapshot.snapshotFormat !== AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1 ||
    snapshot.snapshotSchemaVersion !== 1 ||
    !snapshot.state ||
    typeof snapshot.state !== "object" ||
    Array.isArray(snapshot.state)
  )
    throw new TypeError("autonomous mission loop snapshot is invalid");
  const state = snapshot.state as unknown as AutonomousMissionLoopStateV1;
  if (state.schemaVersion !== 1 || state.stateKey !== stateKey)
    throw new TypeError("autonomous mission loop snapshot binding is invalid");
  assertStateDigest(state);
  return state;
}

function assertStateDigest(state: AutonomousMissionLoopStateV1): void {
  const { stateDigest, ...body } = state;
  if (
    autonomousMissionLoopDigestV1("autonomous-loop-state", body) !==
    stateDigest
  )
    throw new TypeError("autonomous mission loop snapshot digest is invalid");
}

function json(value: AutonomousMissionLoopStateV1): MeshJsonValue {
  return JSON.parse(JSON.stringify(value)) as MeshJsonValue;
}

function normalizeScope(scope: MeshDurableScope): MeshDurableScope {
  if (!scope || typeof scope !== "object")
    throw new TypeError("autonomous mission loop durable scope is required");
  return Object.freeze({
    tenantId: identifier(scope.tenantId, "scope.tenantId"),
    meshId: identifier(scope.meshId, "scope.meshId"),
    peerId: identifier(scope.peerId, "scope.peerId"),
    instanceId: identifier(scope.instanceId, "scope.instanceId"),
  });
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]*$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}
