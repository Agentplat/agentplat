import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  TeamExecutionContinuityAuthorityDecisionV1,
  TeamExecutionContinuityAuthorityPortV1,
  TeamExecutionContinuityAvailabilityCertificateV1,
  TeamExecutionContinuityAvailabilityPortV1,
  TeamExecutionContinuityCheckpointRepositoryV1,
  TeamExecutionContinuityCheckpointV1,
  TeamExecutionContinuityHolderV1,
  TeamExecutionContinuityMembershipPortV1,
  TeamExecutionContinuityStateV1,
  TeamExecutionContinuityStoreV1,
  TeamExecutionWorkOwnerAuthorityV1,
} from "./team-execution-continuity-contracts.js";
import type { TeamExecutionScopeV1 } from "./team-execution-contracts.js";
import {
  createTeamExecutionContinuityAvailabilityCertificateV1,
  validateTeamExecutionContinuityCheckpointV1,
  validateTeamExecutionContinuityStateV1,
  validateTeamExecutionWorkOwnerAuthorityV1,
} from "./team-execution-continuity-validation.js";
import { validateTeamExecutionScopeV1 } from "./team-execution-validation.js";

/**
 * Deterministic fenced CAS adapter for tests and local composition. Production
 * stores must compare holder/generation/head/token/membership in the same durable CAS.
 */
export class InMemoryTeamExecutionContinuityStoreV1 implements TeamExecutionContinuityStoreV1 {
  readonly #states = new Map<string, TeamExecutionContinuityStateV1>();
  readonly #authority: TeamExecutionContinuityAuthorityPortV1;
  readonly #scope: TeamExecutionScopeV1;
  readonly #localHolder: TeamExecutionContinuityHolderV1;

  constructor(input: {
    readonly authority: TeamExecutionContinuityAuthorityPortV1;
    readonly scope: TeamExecutionScopeV1;
    readonly localHolder: TeamExecutionContinuityHolderV1;
  }) {
    if (!input?.authority || typeof input.authority.current !== "function")
      throw new TypeError("continuity store authority is invalid");
    this.#authority = input.authority;
    this.#scope = validateTeamExecutionScopeV1(input.scope);
    this.#localHolder = holder(input.localHolder);
  }

  async load(stateKey: string): Promise<TeamExecutionContinuityStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state ? structuredClone(state) : null;
  }

  async save(input: {
    readonly state: TeamExecutionContinuityStateV1;
    readonly expectedRevision: number | null;
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    const state = validateTeamExecutionContinuityStateV1(input.state);
    const authority = validateTeamExecutionWorkOwnerAuthorityV1(
      input.authority,
    );
    logical(input.logicalTimeMs, "continuityStore.logicalTimeMs");
    if (!state.authority || !sameAuthority(state.authority, authority))
      throw new TypeError("continuity store state authority is invalid");
    await this.#assertCurrent(authority, input.logicalTimeMs);
    const current = this.#states.get(state.stateKey);
    if (
      (input.expectedRevision === null && current) ||
      (input.expectedRevision !== null &&
        (!current || current.revision !== input.expectedRevision))
    )
      return false;
    this.#states.set(state.stateKey, structuredClone(state));
    try {
      await this.#assertCurrent(authority, input.logicalTimeMs);
    } catch (error) {
      if (this.#states.get(state.stateKey)?.stateDigest === state.stateDigest) {
        if (current) this.#states.set(state.stateKey, current);
        else this.#states.delete(state.stateKey);
      }
      throw error;
    }
    return true;
  }

  async #assertCurrent(
    expected: TeamExecutionWorkOwnerAuthorityV1,
    logicalTimeMs: number,
  ): Promise<void> {
    const decision = await this.#authority.current({
      scope: this.#scope,
      logicalTimeMs,
    });
    if (
      !decision ||
      decision.current !== true ||
      decision.reasonCode !== "current"
    )
      throw new TypeError("continuity store authority is unavailable");
    const current = validateTeamExecutionWorkOwnerAuthorityV1(
      decision.authority,
    );
    if (
      !sameAuthority(current, expected) ||
      !sameHolder(current.holder, this.#localHolder) ||
      !sameScope(current, this.#scope)
    )
      throw new TypeError("continuity store authority changed");
  }
}

/** A content-addressed repository: an existing digest can never be overwritten. */
export class InMemoryTeamExecutionContinuityCheckpointRepositoryV1 implements TeamExecutionContinuityCheckpointRepositoryV1 {
  readonly #checkpoints = new Map<
    string,
    TeamExecutionContinuityCheckpointV1
  >();
  readonly #checkpointIds = new Map<string, string>();

  async get(
    checkpointDigest: PlanningDigestV1,
  ): Promise<TeamExecutionContinuityCheckpointV1 | null> {
    const checkpoint = this.#checkpoints.get(checkpointDigest);
    return checkpoint ? structuredClone(checkpoint) : null;
  }

  async getById(
    checkpointId: string,
  ): Promise<TeamExecutionContinuityCheckpointV1 | null> {
    const digest = this.#checkpointIds.get(checkpointId);
    if (!digest) return null;
    const checkpoint = this.#checkpoints.get(digest);
    return checkpoint ? structuredClone(checkpoint) : null;
  }

  async put(value: TeamExecutionContinuityCheckpointV1): Promise<void> {
    const checkpoint = validateTeamExecutionContinuityCheckpointV1(value);
    const existing = this.#checkpoints.get(checkpoint.checkpointDigest);
    if (existing && JSON.stringify(existing) !== JSON.stringify(checkpoint))
      throw new Error("team_execution_continuity_checkpoint_conflict");
    const existingDigest = this.#checkpointIds.get(checkpoint.checkpointId);
    if (existingDigest && existingDigest !== checkpoint.checkpointDigest)
      throw new Error("team_execution_continuity_checkpoint_id_conflict");
    this.#checkpoints.set(
      checkpoint.checkpointDigest,
      structuredClone(checkpoint),
    );
    this.#checkpointIds.set(
      checkpoint.checkpointId,
      checkpoint.checkpointDigest,
    );
  }
}

/** Minimal currentness adapter; production code should bridge a Mesh continuity runtime. */
export class InMemoryTeamExecutionContinuityAuthorityPortV1 implements TeamExecutionContinuityAuthorityPortV1 {
  #authority: TeamExecutionWorkOwnerAuthorityV1 | null = null;

  setCurrent(authority: TeamExecutionWorkOwnerAuthorityV1 | null): void {
    this.#authority =
      authority === null
        ? null
        : validateTeamExecutionWorkOwnerAuthorityV1(authority);
  }

  async current(input: {
    readonly scope: import("./team-execution-contracts.js").TeamExecutionScopeV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionContinuityAuthorityDecisionV1> {
    const scope = validateTeamExecutionScopeV1(input.scope);
    if (!Number.isSafeInteger(input.logicalTimeMs) || input.logicalTimeMs < 0)
      throw new TypeError("authority logical time is invalid");
    const authority = this.#authority;
    if (!authority)
      return Object.freeze({
        current: false as const,
        reasonCode: "not_found",
        authority: null,
      });
    if (
      authority.tenantId !== scope.tenantId ||
      authority.meshId !== scope.meshId ||
      authority.objectiveId !== scope.objectiveId ||
      authority.rootWorkItemId !== scope.rootWorkItemId
    )
      return Object.freeze({
        current: false as const,
        reasonCode: "scope_mismatch",
        authority: null,
      });
    if (input.logicalTimeMs >= authority.validUntilLogicalMs)
      return Object.freeze({
        current: false as const,
        reasonCode: "expired",
        authority,
      });
    return Object.freeze({
      current: true as const,
      reasonCode: "current",
      authority,
    });
  }
}

/** Deterministic membership-currentness adapter for tests and local composition. */
export class InMemoryTeamExecutionContinuityMembershipPortV1 implements TeamExecutionContinuityMembershipPortV1 {
  #membershipEpoch: number;
  #membershipConfigurationDigest: PlanningDigestV1;

  constructor(input: {
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
  }) {
    this.#membershipEpoch = positive(
      input.membershipEpoch,
      "membership.membershipEpoch",
    );
    this.#membershipConfigurationDigest = sha(
      input.membershipConfigurationDigest,
      "membership.membershipConfigurationDigest",
    );
  }

  setCurrent(input: {
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
  }): void {
    this.#membershipEpoch = positive(
      input.membershipEpoch,
      "membership.membershipEpoch",
    );
    this.#membershipConfigurationDigest = sha(
      input.membershipConfigurationDigest,
      "membership.membershipConfigurationDigest",
    );
  }

  async current(input: {
    readonly scope: TeamExecutionScopeV1;
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly current: boolean; readonly reasonCode: string }> {
    validateTeamExecutionScopeV1(input.scope);
    logical(input.logicalTimeMs, "membership.logicalTimeMs");
    const epoch = positive(input.membershipEpoch, "membership.membershipEpoch");
    const configurationDigest = sha(
      input.membershipConfigurationDigest,
      "membership.membershipConfigurationDigest",
    );
    return epoch === this.#membershipEpoch &&
      configurationDigest === this.#membershipConfigurationDigest
      ? Object.freeze({ current: true, reasonCode: "current" })
      : Object.freeze({ current: false, reasonCode: "stale_membership" });
  }
}

/** Test/local availability certificate issuer. It represents one durable replica. */
export class InMemoryTeamExecutionContinuityAvailabilityPortV1 implements TeamExecutionContinuityAvailabilityPortV1 {
  readonly #replicaId: string;
  readonly #certified = new Map<
    string,
    {
      readonly scopeDigest: string;
      readonly membershipEpoch: number;
      readonly membershipConfigurationDigest: string;
    }
  >();
  constructor(options: { readonly replicaId?: string } = {}) {
    this.#replicaId = options.replicaId ?? "local-replica";
  }

  async certify(input: {
    readonly scope: TeamExecutionScopeV1;
    readonly checkpointDigest: PlanningDigestV1;
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionContinuityAvailabilityCertificateV1> {
    const scope = validateTeamExecutionScopeV1(input.scope);
    const checkpointDigest = sha(
      input.checkpointDigest,
      "availability.checkpointDigest",
    );
    const membershipEpoch = positive(
      input.membershipEpoch,
      "availability.membershipEpoch",
    );
    const membershipConfigurationDigest = sha(
      input.membershipConfigurationDigest,
      "availability.membershipConfigurationDigest",
    );
    logical(input.logicalTimeMs, "availability.logicalTimeMs");
    this.#certified.set(checkpointDigest, {
      scopeDigest: scope.scopeDigest,
      membershipEpoch,
      membershipConfigurationDigest,
    });
    const body = {
      schemaVersion: 1 as const,
      checkpointDigest: input.checkpointDigest,
      availableReplicaIds: [this.#replicaId],
      threshold: 1,
      certifiedAtLogicalMs: input.logicalTimeMs,
    };
    return createTeamExecutionContinuityAvailabilityCertificateV1({
      ...body,
      certificateDigest: digest("team-execution-continuity-availability", body),
    });
  }

  async verify(input: {
    readonly scope: TeamExecutionScopeV1;
    readonly certificate: TeamExecutionContinuityAvailabilityCertificateV1;
    readonly checkpointDigest: PlanningDigestV1;
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    const scope = validateTeamExecutionScopeV1(input.scope);
    const certificate = createTeamExecutionContinuityAvailabilityCertificateV1(
      input.certificate,
    );
    const certified = this.#certified.get(input.checkpointDigest);
    return (
      certificate.checkpointDigest === input.checkpointDigest &&
      input.logicalTimeMs >= certificate.certifiedAtLogicalMs &&
      certified?.scopeDigest === scope.scopeDigest &&
      certified.membershipEpoch === input.membershipEpoch &&
      certified.membershipConfigurationDigest ===
        input.membershipConfigurationDigest
    );
  }
}

function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(domain as never, value as PlanningJson);
}
function sameHolder(
  left: TeamExecutionContinuityHolderV1,
  right: TeamExecutionContinuityHolderV1,
): boolean {
  return (
    left.peerId === right.peerId &&
    left.instanceId === right.instanceId &&
    left.keyId === right.keyId
  );
}
function sameScope(
  authority: TeamExecutionWorkOwnerAuthorityV1,
  scope: TeamExecutionScopeV1,
): boolean {
  return (
    authority.tenantId === scope.tenantId &&
    authority.meshId === scope.meshId &&
    authority.objectiveId === scope.objectiveId &&
    authority.rootWorkItemId === scope.rootWorkItemId
  );
}
function sameAuthority(
  left: TeamExecutionWorkOwnerAuthorityV1,
  right: TeamExecutionWorkOwnerAuthorityV1,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.meshId === right.meshId &&
    left.objectiveId === right.objectiveId &&
    left.rootWorkItemId === right.rootWorkItemId &&
    left.generation === right.generation &&
    left.headDigest === right.headDigest &&
    left.fencingToken === right.fencingToken &&
    left.membershipEpoch === right.membershipEpoch &&
    left.membershipConfigurationDigest ===
      right.membershipConfigurationDigest &&
    left.resumeCheckpointDigest === right.resumeCheckpointDigest &&
    sameHolder(left.holder, right.holder)
  );
}
function holder(
  value: TeamExecutionContinuityHolderV1,
): TeamExecutionContinuityHolderV1 {
  const authority = validateTeamExecutionWorkOwnerAuthorityV1({
    schemaVersion: 1,
    tenantId: "holder-validation",
    meshId: "holder-validation",
    objectiveId: "holder-validation",
    rootWorkItemId: "holder-validation",
    generation: 1,
    holder: value,
    headDigest: `sha256:${"0".repeat(64)}`,
    fencingToken: "holder-validation",
    membershipEpoch: 1,
    membershipConfigurationDigest: `sha256:${"0".repeat(64)}`,
    resumeCheckpointDigest: null,
    validUntilLogicalMs: 1,
  });
  return authority.holder;
}
function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new TypeError(`${label} is invalid`);
  return value as number;
}
function logical(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} is invalid`);
  return value as number;
}
function sha(value: unknown, label: string): PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
  return value as PlanningDigestV1;
}
