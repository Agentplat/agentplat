import type { JsonValue } from "@agentplat/core";
import {
  normalizeCheckpointTransferV1,
  normalizeRoleBindingV1,
  type PortableAgentCheckpointTransferV1,
  type PortableAgentRoleBindingV1,
  type PortableAgentRoleRestorationAuthorizationV1,
  type PortableAgentSessionSnapshotV1,
} from "@agentplat/runtime/adapter";
import {
  digestTrustEligibilityDecisionV1,
  validateTrustEligibilityDecisionV1,
  type TrustEligibilityDecisionV1,
} from "@agentplat/trust";

import {
  assertRoleAlignmentStateV1,
  createRoleAlignmentPolicyRecordV1,
  createRoleAlignmentRoleAnchorV1,
  type RoleAlignmentPolicyV1,
  type RoleAlignmentStateV1,
} from "./role-alignment.js";
import type { RoleAlignmentRestorablePortableAgentControlV1 } from "./role-alignment-portable-agent.js";
import {
  createRoleRealignmentPolicyRecordV1,
  validateTrustedRoleDefinitionV1,
  type RoleAuthorityCeilingV1,
  type RoleRealignmentPolicyV1,
  type TrustedRoleDefinitionV1,
} from "./role-realignment.js";
import {
  admitRoleRefinementCandidateV1,
  assertRoleRefinementStateV1,
  certifyRoleRefinementV1,
  completeRoleRefinementRollbackV1,
  createRoleRefinementActivationV1,
  createRoleRefinementCertificateV1,
  createRoleRefinementEvaluationV1,
  createRoleRefinementEvidenceSummaryV1,
  createRoleRefinementObservationV1,
  createRoleRefinementPolicyRecordV1,
  createRoleRefinementPublicationV1,
  createRoleRefinementRequestV1,
  createRoleRefinementRollbackV1,
  createRoleRefinementSemanticDecisionV1,
  createRoleRefinementStateV1,
  digestRoleRefinementJsonV1,
  expireRoleRefinementV1,
  materializeRefinedRoleDefinitionV1,
  quarantineRoleRefinementRevisionV1,
  rebindRoleRefinementSessionV1,
  recordRoleRefinementActivationV1,
  recordRoleRefinementEvaluationV1,
  recordRoleRefinementObservationV1,
  recordRoleRefinementPublicationV1,
  requireRoleRefinementRollbackV1,
  requireRoleRefinementRollbackRecertificationV1,
  selectRoleRefinementCandidateV1,
  validateRoleRefinementProposalV1,
  validateRoleRefinementSemanticDecisionV1,
  type AdmittedRoleRefinementCandidateV1,
  type RoleRefinementCertificationPortV1,
  type RoleRefinementEvaluationV1,
  type RoleRefinementObservationV1,
  type RoleRefinementPatchV1,
  type RoleRefinementPolicyV1,
  type RoleRefinementProposalV1,
  type RoleRefinementRequestV1,
  type RoleRefinementSemanticDecisionV1,
  type RoleRefinementStateV1,
  type RoleRefinementTransitionV1,
} from "./role-refinement.js";
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  compareCodeUnits,
  deepFreeze,
} from "./validation.js";

export interface RoleRefinementStrategyV1 {
  readonly proposerId: string;
  readonly proposerVersion: number;
  readonly proposerBindingDigest: string;
  propose(input: {
    readonly request: RoleRefinementRequestV1;
    readonly predecessor: TrustedRoleDefinitionV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }):
    | Promise<readonly RoleRefinementProposalV1[]>
    | readonly RoleRefinementProposalV1[];
}

export interface RoleRefinementSemanticResultV1 {
  readonly accepted: boolean;
  readonly objectiveAligned: boolean;
  readonly constraintsNotWeaker: boolean;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
}

export interface RoleRefinementSemanticValidatorPortV1 {
  readonly validatorId: string;
  readonly validatorVersion: number;
  readonly validatorBindingDigest: string;
  validate(input: {
    readonly request: RoleRefinementRequestV1;
    readonly predecessor: TrustedRoleDefinitionV1;
    readonly patch: RoleRefinementPatchV1;
    readonly refinedDefinition: TrustedRoleDefinitionV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<RoleRefinementSemanticResultV1> | RoleRefinementSemanticResultV1;
}

export interface RoleRefinementEvaluationResultV1 {
  readonly eligible: boolean;
  readonly predictedCoherenceBps: number;
  readonly predictedContributionBps: number;
  readonly uncertaintyBps: number;
  readonly transitionRiskBps: number;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
}

export interface RoleRefinementEvaluatorPortV1 {
  readonly evaluatorId: string;
  readonly evaluatorVersion: number;
  readonly evaluatorBindingDigest: string;
  evaluate(input: {
    readonly request: RoleRefinementRequestV1;
    readonly candidate: AdmittedRoleRefinementCandidateV1;
    readonly predecessor: TrustedRoleDefinitionV1;
    readonly patch: RoleRefinementPatchV1;
    readonly refinedDefinition: TrustedRoleDefinitionV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }):
    | Promise<RoleRefinementEvaluationResultV1>
    | RoleRefinementEvaluationResultV1;
}

export interface RoleRefinementMonitoringResultV1 {
  readonly coherenceBps: number;
  readonly contributionBps: number;
  readonly uncertaintyBps: number;
  readonly hardViolation: boolean;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
}

export interface RoleRefinementMonitorPortV1 {
  readonly observerId: string;
  readonly observerVersion: number;
  readonly observerBindingDigest: string;
  observe(input: {
    readonly state: RoleRefinementStateV1;
    readonly session: PortableAgentSessionSnapshotV1;
    readonly alignmentState: RoleAlignmentStateV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }):
    | Promise<RoleRefinementMonitoringResultV1 | null>
    | RoleRefinementMonitoringResultV1
    | null;
}

export interface RoleRefinementTrustEligibilityPortV1 {
  evaluate(input: {
    readonly tenantId: string;
    readonly subjectKind: "proposer" | "evaluator" | "observer";
    readonly subjectId: string;
    readonly subjectBindingDigest: string;
    readonly requestDigest: string;
    readonly candidateDigest: string | null;
    readonly logicalTimeMs: number;
  }):
    | Promise<TrustEligibilityDecisionV1 | null>
    | TrustEligibilityDecisionV1
    | null;
}

export interface RoleRefinementDraftRecordV1 {
  readonly schemaVersion: 1;
  readonly draftId: string;
  readonly requestDigest: string;
  readonly proposal: RoleRefinementProposalV1;
  readonly definition: TrustedRoleDefinitionV1;
  readonly semanticDecision: RoleRefinementSemanticDecisionV1;
  readonly stagedAtLogicalMs: number;
  readonly draftDigest: string;
}

export interface RoleRefinementDraftRepositoryV1 {
  stage(
    record: RoleRefinementDraftRecordV1,
  ): Promise<RoleRefinementDraftRecordV1>;
  resolve(input: {
    readonly draftId: string;
    readonly requestDigest: string;
    readonly patchDigest: string;
    readonly definitionDigest: string;
  }): Promise<RoleRefinementDraftRecordV1 | null>;
}

export interface RoleRevisionCatalogPublicationResultV1 {
  readonly publicationId: string;
  readonly definition: TrustedRoleDefinitionV1;
  readonly publishedAtLogicalMs: number;
}

export interface GovernedRoleRevisionCatalogPortV1 {
  resolve(input: {
    readonly catalogId: string;
    readonly definitionId: string;
    readonly definitionRevision: number;
    readonly definitionDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<TrustedRoleDefinitionV1 | null> | TrustedRoleDefinitionV1 | null;
  publish(input: {
    readonly publicationId: string;
    readonly definition: TrustedRoleDefinitionV1;
    readonly expectedPredecessorRevision: number;
    readonly expectedPredecessorDigest: string;
    readonly certificateDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<RoleRevisionCatalogPublicationResultV1>;
  quarantine(input: {
    readonly definitionDigest: string;
    readonly rollbackCertificateDigest: string;
    readonly monitoringDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<string>;
  isQuarantined(definitionDigest: string): Promise<boolean> | boolean;
}

export interface RoleRefinementSessionRuntimePortV1 {
  getSession(
    sessionId: string,
  ): Promise<PortableAgentSessionSnapshotV1 | undefined>;
  updateRole(
    sessionId: string,
    role: PortableAgentRoleBindingV1,
    expectedRevision: number,
  ): Promise<PortableAgentSessionSnapshotV1>;
  restoreRole(
    sessionId: string,
    role: PortableAgentRoleBindingV1,
    expectedRevision: number,
    authorization: PortableAgentRoleRestorationAuthorizationV1,
  ): Promise<PortableAgentSessionSnapshotV1>;
}

export interface RoleRefinementStateStoreV1 {
  load(sessionId: string): Promise<RoleRefinementStateV1 | undefined>;
  save(
    state: RoleRefinementStateV1,
    expectedRevision: number | null,
  ): Promise<void>;
  rebind(input: {
    readonly sourceSessionId: string;
    readonly targetState: RoleRefinementStateV1;
    readonly expectedSourceRevision: number;
  }): Promise<void>;
}

export class RoleRefinementStoreConflictErrorV1 extends Error {
  readonly name = "RoleRefinementStoreConflictErrorV1";
  constructor(message = "role refinement state revision conflict") {
    super(message);
  }
}

export class InMemoryRoleRefinementStateStoreV1 implements RoleRefinementStateStoreV1 {
  private readonly states = new Map<string, RoleRefinementStateV1>();

  async load(sessionId: string): Promise<RoleRefinementStateV1 | undefined> {
    assertIdentifier(sessionId, "sessionId");
    return this.states.get(sessionId);
  }

  async save(
    state: RoleRefinementStateV1,
    expectedRevision: number | null,
  ): Promise<void> {
    const current = this.states.get(state.activeSessionId);
    if (
      (expectedRevision === null && current !== undefined) ||
      (expectedRevision !== null && current?.revision !== expectedRevision)
    )
      throw new RoleRefinementStoreConflictErrorV1();
    this.states.set(state.activeSessionId, state);
  }

  async rebind(input: {
    readonly sourceSessionId: string;
    readonly targetState: RoleRefinementStateV1;
    readonly expectedSourceRevision: number;
  }): Promise<void> {
    const source = this.states.get(input.sourceSessionId);
    if (
      source?.revision !== input.expectedSourceRevision ||
      this.states.has(input.targetState.activeSessionId) ||
      input.sourceSessionId === input.targetState.activeSessionId
    )
      throw new RoleRefinementStoreConflictErrorV1();
    this.states.delete(input.sourceSessionId);
    this.states.set(input.targetState.activeSessionId, input.targetState);
  }
}

export class InMemoryRoleRefinementDraftRepositoryV1 implements RoleRefinementDraftRepositoryV1 {
  private readonly drafts = new Map<string, RoleRefinementDraftRecordV1>();

  async stage(
    record: RoleRefinementDraftRecordV1,
  ): Promise<RoleRefinementDraftRecordV1> {
    validateDraftRecord(record);
    const current = this.drafts.get(record.draftId);
    if (current) {
      if (current.draftDigest !== record.draftDigest)
        throw new RoleRefinementStoreConflictErrorV1(
          "role refinement draft conflict",
        );
      return current;
    }
    const frozen = freezeClone(record);
    this.drafts.set(record.draftId, frozen);
    return frozen;
  }

  async resolve(input: {
    readonly draftId: string;
    readonly requestDigest: string;
    readonly patchDigest: string;
    readonly definitionDigest: string;
  }): Promise<RoleRefinementDraftRecordV1 | null> {
    const record = this.drafts.get(input.draftId);
    if (
      !record ||
      record.requestDigest !== input.requestDigest ||
      record.proposal.patch.patchDigest !== input.patchDigest ||
      record.definition.definitionDigest !== input.definitionDigest
    )
      return null;
    return record;
  }
}

export class InMemoryGovernedRoleRevisionCatalogV1 implements GovernedRoleRevisionCatalogPortV1 {
  private readonly records = new Map<string, TrustedRoleDefinitionV1>();
  private readonly publications = new Map<
    string,
    RoleRevisionCatalogPublicationResultV1
  >();
  private readonly publicationCertificateDigests = new Map<string, string>();
  private readonly quarantined = new Set<string>();
  private readonly quarantineRecords = new Map<
    string,
    Readonly<{
      rollbackCertificateDigest: string;
      monitoringDigest: string;
      quarantineDigest: string;
    }>
  >();
  private readonly realignmentPolicy: RoleRealignmentPolicyV1;

  constructor(input: {
    readonly definitions: readonly TrustedRoleDefinitionV1[];
    readonly realignmentPolicy: RoleRealignmentPolicyV1;
  }) {
    this.realignmentPolicy = createRoleRealignmentPolicyRecordV1(
      input.realignmentPolicy,
    ).policy;
    for (const definition of input.definitions) {
      const validated = validateTrustedRoleDefinitionV1(
        definition,
        this.realignmentPolicy,
      );
      const key = catalogKey(validated);
      if (this.records.has(key))
        throw new TypeError("role_revision_catalog_duplicate");
      this.records.set(key, validated);
    }
  }

  async resolve(input: {
    readonly catalogId: string;
    readonly definitionId: string;
    readonly definitionRevision: number;
    readonly definitionDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<TrustedRoleDefinitionV1 | null> {
    assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
    const record = this.records.get(
      `${input.catalogId}\0${input.definitionId}\0${input.definitionRevision}`,
    );
    return record?.definitionDigest === input.definitionDigest ? record : null;
  }

  async publish(input: {
    readonly publicationId: string;
    readonly definition: TrustedRoleDefinitionV1;
    readonly expectedPredecessorRevision: number;
    readonly expectedPredecessorDigest: string;
    readonly certificateDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<RoleRevisionCatalogPublicationResultV1> {
    assertIdentifier(input.publicationId, "publicationId");
    assertDigest(input.expectedPredecessorDigest, "expectedPredecessorDigest");
    assertDigest(input.certificateDigest, "certificateDigest");
    assertSafeInteger(
      input.expectedPredecessorRevision,
      "expectedPredecessorRevision",
      1,
    );
    assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
    const definition = validateTrustedRoleDefinitionV1(
      input.definition,
      this.realignmentPolicy,
    );
    const existingPublication = this.publications.get(input.publicationId);
    if (existingPublication) {
      if (
        existingPublication.definition.definitionDigest !==
          definition.definitionDigest ||
        this.publicationCertificateDigests.get(input.publicationId) !==
          input.certificateDigest
      )
        throw new RoleRefinementStoreConflictErrorV1(
          "catalog publication conflict",
        );
      return existingPublication;
    }
    const predecessor = this.records.get(
      `${definition.catalogId}\0${definition.definitionId}\0${input.expectedPredecessorRevision}`,
    );
    const successorKey = catalogKey(definition);
    const existingSuccessor = this.records.get(successorKey);
    if (
      !predecessor ||
      predecessor.definitionDigest !== input.expectedPredecessorDigest ||
      definition.definitionRevision !== input.expectedPredecessorRevision + 1 ||
      definition.predecessorDefinitionDigest !==
        input.expectedPredecessorDigest ||
      this.quarantined.has(definition.definitionDigest) ||
      (existingSuccessor &&
        existingSuccessor.definitionDigest !== definition.definitionDigest)
    )
      throw new RoleRefinementStoreConflictErrorV1(
        "catalog compare-and-swap conflict",
      );
    this.records.set(successorKey, definition);
    const result = deepFreeze({
      publicationId: input.publicationId,
      definition,
      publishedAtLogicalMs: input.logicalTimeMs,
    });
    this.publications.set(input.publicationId, result);
    this.publicationCertificateDigests.set(
      input.publicationId,
      input.certificateDigest,
    );
    return result;
  }

  async quarantine(input: {
    readonly definitionDigest: string;
    readonly rollbackCertificateDigest: string;
    readonly monitoringDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<string> {
    assertDigest(input.definitionDigest, "definitionDigest");
    assertDigest(input.rollbackCertificateDigest, "rollbackCertificateDigest");
    assertDigest(input.monitoringDigest, "monitoringDigest");
    assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
    if (
      ![...this.records.values()].some(
        (record) => record.definitionDigest === input.definitionDigest,
      )
    )
      throw new TypeError("role_revision_catalog_definition_unavailable");
    const existing = this.quarantineRecords.get(input.definitionDigest);
    if (existing) {
      if (
        existing.rollbackCertificateDigest !==
          input.rollbackCertificateDigest ||
        existing.monitoringDigest !== input.monitoringDigest
      )
        throw new RoleRefinementStoreConflictErrorV1(
          "role revision quarantine conflict",
        );
      return existing.quarantineDigest;
    }
    this.quarantined.add(input.definitionDigest);
    const quarantineDigest = digestRoleRefinementJsonV1("quarantine", {
      schemaVersion: 1,
      ...input,
    } as unknown as JsonValue);
    this.quarantineRecords.set(
      input.definitionDigest,
      deepFreeze({
        rollbackCertificateDigest: input.rollbackCertificateDigest,
        monitoringDigest: input.monitoringDigest,
        quarantineDigest,
      }),
    );
    return quarantineDigest;
  }

  async isQuarantined(definitionDigest: string): Promise<boolean> {
    assertDigest(definitionDigest, "definitionDigest");
    return this.quarantined.has(definitionDigest);
  }
}

export interface RoleRefinementObserverV1 {
  observe(input: {
    readonly activeSessionId: string;
    readonly status: RoleRefinementStateV1["status"];
    readonly revision: number;
    readonly stateDigest: string;
    readonly event: RoleRefinementTransitionV1["event"];
  }): Promise<void> | void;
}

export interface RoleRefinementHandoffEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly contentClass: "role_refinement_state";
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyDigest: string;
  readonly sourceSessionId: string;
  readonly sourceAgentId: string;
  readonly checkpointTransferDigest: string;
  readonly sourceState: RoleRefinementStateV1;
  readonly exportedAtLogicalMs: number;
  readonly handoffDigest: string;
}

export interface CreateRoleRefinementPortableAgentV1 {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policy: RoleRefinementPolicyV1;
  readonly realignmentPolicy: RoleRealignmentPolicyV1;
  readonly alignmentPolicy: RoleAlignmentPolicyV1;
  readonly alignment: RoleAlignmentRestorablePortableAgentControlV1;
  readonly runtime: RoleRefinementSessionRuntimePortV1;
  readonly strategies: readonly RoleRefinementStrategyV1[];
  readonly semanticValidator: RoleRefinementSemanticValidatorPortV1;
  readonly evaluators: readonly RoleRefinementEvaluatorPortV1[];
  readonly monitor: RoleRefinementMonitorPortV1;
  readonly trustEligibility: RoleRefinementTrustEligibilityPortV1;
  readonly drafts: RoleRefinementDraftRepositoryV1;
  readonly catalog: GovernedRoleRevisionCatalogPortV1;
  readonly certification: RoleRefinementCertificationPortV1;
  readonly requestTtlMs: number;
  readonly evaluationTtlMs: number;
  readonly semanticDecisionTtlMs: number;
  readonly certificationTtlMs: number;
  readonly observationTtlMs: number;
  readonly monitoringTtlMs: number;
  readonly maximumStateBytes: number;
  readonly stateStore?: RoleRefinementStateStoreV1;
  readonly observer?: RoleRefinementObserverV1;
}

export interface RunRoleRefinementInputV1 {
  readonly sessionId: string;
  readonly requestId: string;
  readonly selectionId: string;
  readonly publicationId: string;
  readonly activationId: string;
  readonly rollbackId: string;
  readonly predecessorCatalogId: string;
  readonly predecessorDefinitionId: string;
  readonly predecessorDefinitionRevision: number;
  readonly predecessorDefinitionDigest: string;
  readonly authorityCeiling: RoleAuthorityCeilingV1;
  readonly logicalTimeMs: number;
  readonly signal?: AbortSignal;
}

export interface RoleRefinementPortableAgentV1 {
  readonly binding: Readonly<{
    readonly controllerId: string;
    readonly controllerVersion: number;
    readonly implementationId: string;
    readonly policyId: string;
    readonly policyVersion: number;
    readonly policyDigest: string;
    readonly realignmentPolicyDigest: string;
    readonly alignmentPolicyDigest: string;
  }>;
  getState(sessionId: string): Promise<RoleRefinementStateV1 | undefined>;
  run(input: RunRoleRefinementInputV1): Promise<RoleRefinementStateV1>;
  exportHandoff(input: {
    readonly sessionId: string;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleRefinementHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: RoleRefinementHandoffEnvelopeV1;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly targetAlignmentState: RoleAlignmentStateV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleRefinementStateV1>;
}

export function createRoleRefinementPortableAgentV1(
  options: CreateRoleRefinementPortableAgentV1,
): RoleRefinementPortableAgentV1 {
  return new RoleRefinementPortableAgent(options);
}

class RoleRefinementPortableAgent implements RoleRefinementPortableAgentV1 {
  readonly binding: RoleRefinementPortableAgentV1["binding"];
  private readonly options: CreateRoleRefinementPortableAgentV1;
  private readonly policy: RoleRefinementPolicyV1;
  private readonly realignmentPolicy: RoleRealignmentPolicyV1;
  private readonly alignmentPolicy: RoleAlignmentPolicyV1;
  private readonly stateStore: RoleRefinementStateStoreV1;

  constructor(options: CreateRoleRefinementPortableAgentV1) {
    validateOptions(options);
    const policyRecord = createRoleRefinementPolicyRecordV1(options.policy);
    const realignmentRecord = createRoleRealignmentPolicyRecordV1(
      options.realignmentPolicy,
    );
    const alignmentRecord = createRoleAlignmentPolicyRecordV1(
      options.alignmentPolicy,
    );
    this.options = options;
    this.policy = policyRecord.policy;
    this.realignmentPolicy = realignmentRecord.policy;
    this.alignmentPolicy = alignmentRecord.policy;
    this.stateStore =
      options.stateStore ?? new InMemoryRoleRefinementStateStoreV1();
    this.binding = deepFreeze({
      controllerId: options.controllerId,
      controllerVersion: options.controllerVersion,
      implementationId: options.implementationId,
      policyId: policyRecord.policy.policyId,
      policyVersion: policyRecord.policy.policyVersion,
      policyDigest: policyRecord.policyDigest,
      realignmentPolicyDigest: realignmentRecord.policyDigest,
      alignmentPolicyDigest: alignmentRecord.policyDigest,
    });
  }

  async getState(
    sessionId: string,
  ): Promise<RoleRefinementStateV1 | undefined> {
    assertIdentifier(sessionId, "sessionId");
    const state = await this.stateStore.load(sessionId);
    if (!state) return undefined;
    return assertRoleRefinementStateV1(
      state,
      this.policy,
      this.realignmentPolicy,
      {
        controllerId: this.binding.controllerId,
        controllerVersion: this.binding.controllerVersion,
        implementationId: this.binding.implementationId,
        activeSessionId: sessionId,
      },
    );
  }

  async run(input: RunRoleRefinementInputV1): Promise<RoleRefinementStateV1> {
    validateRunInput(input);
    let state = await this.getState(input.sessionId);
    if (!state) state = await this.start(input);
    assertRunInputBoundToState(input, state);
    if (
      ["confirmed", "quarantined", "expired", "failed"].includes(state.status)
    )
      return state;
    const publicationAuthorityExpired = Boolean(
      state.publicationCertificate &&
      ["certified", "published"].includes(state.status) &&
      input.logicalTimeMs >= state.publicationCertificate.expiresAtLogicalMs,
    );
    if (
      publicationAuthorityExpired ||
      (input.logicalTimeMs >= state.request.expiresAtLogicalMs &&
        ![
          "monitoring",
          "rollback_required",
          "rollback_certified",
          "rolled_back",
        ].includes(state.status))
    ) {
      const expired = expireRoleRefinementV1(
        state,
        {
          expectedRevision: state.revision,
          logicalTimeMs: input.logicalTimeMs,
        },
        this.policy,
      );
      await this.persist(state, expired);
      return expired.state;
    }
    if (
      state.status === "rollback_certified" &&
      state.rollbackCertificate &&
      input.logicalTimeMs >= state.rollbackCertificate.expiresAtLogicalMs
    ) {
      const recertification = requireRoleRefinementRollbackRecertificationV1(
        state,
        {
          expectedRevision: state.revision,
          logicalTimeMs: input.logicalTimeMs,
        },
        this.policy,
      );
      await this.persist(state, recertification);
      state = recertification.state;
    }
    if (state.status === "requested" || state.status === "collecting")
      state = await this.proposeAndEvaluate(state, input);
    if (state.status === "collecting") {
      const selected = selectRoleRefinementCandidateV1(
        state,
        {
          expectedRevision: state.revision,
          selectionId: input.selectionId,
          logicalTimeMs: input.logicalTimeMs,
        },
        this.policy,
      );
      await this.persist(state, selected);
      state = selected.state;
    }
    if (state.status === "selected")
      state = await this.certify(
        state,
        "publish",
        input.logicalTimeMs,
        input.signal,
      );
    if (state.status === "certified")
      state = await this.publish(
        state,
        input.publicationId,
        input.logicalTimeMs,
      );
    if (state.status === "published")
      state = await this.activate(
        state,
        input.activationId,
        input.logicalTimeMs,
      );
    if (state.status === "monitoring")
      state = await this.monitor(state, input.logicalTimeMs, input.signal);
    if (state.status === "rollback_required")
      state = await this.certify(
        state,
        "rollback",
        input.logicalTimeMs,
        input.signal,
      );
    if (state.status === "rollback_certified")
      state = await this.rollback(state, input.rollbackId, input.logicalTimeMs);
    if (state.status === "rolled_back")
      state = await this.quarantine(state, input.logicalTimeMs);
    return state;
  }

  async exportHandoff(input: {
    readonly sessionId: string;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleRefinementHandoffEnvelopeV1> {
    const state = await this.requireState(input.sessionId);
    assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
    const transfer = normalizeCheckpointTransferV1(input.checkpointTransfer, {
      maximumStateBytes: this.options.maximumStateBytes,
    });
    const session = await this.options.runtime.getSession(
      state.activeSessionId,
    );
    const alignment = await this.options.alignment.getState(
      state.activeSessionId,
    );
    if (!session || !alignment)
      throw new TypeError("role_refinement_handoff_runtime_unavailable");
    assertSessionAlignment(session, alignment);
    const definition = await this.resolveDefinitionDigest(
      state,
      activeDefinitionDigest(state),
      input.logicalTimeMs,
    );
    assertDefinitionMatchesRole(definition, session.role, alignment);
    if (
      input.logicalTimeMs < state.lastLogicalTimeMs ||
      transfer.tenantId !== state.tenantId ||
      transfer.sourceSessionId !== state.activeSessionId ||
      transfer.sourceAgentId !== state.agentId ||
      transfer.objectiveId !== state.objectiveId ||
      transfer.roleBindingId !== activeDefinitionId(state) ||
      transfer.sourceSessionRevision !== session.revision
    )
      throw new TypeError("role_refinement_handoff_binding_invalid");
    const checkpointTransferDigest = digestRoleRefinementJsonV1(
      "checkpoint-transfer",
      transfer as unknown as JsonValue,
    );
    const body = {
      schemaVersion: 1 as const,
      contentClass: "role_refinement_state" as const,
      controllerId: this.binding.controllerId,
      controllerVersion: this.binding.controllerVersion,
      implementationId: this.binding.implementationId,
      policyDigest: this.binding.policyDigest,
      sourceSessionId: state.activeSessionId,
      sourceAgentId: state.agentId,
      checkpointTransferDigest,
      sourceState: state,
      exportedAtLogicalMs: input.logicalTimeMs,
    };
    return deepFreeze({
      ...body,
      handoffDigest: digestRoleRefinementJsonV1(
        "handoff",
        body as unknown as JsonValue,
      ),
    });
  }

  async importHandoff(input: {
    readonly handoff: RoleRefinementHandoffEnvelopeV1;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly targetAlignmentState: RoleAlignmentStateV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleRefinementStateV1> {
    const transfer = normalizeCheckpointTransferV1(input.checkpointTransfer, {
      maximumStateBytes: this.options.maximumStateBytes,
    });
    const handoff = this.validateHandoff(input.handoff, transfer);
    await this.resolveStateArtifacts(handoff.sourceState, input.logicalTimeMs);
    assertRoleAlignmentStateV1(
      input.targetAlignmentState,
      this.alignmentPolicy,
      { sessionId: input.targetAlignmentState.sessionId },
    );
    const target = input.targetAlignmentState;
    if (
      input.logicalTimeMs < handoff.exportedAtLogicalMs ||
      target.tenantId !== handoff.sourceState.tenantId ||
      target.objectiveId !== handoff.sourceState.objectiveId ||
      target.sessionId === handoff.sourceSessionId ||
      transfer.tenantId !== handoff.sourceState.tenantId ||
      transfer.sourceSessionId !== handoff.sourceSessionId ||
      transfer.roleBindingId !== activeDefinitionId(handoff.sourceState)
    )
      throw new TypeError("role_refinement_handoff_binding_invalid");
    const expectedDefinition = activeDefinitionDigest(handoff.sourceState);
    const definition = await this.resolveDefinitionDigest(
      handoff.sourceState,
      expectedDefinition,
      input.logicalTimeMs,
    );
    if (
      target.roleAnchor.roleBindingId !== definition.definitionId ||
      target.roleAnchor.roleRevision !== definition.definitionRevision ||
      target.roleAnchor.roleContentDigest !==
        expectedRoleContentDigest(definition, target)
    )
      throw new TypeError("role_refinement_handoff_role_mismatch");
    const rebound = rebindRoleRefinementSessionV1(
      handoff.sourceState,
      {
        expectedRevision: handoff.sourceState.revision,
        targetSessionId: target.sessionId,
        targetAgentId: target.agentId,
        transferDigest: handoff.checkpointTransferDigest,
        logicalTimeMs: input.logicalTimeMs,
      },
      this.policy,
    );
    await this.stateStore.rebind({
      sourceSessionId: handoff.sourceSessionId,
      targetState: rebound.state,
      expectedSourceRevision: handoff.sourceState.revision,
    });
    await this.observe(rebound);
    return rebound.state;
  }

  private async start(
    input: RunRoleRefinementInputV1,
  ): Promise<RoleRefinementStateV1> {
    const session = await this.options.runtime.getSession(input.sessionId);
    const alignment = await this.options.alignment.getState(input.sessionId);
    if (!session || !alignment)
      throw new TypeError("role_refinement_session_or_alignment_unavailable");
    assertSessionAlignment(session, alignment);
    const predecessor = await this.resolveDefinition(
      input.predecessorCatalogId,
      input.predecessorDefinitionId,
      input.predecessorDefinitionRevision,
      input.predecessorDefinitionDigest,
      input.logicalTimeMs,
    );
    assertDefinitionMatchesRole(predecessor, session.role, alignment);
    const evidence = createRoleRefinementEvidenceSummaryV1(
      {
        alignmentStateRevision: alignment.revision,
        alignmentStateDigest: alignment.stateDigest,
        rollingCoherenceBps: alignment.rollingCoherenceBps ?? 0,
        degraded: alignment.degraded,
        observedSignalCount: alignment.signalCount,
        reasonCodes: alignment.events
          .slice(-this.policy.limits.maximumReasonCodes)
          .map((event) => event.reasonCode)
          .sort(compareCodeUnits)
          .filter(
            (value, index, values) =>
              index === 0 || values[index - 1] !== value,
          ),
        evidenceReferenceIds: alignment.events
          .slice(-this.policy.limits.maximumEvidenceReferences)
          .map((event) => event.eventDigest)
          .sort(compareCodeUnits),
        summarizedAtLogicalMs: input.logicalTimeMs,
      },
      this.policy,
    );
    const policyRecord = createRoleRefinementPolicyRecordV1(this.policy);
    const request = createRoleRefinementRequestV1(
      {
        requestId: input.requestId,
        selectionId: input.selectionId,
        publicationId: input.publicationId,
        activationId: input.activationId,
        rollbackId: input.rollbackId,
        policyId: this.policy.policyId,
        policyVersion: this.policy.policyVersion,
        policyDigest: policyRecord.policyDigest,
        tenantId: session.tenantId,
        sessionId: session.sessionId,
        agentId: session.agentId,
        objectiveId: session.objectiveId,
        predecessorCatalogId: predecessor.catalogId,
        predecessorDefinitionId: predecessor.definitionId,
        predecessorDefinitionRevision: predecessor.definitionRevision,
        predecessorDefinitionDigest: predecessor.definitionDigest,
        predecessorRoleAnchorDigest: alignment.roleAnchor.anchorDigest,
        authorityCeiling: input.authorityCeiling,
        evidence,
        createdAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs: input.logicalTimeMs + this.options.requestTtlMs,
      },
      this.policy,
      this.realignmentPolicy,
    );
    const state = createRoleRefinementStateV1({
      controllerId: this.binding.controllerId,
      controllerVersion: this.binding.controllerVersion,
      implementationId: this.binding.implementationId,
      request,
      policy: this.policy,
      realignmentPolicy: this.realignmentPolicy,
    });
    await this.stateStore.save(state, null);
    await this.observe({ state, event: state.events[0] });
    return state;
  }

  private async proposeAndEvaluate(
    stateInput: RoleRefinementStateV1,
    input: RunRoleRefinementInputV1,
  ): Promise<RoleRefinementStateV1> {
    let state = stateInput;
    const predecessor = await this.resolvePredecessor(
      state,
      input.logicalTimeMs,
    );
    const proposalSets = await Promise.all(
      this.options.strategies.map(async (strategy) => ({
        strategy,
        proposals: await strategy.propose({
          request: state.request,
          predecessor,
          logicalTimeMs: input.logicalTimeMs,
          signal: input.signal,
        }),
      })),
    );
    const proposals = proposalSets
      .flatMap(({ strategy, proposals: values }) =>
        values.map((proposal) => ({ strategy, proposal })),
      )
      .sort((left, right) =>
        compareCodeUnits(
          left.proposal.proposalDigest,
          right.proposal.proposalDigest,
        ),
      );
    for (const { strategy, proposal: rawProposal } of proposals) {
      if (
        state.candidates.some(
          (item) => item.proposalId === rawProposal.proposalId,
        )
      )
        continue;
      if (
        rawProposal.proposerId !== strategy.proposerId ||
        rawProposal.proposerVersion !== strategy.proposerVersion ||
        rawProposal.proposerBindingDigest !== strategy.proposerBindingDigest
      )
        throw new TypeError("role_refinement_strategy_binding_mismatch");
      const proposal = validateRoleRefinementProposalV1(
        rawProposal,
        state.request,
        predecessor,
        this.policy,
        this.realignmentPolicy,
      );
      const trustDigest = await this.eligibleSubjectDigest({
        tenantId: state.tenantId,
        subjectKind: "proposer",
        subjectId: strategy.proposerId,
        subjectBindingDigest: strategy.proposerBindingDigest,
        requestDigest: state.request.requestDigest,
        candidateDigest: null,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!trustDigest) continue;
      const definition = materializeRefinedRoleDefinitionV1({
        predecessor,
        patch: proposal.patch,
        authorityCeiling: state.request.authorityCeiling,
        policy: this.policy,
        realignmentPolicy: this.realignmentPolicy,
      });
      if (definition.definitionDigest !== proposal.refinedDefinitionDigest)
        throw new TypeError("role_refinement_strategy_definition_mismatch");
      const semanticResult = await this.options.semanticValidator.validate({
        request: state.request,
        predecessor,
        patch: proposal.patch,
        refinedDefinition: definition,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
      });
      const semanticDecision = createRoleRefinementSemanticDecisionV1(
        {
          requestDigest: state.request.requestDigest,
          patchDigest: proposal.patch.patchDigest,
          refinedDefinitionDigest: definition.definitionDigest,
          validatorId: this.options.semanticValidator.validatorId,
          validatorVersion: this.options.semanticValidator.validatorVersion,
          validatorBindingDigest:
            this.options.semanticValidator.validatorBindingDigest,
          accepted: semanticResult.accepted,
          objectiveAligned: semanticResult.objectiveAligned,
          constraintsNotWeaker: semanticResult.constraintsNotWeaker,
          reasonCodes: semanticResult.reasonCodes,
          evidenceReferenceIds: semanticResult.evidenceReferenceIds,
          decidedAtLogicalMs: input.logicalTimeMs,
          expiresAtLogicalMs: Math.min(
            state.request.expiresAtLogicalMs,
            input.logicalTimeMs + this.options.semanticDecisionTtlMs,
          ),
        },
        this.policy,
      );
      if (!semanticDecision.accepted) continue;
      const draft = createDraftRecord(
        state.request,
        proposal,
        definition,
        semanticDecision,
        input.logicalTimeMs,
      );
      await this.options.drafts.stage(draft);
      const admitted = admitRoleRefinementCandidateV1(
        state,
        {
          expectedRevision: state.revision,
          proposal,
          refinedDefinition: definition,
          draftId: draft.draftId,
          semanticDecision,
          proposerTrustDecisionDigest: trustDigest,
          logicalTimeMs: input.logicalTimeMs,
        },
        predecessor,
        this.policy,
        this.realignmentPolicy,
      );
      await this.persist(state, admitted);
      state = admitted.state;
    }
    for (const candidate of state.candidates) {
      const draft = await this.resolveDraft(candidate, state);
      for (const evaluator of this.options.evaluators) {
        if (
          state.evaluations.some(
            (evaluation) =>
              evaluation.candidateDigest === candidate.candidateDigest &&
              evaluation.evaluatorBindingDigest ===
                evaluator.evaluatorBindingDigest,
          )
        )
          continue;
        const trustDigest = await this.eligibleSubjectDigest({
          tenantId: state.tenantId,
          subjectKind: "evaluator",
          subjectId: evaluator.evaluatorId,
          subjectBindingDigest: evaluator.evaluatorBindingDigest,
          requestDigest: state.request.requestDigest,
          candidateDigest: candidate.candidateDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!trustDigest) continue;
        const result = await evaluator.evaluate({
          request: state.request,
          candidate,
          predecessor,
          patch: draft.proposal.patch,
          refinedDefinition: draft.definition,
          logicalTimeMs: input.logicalTimeMs,
          signal: input.signal,
        });
        const evaluation = createRoleRefinementEvaluationV1(
          {
            evaluationId: `refinement-evaluation-${candidate.candidateDigest.slice(7, 23)}-${evaluator.evaluatorBindingDigest.slice(7, 23)}`,
            requestDigest: state.request.requestDigest,
            candidateDigest: candidate.candidateDigest,
            patchDigest: candidate.patchDigest,
            refinedDefinitionDigest: candidate.refinedDefinitionDigest,
            evaluatorId: evaluator.evaluatorId,
            evaluatorVersion: evaluator.evaluatorVersion,
            evaluatorBindingDigest: evaluator.evaluatorBindingDigest,
            evaluatorTrustDecisionDigest: trustDigest,
            eligible: result.eligible,
            predictedCoherenceBps: result.predictedCoherenceBps,
            predictedContributionBps: result.predictedContributionBps,
            uncertaintyBps: result.uncertaintyBps,
            transitionRiskBps: result.transitionRiskBps,
            reasonCodes: result.reasonCodes,
            evidenceReferenceIds: result.evidenceReferenceIds,
            evaluatedAtLogicalMs: input.logicalTimeMs,
            expiresAtLogicalMs: Math.min(
              state.request.expiresAtLogicalMs,
              input.logicalTimeMs + this.options.evaluationTtlMs,
            ),
          },
          state,
          this.policy,
        );
        const recorded = recordRoleRefinementEvaluationV1(
          state,
          {
            expectedRevision: state.revision,
            evaluation,
            logicalTimeMs: input.logicalTimeMs,
          },
          this.policy,
        );
        await this.persist(state, recorded);
        state = recorded.state;
      }
    }
    return state;
  }

  private async certify(
    state: RoleRefinementStateV1,
    action: "publish" | "rollback",
    logicalTimeMs: number,
    signal?: AbortSignal,
  ): Promise<RoleRefinementStateV1> {
    const certificate = await this.options.certification.certify({
      action,
      state,
      policy: this.policy,
      logicalTimeMs,
      expiresAtLogicalMs:
        action === "publish"
          ? Math.min(
              state.request.expiresAtLogicalMs,
              logicalTimeMs + this.options.certificationTtlMs,
            )
          : logicalTimeMs + this.options.certificationTtlMs,
      signal,
    });
    if (!certificate) return state;
    const certified = certifyRoleRefinementV1(
      state,
      { expectedRevision: state.revision, certificate, logicalTimeMs },
      this.policy,
    );
    await this.persist(state, certified);
    return certified.state;
  }

  private async publish(
    state: RoleRefinementStateV1,
    publicationId: string,
    logicalTimeMs: number,
  ): Promise<RoleRefinementStateV1> {
    const publicationCertificate = state.publicationCertificate;
    if (
      !publicationCertificate ||
      logicalTimeMs < publicationCertificate.certifiedAtLogicalMs ||
      logicalTimeMs >= publicationCertificate.expiresAtLogicalMs
    )
      throw new TypeError("role_refinement_publication_certificate_expired");
    const candidate = selectedCandidate(state);
    const draft = await this.resolveDraft(candidate, state);
    if (
      await this.options.catalog.isQuarantined(
        draft.definition.definitionDigest,
      )
    )
      throw new TypeError("role_refinement_definition_quarantined");
    const published = await this.options.catalog.publish({
      publicationId,
      definition: draft.definition,
      expectedPredecessorRevision: state.request.predecessorDefinitionRevision,
      expectedPredecessorDigest: state.request.predecessorDefinitionDigest,
      certificateDigest: state.publicationCertificate!.certificateDigest,
      logicalTimeMs,
    });
    if (
      published.definition.definitionDigest !==
        draft.definition.definitionDigest ||
      published.publicationId !== publicationId
    )
      throw new TypeError("role_refinement_catalog_publication_mismatch");
    const publication = createRoleRefinementPublicationV1(
      {
        publicationId,
        catalogId: published.definition.catalogId,
        definitionId: published.definition.definitionId,
        definitionRevision: published.definition.definitionRevision,
        predecessorDefinitionDigest:
          published.definition.predecessorDefinitionDigest!,
        refinedDefinitionDigest: published.definition.definitionDigest,
        certificateDigest: state.publicationCertificate!.certificateDigest,
        publishedAtLogicalMs: published.publishedAtLogicalMs,
      },
      state,
    );
    const recorded = recordRoleRefinementPublicationV1(
      state,
      { expectedRevision: state.revision, publication, logicalTimeMs },
      this.policy,
    );
    await this.persist(state, recorded);
    return recorded.state;
  }

  private async activate(
    state: RoleRefinementStateV1,
    activationId: string,
    logicalTimeMs: number,
  ): Promise<RoleRefinementStateV1> {
    const publicationCertificate = state.publicationCertificate;
    if (
      !publicationCertificate ||
      logicalTimeMs < publicationCertificate.certifiedAtLogicalMs ||
      logicalTimeMs >= publicationCertificate.expiresAtLogicalMs ||
      logicalTimeMs >= state.request.expiresAtLogicalMs
    )
      throw new TypeError("role_refinement_activation_authority_expired");
    const definition = await this.resolvePublished(state, logicalTimeMs);
    const targetRole = roleForDefinition(definition, state.objectiveId);
    let session = await this.options.runtime.getSession(state.activeSessionId);
    if (!session) throw new TypeError("portable_agent_session_unavailable");
    if (!sameRole(session.role, targetRole)) {
      if (
        session.role.roleRevision !==
          state.request.predecessorDefinitionRevision ||
        session.role.roleBindingId !== state.request.predecessorDefinitionId
      )
        throw new TypeError("portable_agent_role_transition_conflict");
      session = await this.options.runtime.updateRole(
        state.activeSessionId,
        targetRole,
        session.revision,
      );
    }
    let alignment = await this.options.alignment.getState(
      state.activeSessionId,
    );
    if (!alignment) throw new TypeError("role_alignment_state_unavailable");
    if (
      alignment.roleAnchor.roleContentDigest !==
      roleContentDigest(session, targetRole)
    )
      alignment = await this.options.alignment.activateSessionRole({
        sessionId: state.activeSessionId,
        expectedRevision: alignment.revision,
        tenantId: state.tenantId,
        agentId: state.agentId,
        role: targetRole,
        logicalTimeMs,
      });
    const activation = createRoleRefinementActivationV1(
      {
        activationId,
        publicationDigest: state.publication!.publicationDigest,
        predecessorDefinitionDigest: state.request.predecessorDefinitionDigest,
        refinedDefinitionDigest: definition.definitionDigest,
        roleBindingId: targetRole.roleBindingId,
        roleRevision: targetRole.roleRevision,
        roleContentDigest: roleContentDigest(session, targetRole),
        runtimeSessionRevision: session.revision,
        activatedAtLogicalMs: logicalTimeMs,
        monitoringExpiresAtLogicalMs:
          logicalTimeMs + this.options.monitoringTtlMs,
      },
      state,
      this.policy,
    );
    const recorded = recordRoleRefinementActivationV1(
      state,
      { expectedRevision: state.revision, activation, logicalTimeMs },
      this.policy,
    );
    await this.persist(state, recorded);
    return recorded.state;
  }

  private async monitor(
    state: RoleRefinementStateV1,
    logicalTimeMs: number,
    signal?: AbortSignal,
  ): Promise<RoleRefinementStateV1> {
    if (logicalTimeMs >= state.activation!.monitoringExpiresAtLogicalMs) {
      const required = requireRoleRefinementRollbackV1(
        state,
        { expectedRevision: state.revision, logicalTimeMs },
        this.policy,
      );
      await this.persist(state, required);
      return required.state;
    }
    const session = await this.options.runtime.getSession(
      state.activeSessionId,
    );
    const alignment = await this.options.alignment.getState(
      state.activeSessionId,
    );
    if (!session || !alignment)
      throw new TypeError("role_refinement_monitoring_state_unavailable");
    const result = await this.options.monitor.observe({
      state,
      session,
      alignmentState: alignment,
      logicalTimeMs,
      signal,
    });
    if (!result) return state;
    const trustDigest = await this.eligibleSubjectDigest({
      tenantId: state.tenantId,
      subjectKind: "observer",
      subjectId: this.options.monitor.observerId,
      subjectBindingDigest: this.options.monitor.observerBindingDigest,
      requestDigest: state.request.requestDigest,
      candidateDigest: state.selection!.selectedCandidateDigest,
      logicalTimeMs,
    });
    if (!trustDigest) return state;
    const observation = createRoleRefinementObservationV1(
      {
        observationId: `refinement-observation-${state.revision + 1}`,
        requestDigest: state.request.requestDigest,
        activationDigest: state.activation!.activationDigest,
        observerId: this.options.monitor.observerId,
        observerVersion: this.options.monitor.observerVersion,
        observerBindingDigest: this.options.monitor.observerBindingDigest,
        observerTrustDecisionDigest: trustDigest,
        coherenceBps: result.coherenceBps,
        contributionBps: result.contributionBps,
        uncertaintyBps: result.uncertaintyBps,
        hardViolation: result.hardViolation,
        reasonCodes: result.reasonCodes,
        evidenceReferenceIds: result.evidenceReferenceIds,
        observedAtLogicalMs: logicalTimeMs,
        expiresAtLogicalMs: Math.min(
          state.activation!.monitoringExpiresAtLogicalMs,
          logicalTimeMs + this.options.observationTtlMs,
        ),
      },
      state,
      this.policy,
    );
    const recorded = recordRoleRefinementObservationV1(
      state,
      { expectedRevision: state.revision, observation, logicalTimeMs },
      this.policy,
    );
    await this.persist(state, recorded);
    return recorded.state;
  }

  private async rollback(
    state: RoleRefinementStateV1,
    rollbackId: string,
    logicalTimeMs: number,
  ): Promise<RoleRefinementStateV1> {
    const rollbackCertificate = state.rollbackCertificate;
    if (
      !rollbackCertificate ||
      logicalTimeMs < rollbackCertificate.certifiedAtLogicalMs ||
      logicalTimeMs >= rollbackCertificate.expiresAtLogicalMs
    )
      throw new TypeError("role_refinement_rollback_certificate_expired");
    const predecessor = await this.resolvePredecessor(state, logicalTimeMs);
    const predecessorRole = roleForDefinition(predecessor, state.objectiveId);
    let session = await this.options.runtime.getSession(state.activeSessionId);
    if (!session) throw new TypeError("portable_agent_session_unavailable");
    if (!sameRole(session.role, predecessorRole))
      session = await this.options.runtime.restoreRole(
        state.activeSessionId,
        predecessorRole,
        session.revision,
        {
          schemaVersion: 1,
          restorationId: rollbackId,
          expectedActiveRoleBindingId: state.activation!.roleBindingId,
          expectedActiveRoleRevision: state.activation!.roleRevision,
          restoredRoleBindingId: predecessorRole.roleBindingId,
          restoredRoleRevision: predecessorRole.roleRevision,
          certificateDigest: state.rollbackCertificate!.certificateDigest,
        },
      );
    let alignment = await this.options.alignment.getState(
      state.activeSessionId,
    );
    if (!alignment) throw new TypeError("role_alignment_state_unavailable");
    if (
      alignment.roleAnchor.roleContentDigest !==
      roleContentDigest(session, predecessorRole)
    )
      alignment = await this.options.alignment.restoreSessionRole({
        sessionId: state.activeSessionId,
        expectedRevision: alignment.revision,
        tenantId: state.tenantId,
        agentId: state.agentId,
        role: predecessorRole,
        authorization: {
          schemaVersion: 1,
          restorationId: rollbackId,
          expectedActiveRoleBindingId: state.activation!.roleBindingId,
          expectedActiveRoleRevision: state.activation!.roleRevision,
          restoredRoleBindingId: predecessorRole.roleBindingId,
          restoredRoleRevision: predecessorRole.roleRevision,
          certificateDigest: state.rollbackCertificate!.certificateDigest,
        },
        logicalTimeMs,
      });
    const rollback = createRoleRefinementRollbackV1(
      {
        rollbackId,
        activationDigest: state.activation!.activationDigest,
        monitoringDigest: state.monitoring!.monitoringDigest,
        rollbackCertificateDigest: state.rollbackCertificate!.certificateDigest,
        restoredDefinitionDigest: predecessor.definitionDigest,
        quarantinedDefinitionDigest: state.activation!.refinedDefinitionDigest,
        runtimeSessionRevision: session.revision,
        rolledBackAtLogicalMs: logicalTimeMs,
      },
      state,
    );
    const rolledBack = completeRoleRefinementRollbackV1(
      state,
      { expectedRevision: state.revision, rollback, logicalTimeMs },
      this.policy,
    );
    await this.persist(state, rolledBack);
    return rolledBack.state;
  }

  private async quarantine(
    state: RoleRefinementStateV1,
    logicalTimeMs: number,
  ): Promise<RoleRefinementStateV1> {
    const quarantineDigest = await this.options.catalog.quarantine({
      definitionDigest: state.activation!.refinedDefinitionDigest,
      rollbackCertificateDigest: state.rollbackCertificate!.certificateDigest,
      monitoringDigest: state.monitoring!.monitoringDigest,
      logicalTimeMs,
    });
    const quarantined = quarantineRoleRefinementRevisionV1(
      state,
      {
        expectedRevision: state.revision,
        quarantineRecordDigest: quarantineDigest,
        logicalTimeMs,
      },
      this.policy,
    );
    await this.persist(state, quarantined);
    return quarantined.state;
  }

  private async resolveDraft(
    candidate: AdmittedRoleRefinementCandidateV1,
    state: RoleRefinementStateV1,
  ): Promise<RoleRefinementDraftRecordV1> {
    const draft = await this.options.drafts.resolve({
      draftId: candidate.draftId,
      requestDigest: state.request.requestDigest,
      patchDigest: candidate.patchDigest,
      definitionDigest: candidate.refinedDefinitionDigest,
    });
    if (!draft) throw new TypeError("role_refinement_draft_unavailable");
    validateDraftRecord(draft);
    validateRoleRefinementSemanticDecisionV1(
      draft.semanticDecision,
      this.policy,
    );
    return draft;
  }

  private async resolvePredecessor(
    state: RoleRefinementStateV1,
    logicalTimeMs: number,
  ): Promise<TrustedRoleDefinitionV1> {
    return this.resolveDefinition(
      state.request.predecessorCatalogId,
      state.request.predecessorDefinitionId,
      state.request.predecessorDefinitionRevision,
      state.request.predecessorDefinitionDigest,
      logicalTimeMs,
    );
  }

  private async resolvePublished(
    state: RoleRefinementStateV1,
    logicalTimeMs: number,
  ): Promise<TrustedRoleDefinitionV1> {
    return this.resolveDefinition(
      state.publication!.catalogId,
      state.publication!.definitionId,
      state.publication!.definitionRevision,
      state.publication!.refinedDefinitionDigest,
      logicalTimeMs,
    );
  }

  private async resolveDefinition(
    catalogId: string,
    definitionId: string,
    definitionRevision: number,
    definitionDigest: string,
    logicalTimeMs: number,
  ): Promise<TrustedRoleDefinitionV1> {
    const definition = await this.options.catalog.resolve({
      catalogId,
      definitionId,
      definitionRevision,
      definitionDigest,
      logicalTimeMs,
    });
    if (!definition)
      throw new TypeError("role_revision_catalog_definition_unavailable");
    return validateTrustedRoleDefinitionV1(definition, this.realignmentPolicy);
  }

  private async resolveDefinitionDigest(
    state: RoleRefinementStateV1,
    definitionDigest: string,
    logicalTimeMs: number,
  ): Promise<TrustedRoleDefinitionV1> {
    return definitionDigest === state.request.predecessorDefinitionDigest
      ? this.resolvePredecessor(state, logicalTimeMs)
      : this.resolvePublished(state, logicalTimeMs);
  }

  private async resolveStateArtifacts(
    state: RoleRefinementStateV1,
    logicalTimeMs: number,
  ): Promise<void> {
    await this.resolvePredecessor(state, logicalTimeMs);
    for (const candidate of state.candidates)
      await this.resolveDraft(candidate, state);
    if (state.publication) await this.resolvePublished(state, logicalTimeMs);
  }

  private async eligibleSubjectDigest(
    input: Parameters<RoleRefinementTrustEligibilityPortV1["evaluate"]>[0],
  ): Promise<string | null> {
    const raw = await this.options.trustEligibility.evaluate(input);
    if (!raw) return null;
    let decision: TrustEligibilityDecisionV1;
    try {
      decision = validateTrustEligibilityDecisionV1(raw);
    } catch {
      return null;
    }
    if (
      decision.disposition !== "eligible" ||
      decision.evaluatedAtLogicalMs > input.logicalTimeMs
    )
      return null;
    return `sha256:${digestTrustEligibilityDecisionV1(decision)}`;
  }

  private async persist(
    previous: RoleRefinementStateV1,
    transition: RoleRefinementTransitionV1,
  ): Promise<void> {
    await this.stateStore.save(transition.state, previous.revision);
    await this.observe(transition);
  }

  private async observe(transition: RoleRefinementTransitionV1): Promise<void> {
    if (!this.options.observer) return;
    try {
      await this.options.observer.observe({
        activeSessionId: transition.state.activeSessionId,
        status: transition.state.status,
        revision: transition.state.revision,
        stateDigest: transition.state.stateDigest,
        event: transition.event,
      });
    } catch {
      // Enforcement state is durable before best-effort observation.
    }
  }

  private validateHandoff(
    input: RoleRefinementHandoffEnvelopeV1,
    transfer: PortableAgentCheckpointTransferV1,
  ): RoleRefinementHandoffEnvelopeV1 {
    assertExactKeys(
      input,
      [
        "schemaVersion",
        "contentClass",
        "controllerId",
        "controllerVersion",
        "implementationId",
        "policyDigest",
        "sourceSessionId",
        "sourceAgentId",
        "checkpointTransferDigest",
        "sourceState",
        "exportedAtLogicalMs",
        "handoffDigest",
      ],
      "role refinement handoff",
    );
    assertRoleRefinementStateV1(
      input.sourceState,
      this.policy,
      this.realignmentPolicy,
      {
        controllerId: this.binding.controllerId,
        controllerVersion: this.binding.controllerVersion,
        implementationId: this.binding.implementationId,
        activeSessionId: input.sourceSessionId,
      },
    );
    const { handoffDigest, ...body } = input;
    if (
      input.schemaVersion !== 1 ||
      input.contentClass !== "role_refinement_state" ||
      input.policyDigest !== this.binding.policyDigest ||
      input.sourceAgentId !== input.sourceState.agentId ||
      input.checkpointTransferDigest !==
        digestRoleRefinementJsonV1(
          "checkpoint-transfer",
          transfer as unknown as JsonValue,
        ) ||
      transfer.sourceSessionId !== input.sourceSessionId ||
      transfer.sourceAgentId !== input.sourceAgentId ||
      transfer.objectiveId !== input.sourceState.objectiveId ||
      digestRoleRefinementJsonV1("handoff", body as unknown as JsonValue) !==
        handoffDigest
    )
      throw new TypeError("role_refinement_handoff_invalid");
    return input;
  }

  private async requireState(
    sessionId: string,
  ): Promise<RoleRefinementStateV1> {
    const state = await this.getState(sessionId);
    if (!state) throw new TypeError("role_refinement_state_unavailable");
    return state;
  }
}

function createDraftRecord(
  request: RoleRefinementRequestV1,
  proposal: RoleRefinementProposalV1,
  definition: TrustedRoleDefinitionV1,
  semanticDecision: RoleRefinementSemanticDecisionV1,
  logicalTimeMs: number,
): RoleRefinementDraftRecordV1 {
  const body = {
    schemaVersion: 1 as const,
    draftId: `role-draft-${proposal.proposalDigest.slice(7, 39)}`,
    requestDigest: request.requestDigest,
    proposal,
    definition,
    semanticDecision,
    stagedAtLogicalMs: logicalTimeMs,
  };
  return deepFreeze({
    ...body,
    draftDigest: digestRoleRefinementJsonV1(
      "draft",
      body as unknown as JsonValue,
    ),
  });
}

function validateDraftRecord(record: RoleRefinementDraftRecordV1): void {
  assertExactKeys(
    record,
    [
      "schemaVersion",
      "draftId",
      "requestDigest",
      "proposal",
      "definition",
      "semanticDecision",
      "stagedAtLogicalMs",
      "draftDigest",
    ],
    "role refinement draft",
  );
  const { draftDigest, ...body } = record;
  assertIdentifier(record.draftId, "draftId");
  assertDigest(record.requestDigest, "requestDigest");
  assertDigest(record.draftDigest, "draftDigest");
  assertSafeInteger(record.stagedAtLogicalMs, "stagedAtLogicalMs");
  if (
    record.schemaVersion !== 1 ||
    record.proposal.requestDigest !== record.requestDigest ||
    record.proposal.refinedDefinitionDigest !==
      record.definition.definitionDigest ||
    record.semanticDecision.requestDigest !== record.requestDigest ||
    record.semanticDecision.patchDigest !== record.proposal.patch.patchDigest ||
    record.semanticDecision.refinedDefinitionDigest !==
      record.definition.definitionDigest ||
    digestRoleRefinementJsonV1("draft", body as unknown as JsonValue) !==
      draftDigest
  )
    throw new TypeError("role_refinement_draft_invalid");
}

function selectedCandidate(
  state: RoleRefinementStateV1,
): AdmittedRoleRefinementCandidateV1 {
  const candidate = state.candidates.find(
    (item) => item.candidateDigest === state.selection?.selectedCandidateDigest,
  );
  if (!candidate)
    throw new TypeError("role_refinement_selected_candidate_missing");
  return candidate;
}

function roleForDefinition(
  definition: TrustedRoleDefinitionV1,
  objectiveId: string,
): PortableAgentRoleBindingV1 {
  return normalizeRoleBindingV1({
    schemaVersion: 1,
    roleBindingId: definition.definitionId,
    roleRevision: definition.definitionRevision,
    predecessorRoleBindingId:
      definition.predecessorDefinitionDigest === null
        ? null
        : definition.definitionId,
    objectiveId,
    roleKey: definition.roleKey,
    instructions: definition.instructions,
    constraints: definition.constraints,
    validFromLogicalMs: definition.validFromLogicalMs,
    validUntilLogicalMs: definition.validUntilLogicalMs,
  });
}

function roleContentDigest(
  session: PortableAgentSessionSnapshotV1,
  role: PortableAgentRoleBindingV1,
): string {
  return createRoleAlignmentRoleAnchorV1({
    tenantId: session.tenantId,
    sessionId: session.sessionId,
    agentId: session.agentId,
    objectiveId: role.objectiveId,
    roleBindingId: role.roleBindingId,
    roleRevision: role.roleRevision,
    predecessorRoleBindingId: role.predecessorRoleBindingId,
    roleKey: role.roleKey,
    roleContent: {
      instructions: [...role.instructions],
      constraints: role.constraints,
      validFromLogicalMs: role.validFromLogicalMs,
      validUntilLogicalMs: role.validUntilLogicalMs,
    },
  }).roleContentDigest;
}

function expectedRoleContentDigest(
  definition: TrustedRoleDefinitionV1,
  alignment: RoleAlignmentStateV1,
): string {
  return createRoleAlignmentRoleAnchorV1({
    tenantId: alignment.tenantId,
    sessionId: alignment.sessionId,
    agentId: alignment.agentId,
    objectiveId: alignment.objectiveId,
    roleBindingId: definition.definitionId,
    roleRevision: definition.definitionRevision,
    predecessorRoleBindingId:
      definition.predecessorDefinitionDigest === null
        ? null
        : definition.definitionId,
    roleKey: definition.roleKey,
    roleContent: {
      instructions: [...definition.instructions],
      constraints: definition.constraints,
      validFromLogicalMs: definition.validFromLogicalMs,
      validUntilLogicalMs: definition.validUntilLogicalMs,
    },
  }).roleContentDigest;
}

function activeDefinitionDigest(state: RoleRefinementStateV1): string {
  return state.status === "rolled_back" || state.status === "quarantined"
    ? state.request.predecessorDefinitionDigest
    : state.activation
      ? state.activation.refinedDefinitionDigest
      : state.request.predecessorDefinitionDigest;
}

function activeDefinitionId(state: RoleRefinementStateV1): string {
  return (
    state.publication?.definitionId ?? state.request.predecessorDefinitionId
  );
}

function sameRole(
  left: PortableAgentRoleBindingV1,
  right: PortableAgentRoleBindingV1,
): boolean {
  return (
    digestRoleRefinementJsonV1("role-binding", left as unknown as JsonValue) ===
    digestRoleRefinementJsonV1("role-binding", right as unknown as JsonValue)
  );
}

function assertSessionAlignment(
  session: PortableAgentSessionSnapshotV1,
  alignment: RoleAlignmentStateV1,
): void {
  if (
    session.sessionId !== alignment.sessionId ||
    session.tenantId !== alignment.tenantId ||
    session.agentId !== alignment.agentId ||
    session.objectiveId !== alignment.objectiveId ||
    session.role.roleBindingId !== alignment.roleAnchor.roleBindingId ||
    session.role.roleRevision !== alignment.roleAnchor.roleRevision
  )
    throw new TypeError("role_refinement_session_alignment_mismatch");
}

function assertDefinitionMatchesRole(
  definition: TrustedRoleDefinitionV1,
  role: PortableAgentRoleBindingV1,
  alignment: RoleAlignmentStateV1,
): void {
  if (
    definition.definitionId !== role.roleBindingId ||
    definition.definitionRevision !== role.roleRevision ||
    definition.roleKey !== role.roleKey ||
    expectedRoleContentDigest(definition, alignment) !==
      alignment.roleAnchor.roleContentDigest
  )
    throw new TypeError("role_refinement_predecessor_role_mismatch");
}

function validateOptions(options: CreateRoleRefinementPortableAgentV1): void {
  if (!options || typeof options !== "object")
    throw new TypeError("role_refinement_options_required");
  assertIdentifier(options.controllerId, "controllerId");
  assertSafeInteger(options.controllerVersion, "controllerVersion", 1);
  assertIdentifier(options.implementationId, "implementationId");
  const policy = createRoleRefinementPolicyRecordV1(options.policy).policy;
  createRoleRealignmentPolicyRecordV1(options.realignmentPolicy);
  createRoleAlignmentPolicyRecordV1(options.alignmentPolicy);
  if (
    !options.alignment ||
    typeof options.alignment.getState !== "function" ||
    typeof options.alignment.activateSessionRole !== "function" ||
    typeof options.alignment.restoreSessionRole !== "function" ||
    !options.runtime ||
    typeof options.runtime.getSession !== "function" ||
    typeof options.runtime.updateRole !== "function" ||
    typeof options.runtime.restoreRole !== "function" ||
    !Array.isArray(options.strategies) ||
    options.strategies.length === 0 ||
    options.strategies.length > policy.limits.maximumStrategies ||
    !Array.isArray(options.evaluators) ||
    options.evaluators.length < policy.minimumIndependentEvaluations ||
    options.evaluators.length > policy.limits.maximumEvaluators ||
    !options.semanticValidator ||
    typeof options.semanticValidator.validate !== "function" ||
    !options.monitor ||
    typeof options.monitor.observe !== "function" ||
    !options.trustEligibility ||
    typeof options.trustEligibility.evaluate !== "function" ||
    !options.drafts ||
    typeof options.drafts.stage !== "function" ||
    typeof options.drafts.resolve !== "function" ||
    !options.catalog ||
    typeof options.catalog.resolve !== "function" ||
    typeof options.catalog.publish !== "function" ||
    typeof options.catalog.quarantine !== "function" ||
    typeof options.catalog.isQuarantined !== "function" ||
    !options.certification ||
    typeof options.certification.certify !== "function"
  )
    throw new TypeError("role_refinement_port_invalid");
  const bindings = new Set<string>();
  for (const strategy of options.strategies) {
    validateBoundPort(
      strategy,
      "proposerId",
      "proposerVersion",
      "proposerBindingDigest",
      "propose",
      bindings,
    );
  }
  bindings.clear();
  for (const evaluator of options.evaluators) {
    validateBoundPort(
      evaluator,
      "evaluatorId",
      "evaluatorVersion",
      "evaluatorBindingDigest",
      "evaluate",
      bindings,
    );
  }
  validateBoundPort(
    options.semanticValidator,
    "validatorId",
    "validatorVersion",
    "validatorBindingDigest",
    "validate",
    new Set(),
  );
  validateBoundPort(
    options.monitor,
    "observerId",
    "observerVersion",
    "observerBindingDigest",
    "observe",
    new Set(),
  );
  for (const [label, value, maximum] of [
    [
      "requestTtlMs",
      options.requestTtlMs,
      policy.limits.maximumRequestLifetimeMs,
    ],
    [
      "evaluationTtlMs",
      options.evaluationTtlMs,
      policy.limits.maximumEvaluationLifetimeMs,
    ],
    [
      "semanticDecisionTtlMs",
      options.semanticDecisionTtlMs,
      policy.limits.maximumEvaluationLifetimeMs,
    ],
    [
      "certificationTtlMs",
      options.certificationTtlMs,
      policy.limits.maximumCertificateLifetimeMs,
    ],
    [
      "observationTtlMs",
      options.observationTtlMs,
      policy.limits.maximumMonitoringLifetimeMs,
    ],
    [
      "monitoringTtlMs",
      options.monitoringTtlMs,
      policy.limits.maximumMonitoringLifetimeMs,
    ],
  ] as const) {
    assertSafeInteger(value, label, 1);
    if (value > maximum) throw new TypeError(`${label}_exceeds_policy`);
  }
  assertSafeInteger(options.maximumStateBytes, "maximumStateBytes", 1);
}

function validateBoundPort(
  value: unknown,
  idKey: string,
  versionKey: string,
  digestKey: string,
  methodKey: string,
  bindings: Set<string>,
): void {
  if (!value || typeof value !== "object")
    throw new TypeError("role_refinement_bound_port_invalid");
  const port = value as Record<string, unknown>;
  assertIdentifier(port[idKey], idKey);
  assertSafeInteger(port[versionKey], versionKey, 1);
  assertDigest(port[digestKey], digestKey);
  if (
    typeof port[methodKey] !== "function" ||
    bindings.has(port[digestKey] as string)
  )
    throw new TypeError("role_refinement_bound_port_invalid");
  bindings.add(port[digestKey] as string);
}

function validateRunInput(input: RunRoleRefinementInputV1): void {
  if (!input || typeof input !== "object")
    throw new TypeError("role_refinement_run_input_required");
  for (const [label, value] of [
    ["sessionId", input.sessionId],
    ["requestId", input.requestId],
    ["selectionId", input.selectionId],
    ["publicationId", input.publicationId],
    ["activationId", input.activationId],
    ["rollbackId", input.rollbackId],
    ["predecessorCatalogId", input.predecessorCatalogId],
    ["predecessorDefinitionId", input.predecessorDefinitionId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(
    input.predecessorDefinitionRevision,
    "predecessorDefinitionRevision",
    1,
  );
  assertDigest(
    input.predecessorDefinitionDigest,
    "predecessorDefinitionDigest",
  );
  assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
}

function assertRunInputBoundToState(
  input: RunRoleRefinementInputV1,
  state: RoleRefinementStateV1,
): void {
  const request = state.request;
  if (
    input.requestId !== request.requestId ||
    input.selectionId !== request.selectionId ||
    input.publicationId !== request.publicationId ||
    input.activationId !== request.activationId ||
    input.rollbackId !== request.rollbackId ||
    input.sessionId !== state.activeSessionId ||
    input.predecessorCatalogId !== request.predecessorCatalogId ||
    input.predecessorDefinitionId !== request.predecessorDefinitionId ||
    input.predecessorDefinitionRevision !==
      request.predecessorDefinitionRevision ||
    input.predecessorDefinitionDigest !== request.predecessorDefinitionDigest ||
    input.authorityCeiling.ceilingDigest !==
      request.authorityCeiling.ceilingDigest
  )
    throw new TypeError("role_refinement_run_binding_mismatch");
}

function catalogKey(definition: TrustedRoleDefinitionV1): string {
  return `${definition.catalogId}\0${definition.definitionId}\0${definition.definitionRevision}`;
}

function freezeClone<T>(value: T): T {
  return deepFreeze(
    JSON.parse(JSON.stringify(value as unknown as JsonValue)) as T,
  );
}
