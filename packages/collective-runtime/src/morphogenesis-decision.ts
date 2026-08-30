import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type {
  MorphogenesisDecisionRouteV1,
  MorphogenesisPolicyRecordAnyV1,
  MorphogenesisProposalV1,
} from "./morphogenesis-contracts.js";
import { validateMorphogenesisPolicyAnyV1 } from "./morphogenesis-validation.js";

export type MorphogenesisDecisionActorTypeV1 =
  | "agent"
  | "person"
  | "policy"
  | "collective"
  | "composite";

export interface MorphogenesisDecisionCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly morphologyEpoch: number;
  readonly currentSnapshotDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly targetDigest: PlanningDigestV1;
  readonly budgetDigest: PlanningDigestV1;
  readonly operationDigests: readonly PlanningDigestV1[];
  readonly decisionRoute: MorphogenesisDecisionRouteV1;
  readonly proposerId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly membershipConfigurationDigest: PlanningDigestV1 | null;
  readonly membershipEpoch: number | null;
  readonly authorityId: AgentPlatID;
  readonly authorityEpoch: number;
  readonly workContractDigest: PlanningDigestV1 | null;
  readonly preparedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly candidateDigest: PlanningDigestV1;
}

export interface MorphogenesisDecisionAuthorizationV1 {
  readonly schemaVersion: 1;
  readonly authorizationId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly route: MorphogenesisDecisionRouteV1;
  readonly actorType: MorphogenesisDecisionActorTypeV1;
  readonly actorId: AgentPlatID;
  readonly actorMandateDigest: PlanningDigestV1;
  readonly independenceGroupId: AgentPlatID;
  readonly disposition: "approved" | "rejected";
  readonly proofDigest: PlanningDigestV1;
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly authorizationDigest: PlanningDigestV1;
}

export interface MorphogenesisDecisionBindingV1 {
  readonly schemaVersion: 1;
  readonly decisionId: AgentPlatID;
  readonly candidate: MorphogenesisDecisionCandidateV1;
  readonly authorization: MorphogenesisDecisionAuthorizationV1;
  readonly decisionPortId: AgentPlatID;
  readonly decisionPortVersion: number;
  readonly decisionPortImplementationDigest: PlanningDigestV1;
  readonly decidedAtLogicalMs: number;
  readonly decisionDigest: PlanningDigestV1;
}

export interface MorphogenesisProposalResolutionPortV1 {
  resolve(
    proposalDigest: PlanningDigestV1,
  ): Promise<MorphogenesisProposalV1 | null>;
}

export interface MorphogenesisDecisionAuthorizationIssuerPortV1 {
  issue(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisDecisionAuthorizationV1 | null>;
  verify(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly authorization: MorphogenesisDecisionAuthorizationV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface MorphogenesisDecisionStoreV1 {
  load(
    candidateDigest: PlanningDigestV1,
  ): Promise<MorphogenesisDecisionBindingV1 | null>;
  saveIfAbsent(
    binding: MorphogenesisDecisionBindingV1,
  ): Promise<MorphogenesisDecisionBindingV1>;
}

export interface MorphogenesisReplayTombstoneV1 {
  readonly schemaVersion: 1;
  readonly kind: "proposal" | "decision" | "operation";
  readonly identityDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly morphologyEpoch: number;
  readonly terminalDigest: PlanningDigestV1;
  readonly compactedAtLogicalMs: number;
  readonly tombstoneDigest: PlanningDigestV1;
}

export interface MorphogenesisReplayTombstoneStoreV1 {
  record(tombstone: MorphogenesisReplayTombstoneV1): Promise<"created" | "replayed">;
  load(input: {
    readonly kind: MorphogenesisReplayTombstoneV1["kind"];
    readonly identityDigest: PlanningDigestV1;
  }): Promise<MorphogenesisReplayTombstoneV1 | null>;
}

export function createMorphogenesisReplayTombstoneV1(
  input: Omit<MorphogenesisReplayTombstoneV1, "schemaVersion" | "tombstoneDigest">,
): MorphogenesisReplayTombstoneV1 {
  if (!new Set(["proposal", "decision", "operation"]).has(input.kind))
    fail("Morphogenesis tombstone kind is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    kind: input.kind,
    identityDigest: sha(input.identityDigest, "tombstone identity digest"),
    scopeDigest: sha(input.scopeDigest, "tombstone scope digest"),
    morphologyEpoch: positive(input.morphologyEpoch, "tombstone morphology epoch"),
    terminalDigest: sha(input.terminalDigest, "tombstone terminal digest"),
    compactedAtLogicalMs: nonNegative(
      input.compactedAtLogicalMs,
      "tombstone compaction time",
    ),
  });
  return freeze({
    ...body,
    tombstoneDigest: digest("morphogenesis-replay-tombstone", body),
  });
}

export class InMemoryMorphogenesisReplayTombstoneStoreV1
  implements MorphogenesisReplayTombstoneStoreV1
{
  readonly #values = new Map<string, MorphogenesisReplayTombstoneV1>();
  async record(input: MorphogenesisReplayTombstoneV1) {
    const tombstone = createMorphogenesisReplayTombstoneV1(
      (({ schemaVersion: _schema, tombstoneDigest: _digest, ...body }) => body)(
        input,
      ),
    );
    if (tombstone.tombstoneDigest !== input.tombstoneDigest)
      fail("Morphogenesis tombstone digest is invalid");
    const key = `${tombstone.kind}:${tombstone.identityDigest}`;
    const current = this.#values.get(key);
    if (current) {
      if (current.tombstoneDigest !== tombstone.tombstoneDigest)
        fail("Morphogenesis tombstone identity conflict");
      return "replayed" as const;
    }
    this.#values.set(key, tombstone);
    return "created" as const;
  }
  async load(input: {
    readonly kind: MorphogenesisReplayTombstoneV1["kind"];
    readonly identityDigest: PlanningDigestV1;
  }) {
    return (
      this.#values.get(`${input.kind}:${input.identityDigest}`) ?? null
    );
  }
}

export function createMorphogenesisDecisionCandidateV1(input: {
  readonly candidateId: AgentPlatID;
  readonly proposal: MorphogenesisProposalV1;
  readonly policy: MorphogenesisPolicyRecordAnyV1;
  readonly membershipConfigurationDigest: PlanningDigestV1 | null;
  readonly membershipEpoch: number | null;
  readonly authorityId: AgentPlatID;
  readonly authorityEpoch: number;
  readonly workContractDigest: PlanningDigestV1 | null;
  readonly preparedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}): MorphogenesisDecisionCandidateV1 {
  const policy = validateMorphogenesisPolicyAnyV1(input.policy);
  const proposal = normalizeProposalReference(input.proposal);
  if (
    proposal.decisionRoute === undefined ||
    !policy.policy.allowedDecisionRoutes.includes(proposal.decisionRoute)
  )
    fail("decision candidate route is not admitted by policy");
  if (
    (input.membershipConfigurationDigest === null) !==
    (input.membershipEpoch === null)
  )
    fail("decision membership currentness is incomplete");
  const body = freeze({
    schemaVersion: 1 as const,
    candidateId: id(input.candidateId, "decision candidate ID"),
    scopeDigest: proposal.scopeDigest,
    morphologyEpoch: proposal.expectedCurrentEpoch,
    currentSnapshotDigest: proposal.currentSnapshotDigest,
    proposalDigest: proposal.proposalDigest,
    targetDigest: proposal.targetDigest,
    budgetDigest: proposal.budget.budgetDigest,
    operationDigests: freeze(
      proposal.operations.map(({ operationDigest }) => operationDigest).sort(),
    ),
    decisionRoute: proposal.decisionRoute,
    proposerId: proposal.proposerId,
    policyDigest: policy.policyDigest,
    membershipConfigurationDigest: nullableSha(
      input.membershipConfigurationDigest,
      "decision membership digest",
    ),
    membershipEpoch:
      input.membershipEpoch === null
        ? null
        : positive(input.membershipEpoch, "decision membership epoch"),
    authorityId: id(input.authorityId, "decision authority ID"),
    authorityEpoch: positive(input.authorityEpoch, "decision authority epoch"),
    workContractDigest: nullableSha(
      input.workContractDigest,
      "decision Work Contract digest",
    ),
    preparedAtLogicalMs: nonNegative(
      input.preparedAtLogicalMs,
      "decision candidate preparation time",
    ),
    expiresAtLogicalMs: positive(
      input.expiresAtLogicalMs,
      "decision candidate expiry",
    ),
  });
  if (
    body.preparedAtLogicalMs < proposal.proposedAtLogicalMs ||
    body.expiresAtLogicalMs > proposal.expiresAtLogicalMs ||
    body.expiresAtLogicalMs <= body.preparedAtLogicalMs
  )
    fail("decision candidate validity is outside the proposal window");
  return freeze({
    ...body,
    candidateDigest: digest("morphogenesis-decision-candidate", body),
  });
}

export function validateMorphogenesisDecisionCandidateV1(
  input: unknown,
): MorphogenesisDecisionCandidateV1 {
  const value = exact(
    input,
    [
      "authorityEpoch",
      "authorityId",
      "budgetDigest",
      "candidateDigest",
      "candidateId",
      "currentSnapshotDigest",
      "decisionRoute",
      "expiresAtLogicalMs",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "morphologyEpoch",
      "operationDigests",
      "policyDigest",
      "preparedAtLogicalMs",
      "proposalDigest",
      "proposerId",
      "schemaVersion",
      "scopeDigest",
      "targetDigest",
      "workContractDigest",
    ],
    "morphogenesis decision candidate",
  );
  if (value.schemaVersion !== 1)
    fail("morphogenesis decision candidate schema is invalid");
  const { candidateDigest: _digest, ...body } = value;
  const normalized = freeze({
    schemaVersion: 1 as const,
    candidateId: id(body.candidateId, "decision candidate ID"),
    scopeDigest: sha(body.scopeDigest, "decision scope digest"),
    morphologyEpoch: positive(body.morphologyEpoch, "decision morphology epoch"),
    currentSnapshotDigest: sha(
      body.currentSnapshotDigest,
      "decision snapshot digest",
    ),
    proposalDigest: sha(body.proposalDigest, "decision proposal digest"),
    targetDigest: sha(body.targetDigest, "decision target digest"),
    budgetDigest: sha(body.budgetDigest, "decision budget digest"),
    operationDigests: digests(
      body.operationDigests,
      "decision operation digests",
      1,
      4_096,
    ),
    decisionRoute: route(body.decisionRoute),
    proposerId: id(body.proposerId, "decision proposer ID"),
    policyDigest: sha(body.policyDigest, "decision policy digest"),
    membershipConfigurationDigest: nullableSha(
      body.membershipConfigurationDigest,
      "decision membership digest",
    ),
    membershipEpoch:
      body.membershipEpoch === null
        ? null
        : positive(body.membershipEpoch, "decision membership epoch"),
    authorityId: id(body.authorityId, "decision authority ID"),
    authorityEpoch: positive(body.authorityEpoch, "decision authority epoch"),
    workContractDigest: nullableSha(
      body.workContractDigest,
      "decision Work Contract digest",
    ),
    preparedAtLogicalMs: nonNegative(
      body.preparedAtLogicalMs,
      "decision preparation time",
    ),
    expiresAtLogicalMs: positive(body.expiresAtLogicalMs, "decision expiry"),
  });
  if (
    (normalized.membershipConfigurationDigest === null) !==
      (normalized.membershipEpoch === null) ||
    normalized.expiresAtLogicalMs <= normalized.preparedAtLogicalMs
  )
    fail("decision candidate currentness or validity is invalid");
  const result = freeze({
    ...normalized,
    candidateDigest: digest("morphogenesis-decision-candidate", normalized),
  });
  if (value.candidateDigest !== result.candidateDigest)
    fail("morphogenesis decision candidate digest is invalid");
  return result;
}

export function createMorphogenesisDecisionAuthorizationV1(
  input: Omit<
    MorphogenesisDecisionAuthorizationV1,
    "schemaVersion" | "authorizationDigest"
  >,
): MorphogenesisDecisionAuthorizationV1 {
  const decisionRoute = route(input.route);
  const actorType = normalizeActorType(input.actorType);
  if (expectedActorType(decisionRoute) !== actorType)
    fail("decision route and actor type differ");
  const body = freeze({
    schemaVersion: 1 as const,
    authorizationId: id(input.authorizationId, "decision authorization ID"),
    candidateDigest: sha(
      input.candidateDigest,
      "decision authorization candidate digest",
    ),
    route: decisionRoute,
    actorType,
    actorId: id(input.actorId, "decision actor ID"),
    actorMandateDigest: sha(
      input.actorMandateDigest,
      "decision actor mandate digest",
    ),
    independenceGroupId: id(
      input.independenceGroupId,
      "decision independence group ID",
    ),
    disposition: disposition(input.disposition),
    proofDigest: sha(input.proofDigest, "decision proof digest"),
    issuedAtLogicalMs: nonNegative(
      input.issuedAtLogicalMs,
      "decision issue time",
    ),
    expiresAtLogicalMs: positive(
      input.expiresAtLogicalMs,
      "decision authorization expiry",
    ),
  });
  if (body.expiresAtLogicalMs <= body.issuedAtLogicalMs)
    fail("decision authorization validity is invalid");
  return freeze({
    ...body,
    authorizationDigest: digest("morphogenesis-decision-authorization", body),
  });
}

export function createCompositeMorphogenesisDecisionAuthorizationV1(input: {
  readonly candidate: MorphogenesisDecisionCandidateV1;
  readonly components: readonly MorphogenesisDecisionAuthorizationV1[];
  readonly minimumIndependentApprovals: number;
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}): MorphogenesisDecisionAuthorizationV1 {
  const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
  if (candidate.decisionRoute !== "composite")
    fail("composite decision route is not selected");
  if (
    !Number.isSafeInteger(input.minimumIndependentApprovals) ||
    input.minimumIndependentApprovals < 2 ||
    input.components.length < input.minimumIndependentApprovals ||
    input.components.length > 32
  )
    fail("composite decision threshold is invalid");
  const components = input.components
    .map(validateMorphogenesisDecisionAuthorizationV1)
    .sort((left, right) =>
      left.authorizationDigest.localeCompare(right.authorizationDigest),
    );
  const actors = new Set<string>();
  const groups = new Set<string>();
  for (const component of components) {
    if (
      component.route === "composite" ||
      component.candidateDigest !== candidate.candidateDigest ||
      component.disposition !== "approved" ||
      component.issuedAtLogicalMs > input.issuedAtLogicalMs ||
      component.expiresAtLogicalMs < input.expiresAtLogicalMs ||
      actors.has(component.actorId) ||
      groups.has(component.independenceGroupId)
    )
      fail("composite decision component is stale, duplicated or dependent");
    actors.add(component.actorId);
    groups.add(component.independenceGroupId);
  }
  if (
    actors.size < input.minimumIndependentApprovals ||
    groups.size < input.minimumIndependentApprovals
  )
    fail("composite decision lacks independent approvals");
  const proof = {
    schemaVersion: 1 as const,
    candidateDigest: candidate.candidateDigest,
    componentAuthorizationDigests: components.map(
      ({ authorizationDigest }) => authorizationDigest,
    ),
    minimumIndependentApprovals: input.minimumIndependentApprovals,
  };
  return createMorphogenesisDecisionAuthorizationV1({
    authorizationId: `${candidate.candidateId}:composite-authorization` as AgentPlatID,
    candidateDigest: candidate.candidateDigest,
    route: "composite",
    actorType: "composite",
    actorId: `composite:${candidate.candidateId}` as AgentPlatID,
    actorMandateDigest: digest(
      "morphogenesis-composite-decision-proof",
      proof,
    ),
    independenceGroupId: `composite:${groups.size}` as AgentPlatID,
    disposition: "approved",
    proofDigest: digest("morphogenesis-composite-decision-proof", {
      ...proof,
      actors: [...actors].sort(),
      groups: [...groups].sort(),
    }),
    issuedAtLogicalMs: input.issuedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  });
}

export function validateMorphogenesisDecisionAuthorizationV1(
  input: unknown,
): MorphogenesisDecisionAuthorizationV1 {
  const value = exact(
    input,
    [
      "actorId",
      "actorMandateDigest",
      "actorType",
      "authorizationDigest",
      "authorizationId",
      "candidateDigest",
      "disposition",
      "expiresAtLogicalMs",
      "independenceGroupId",
      "issuedAtLogicalMs",
      "proofDigest",
      "route",
      "schemaVersion",
    ],
    "morphogenesis decision authorization",
  );
  if (value.schemaVersion !== 1)
    fail("decision authorization schema is invalid");
  const { authorizationDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createMorphogenesisDecisionAuthorizationV1(
    body as Omit<
      MorphogenesisDecisionAuthorizationV1,
      "schemaVersion" | "authorizationDigest"
    >,
  );
  if (value.authorizationDigest !== result.authorizationDigest)
    fail("decision authorization digest is invalid");
  return result;
}

export function createMorphogenesisDecisionBindingV1(input: {
  readonly decisionId: AgentPlatID;
  readonly candidate: MorphogenesisDecisionCandidateV1;
  readonly authorization: MorphogenesisDecisionAuthorizationV1;
  readonly decisionPortId: AgentPlatID;
  readonly decisionPortVersion: number;
  readonly decisionPortImplementationDigest: PlanningDigestV1;
  readonly decidedAtLogicalMs: number;
}): MorphogenesisDecisionBindingV1 {
  const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
  const authorization = validateMorphogenesisDecisionAuthorizationV1(
    input.authorization,
  );
  const body = freeze({
    schemaVersion: 1 as const,
    decisionId: id(input.decisionId, "morphogenesis decision ID"),
    candidate,
    authorization,
    decisionPortId: id(input.decisionPortId, "decision port ID"),
    decisionPortVersion: positive(
      input.decisionPortVersion,
      "decision port version",
    ),
    decisionPortImplementationDigest: sha(
      input.decisionPortImplementationDigest,
      "decision port implementation digest",
    ),
    decidedAtLogicalMs: nonNegative(
      input.decidedAtLogicalMs,
      "decision time",
    ),
  });
  if (
    authorization.candidateDigest !== candidate.candidateDigest ||
    authorization.route !== candidate.decisionRoute ||
    body.decidedAtLogicalMs < authorization.issuedAtLogicalMs ||
    body.decidedAtLogicalMs >= authorization.expiresAtLogicalMs ||
    body.decidedAtLogicalMs >= candidate.expiresAtLogicalMs
  )
    fail("morphogenesis decision binding is stale or inconsistent");
  return freeze({
    ...body,
    decisionDigest: digest("morphogenesis-decision-binding", body),
  });
}

export function validateMorphogenesisDecisionBindingV1(
  input: unknown,
): MorphogenesisDecisionBindingV1 {
  const value = exact(
    input,
    [
      "authorization",
      "candidate",
      "decidedAtLogicalMs",
      "decisionDigest",
      "decisionId",
      "decisionPortId",
      "decisionPortImplementationDigest",
      "decisionPortVersion",
      "schemaVersion",
    ],
    "morphogenesis decision binding",
  );
  if (value.schemaVersion !== 1)
    fail("morphogenesis decision binding schema is invalid");
  const result = createMorphogenesisDecisionBindingV1({
    decisionId: value.decisionId as AgentPlatID,
    candidate: value.candidate as MorphogenesisDecisionCandidateV1,
    authorization:
      value.authorization as MorphogenesisDecisionAuthorizationV1,
    decisionPortId: value.decisionPortId as AgentPlatID,
    decisionPortVersion: value.decisionPortVersion as number,
    decisionPortImplementationDigest:
      value.decisionPortImplementationDigest as PlanningDigestV1,
    decidedAtLogicalMs: value.decidedAtLogicalMs as number,
  });
  if (value.decisionDigest !== result.decisionDigest)
    fail("morphogenesis decision binding digest is invalid");
  return result;
}

export class InMemoryMorphogenesisDecisionStoreV1
  implements MorphogenesisDecisionStoreV1
{
  readonly #bindings = new Map<string, MorphogenesisDecisionBindingV1>();

  async load(
    candidateDigest: PlanningDigestV1,
  ): Promise<MorphogenesisDecisionBindingV1 | null> {
    const value = this.#bindings.get(candidateDigest);
    return value ? immutable(value) : null;
  }

  async saveIfAbsent(
    input: MorphogenesisDecisionBindingV1,
  ): Promise<MorphogenesisDecisionBindingV1> {
    const binding = validateMorphogenesisDecisionBindingV1(input);
    const existing = this.#bindings.get(binding.candidate.candidateDigest);
    if (existing) {
      if (existing.decisionDigest !== binding.decisionDigest)
        fail("morphogenesis decision candidate already has a conflicting result");
      return immutable(existing);
    }
    this.#bindings.set(binding.candidate.candidateDigest, binding);
    return immutable(binding);
  }
}

/** Exact-evidence local adapter for tests and single-process composition. */
export class InMemoryMorphogenesisDecisionAuthorizationIssuerV1
  implements MorphogenesisDecisionAuthorizationIssuerPortV1
{
  readonly #authorizations = new Map<
    string,
    MorphogenesisDecisionAuthorizationV1
  >();

  register(input: MorphogenesisDecisionAuthorizationV1): void {
    const authorization = validateMorphogenesisDecisionAuthorizationV1(input);
    const existing = this.#authorizations.get(authorization.candidateDigest);
    if (existing && existing.authorizationDigest !== authorization.authorizationDigest)
      fail("decision authorization candidate already has conflicting evidence");
    this.#authorizations.set(authorization.candidateDigest, authorization);
  }

  async issue(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisDecisionAuthorizationV1 | null> {
    const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
    const authorization = this.#authorizations.get(candidate.candidateDigest);
    if (!authorization) return null;
    return immutable(authorization);
  }

  async verify(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly authorization: MorphogenesisDecisionAuthorizationV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
    const authorization = validateMorphogenesisDecisionAuthorizationV1(
      input.authorization,
    );
    const retained = this.#authorizations.get(candidate.candidateDigest);
    return Boolean(
      retained &&
        retained.authorizationDigest === authorization.authorizationDigest &&
        authorization.issuedAtLogicalMs <= input.logicalTimeMs &&
        input.logicalTimeMs < authorization.expiresAtLogicalMs,
    );
  }
}

export class MorphogenesisDecisionRuntimeV1 {
  readonly #policy: MorphogenesisPolicyRecordAnyV1;

  constructor(
    readonly options: {
      readonly decisionPortId: AgentPlatID;
      readonly decisionPortVersion: number;
      readonly decisionPortImplementationDigest: PlanningDigestV1;
      readonly policy: MorphogenesisPolicyRecordAnyV1;
      readonly proposals: MorphogenesisProposalResolutionPortV1;
      readonly authorizations: MorphogenesisDecisionAuthorizationIssuerPortV1;
      readonly store: MorphogenesisDecisionStoreV1;
    },
  ) {
    this.#policy = validateMorphogenesisPolicyAnyV1(options.policy);
  }

  async prepare(input: Parameters<typeof createMorphogenesisDecisionCandidateV1>[0]): Promise<MorphogenesisDecisionCandidateV1> {
    const resolved = await this.options.proposals.resolve(
      input.proposal.proposalDigest,
    );
    if (!resolved || resolved.proposalDigest !== input.proposal.proposalDigest)
      fail("morphogenesis proposal resolution failed");
    if (resolved.scopeDigest !== input.proposal.scopeDigest)
      fail("resolved morphogenesis proposal is cross-scoped");
    return createMorphogenesisDecisionCandidateV1({
      ...input,
      proposal: resolved,
      policy: this.#policy,
    });
  }

  async decide(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisDecisionBindingV1 | null> {
    const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
    const logicalTimeMs = nonNegative(input.logicalTimeMs, "decision time");
    const retained = await this.options.store.load(candidate.candidateDigest);
    if (retained) return this.#verifyBinding(candidate, retained, logicalTimeMs);
    if (logicalTimeMs < candidate.preparedAtLogicalMs || logicalTimeMs >= candidate.expiresAtLogicalMs)
      fail("morphogenesis decision candidate is not current");
    const authorization = await this.options.authorizations.issue({
      candidate,
      logicalTimeMs,
    });
    if (!authorization) return null;
    const verifiedAuthorization =
      validateMorphogenesisDecisionAuthorizationV1(authorization);
    if (
      !(await this.options.authorizations.verify({
        candidate,
        authorization: verifiedAuthorization,
        logicalTimeMs,
      }))
    )
      fail("morphogenesis decision authorization verification failed");
    this.#assertAuthorization(candidate, verifiedAuthorization, logicalTimeMs);
    const binding = createMorphogenesisDecisionBindingV1({
      decisionId: `${candidate.candidateId}:decision` as AgentPlatID,
      candidate,
      authorization: verifiedAuthorization,
      decisionPortId: this.options.decisionPortId,
      decisionPortVersion: this.options.decisionPortVersion,
      decisionPortImplementationDigest:
        this.options.decisionPortImplementationDigest,
      decidedAtLogicalMs: logicalTimeMs,
    });
    return this.options.store.saveIfAbsent(binding);
  }

  async verifyRetained(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisDecisionBindingV1 | null> {
    const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
    const retained = await this.options.store.load(candidate.candidateDigest);
    return retained
      ? this.#verifyBinding(candidate, retained, input.logicalTimeMs)
      : null;
  }

  async #verifyBinding(
    candidate: MorphogenesisDecisionCandidateV1,
    input: MorphogenesisDecisionBindingV1,
    logicalTimeMs: number,
  ): Promise<MorphogenesisDecisionBindingV1> {
    const binding = validateMorphogenesisDecisionBindingV1(input);
    if (binding.candidate.candidateDigest !== candidate.candidateDigest)
      fail("retained morphogenesis decision candidate changed");
    this.#assertAuthorization(candidate, binding.authorization, logicalTimeMs);
    if (
      !(await this.options.authorizations.verify({
        candidate,
        authorization: binding.authorization,
        logicalTimeMs,
      }))
    )
      fail("retained morphogenesis decision verification failed");
    return binding;
  }

  #assertAuthorization(
    candidate: MorphogenesisDecisionCandidateV1,
    authorization: MorphogenesisDecisionAuthorizationV1,
    logicalTimeMs: number,
  ): void {
    if (
      authorization.candidateDigest !== candidate.candidateDigest ||
      authorization.route !== candidate.decisionRoute ||
      authorization.issuedAtLogicalMs > logicalTimeMs ||
      authorization.expiresAtLogicalMs <= logicalTimeMs ||
      authorization.expiresAtLogicalMs > candidate.expiresAtLogicalMs ||
      (this.#policy.policy.requireIndependentDecider &&
        authorization.actorId === candidate.proposerId)
    )
      fail("morphogenesis decision authorization is stale or prohibited");
  }
}

function normalizeProposalReference(
  input: MorphogenesisProposalV1,
): MorphogenesisProposalV1 {
  if (
    !input ||
    typeof input !== "object" ||
    input.schemaVersion !== 1 ||
    input.advisoryOnly !== true
  )
    fail("morphogenesis proposal reference is invalid");
  sha(input.proposalDigest, "proposal digest");
  sha(input.scopeDigest, "proposal scope digest");
  sha(input.currentSnapshotDigest, "proposal snapshot digest");
  sha(input.targetDigest, "proposal target digest");
  sha(input.budget.budgetDigest, "proposal budget digest");
  if (!Array.isArray(input.operations) || input.operations.length < 1)
    fail("morphogenesis proposal operations are invalid");
  return input;
}

function expectedActorType(
  routeValue: MorphogenesisDecisionRouteV1,
): MorphogenesisDecisionActorTypeV1 {
  return routeValue === "authorized_agent"
    ? "agent"
    : routeValue === "authorized_person"
      ? "person"
      : routeValue === "local_policy"
        ? "policy"
        : routeValue === "collective"
          ? "collective"
          : "composite";
}

function route(value: unknown): MorphogenesisDecisionRouteV1 {
  if (
    !new Set([
      "local_policy",
      "authorized_agent",
      "authorized_person",
      "collective",
      "composite",
    ]).has(value as string)
  )
    fail("morphogenesis decision route is invalid");
  return value as MorphogenesisDecisionRouteV1;
}

function normalizeActorType(value: unknown): MorphogenesisDecisionActorTypeV1 {
  if (!new Set(["agent", "person", "policy", "collective", "composite"]).has(value as string))
    fail("morphogenesis decision actor type is invalid");
  return value as MorphogenesisDecisionActorTypeV1;
}

function disposition(value: unknown): "approved" | "rejected" {
  if (value !== "approved" && value !== "rejected")
    fail("morphogenesis decision disposition is invalid");
  return value;
}

function exact(input: unknown, keys: readonly string[], label: string): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) fail(`${label} must be an object`); const prototype = Object.getPrototypeOf(input); if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`); const actual = Object.keys(input as object).sort(); const expected = [...keys].sort(); if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} fields are invalid`); return input as Record<string, unknown>; }
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown, label: string): AgentPlatID { if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${label} is invalid`); return value as AgentPlatID; }
function sha(value: unknown, label: string): PlanningDigestV1 { if (typeof value !== "string" || !DIGEST.test(value)) fail(`${label} is invalid`); return value as PlanningDigestV1; }
function nullableSha(value: unknown, label: string): PlanningDigestV1 | null { return value === null ? null : sha(value, label); }
function positive(value: unknown, label: string): number { const result = nonNegative(value, label); if (result < 1) fail(`${label} is invalid`); return result; }
function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`); return value as number; }
function digests(value: unknown, label: string, minimum: number, maximum: number): readonly PlanningDigestV1[] { if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(`${label} count is invalid`); const result = value.map((item) => sha(item, label)).sort(); if (new Set(result).size !== result.length) fail(`${label} contain a duplicate`); return freeze(result); }
function digest(domain: PlanningDigestDomainV1, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.getOwnPropertyNames(value)) freeze((value as Record<string, unknown>)[key]); } return value; }
function immutable<T>(value: T): T { return freeze(structuredClone(value)); }
function fail(message: string): never { throw new TypeError(message); }
