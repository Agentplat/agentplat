import type { JsonValue } from "@agentplat/core";
import {
  createAssessorEnsembleRequestV1,
  createAssessorEnsembleVerdictV1,
} from "./assessor-ensemble-validation.js";
import { digestInferenceInterventionV1 } from "./intervention-validation.js";
import type {
  InferenceInterventionAssessmentV1,
  InferenceInterventionOperationGateResultV1,
} from "./intervention-contracts.js";
import { sha256Hex } from "./sha256.js";
import {
  SEMANTIC_CONTROL_DIMENSIONS_V1,
  type SemanticAggregateAssessmentV1,
  type SemanticActionAuthorizationV1,
  type SemanticActionEffectReceiptV1,
  type SemanticActionEffectSinkV1,
  type SemanticAssessorAssessmentV1,
  type SemanticAssessorPortV1,
  type SemanticConstraintViolationV1,
  type SemanticControlDecisionV1,
  type SemanticControlDimensionV1,
  type SemanticControlDispositionV1,
  type SemanticControlEvaluationInputV1,
  type SemanticControlMonotonicAnchorV1,
  type SemanticControlRuntimeOptionsV1,
  type SemanticControlRuntimePortV1,
  type SemanticControlStateStoreV1,
  type SemanticControlStateV1,
  type SemanticMetricVectorV1,
} from "./semantic-alignment-contracts.js";
import {
  InMemorySemanticControlStateStoreV1,
  createSemanticControlStateV1,
  validateSemanticControlStateV1,
} from "./semantic-alignment-memory.js";
import {
  createSemanticAggregateAssessmentV1,
  createSemanticActionAuthorizationClaimsV1,
  digestSemanticControlV1,
  digestSemanticOperationPayloadV1,
  dimensionMetricKey,
  validateSemanticAssessorAssessmentV1,
  validateSemanticAssessorDescriptorV1,
  validateSemanticControlBindingV1,
  validateSemanticControlPolicyV1,
  validateSemanticControlRequestV1,
  validateSemanticActionAuthorizationV1,
  validateSemanticActionEffectReceiptV1,
} from "./semantic-alignment-validation.js";
import {
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from "./validation.js";

const requiredSemanticDimensions = [
  "role_coherence",
  "mission_alignment",
  "context_conflict",
  "uncertainty",
] as const;
const beneficialDimensions = new Set<SemanticControlDimensionV1>([
  "role_coherence",
  "mission_alignment",
  "course_action_diversity",
  "course_action_novelty",
]);
const encoder = new TextEncoder();

type AssessmentOutcome = {
  readonly assessment: SemanticAssessorAssessmentV1;
  readonly assessor: SemanticAssessorPortV1;
};

export class SemanticAlignmentAgilityRuntimeV1 implements SemanticControlRuntimePortV1 {
  readonly store: SemanticControlStateStoreV1;
  readonly anchor: SemanticControlMonotonicAnchorV1;
  readonly stateKey: string;
  readonly assessorSetDigest: string;

  constructor(readonly options: SemanticControlRuntimeOptionsV1) {
    validateSemanticControlBindingV1(options.binding);
    validateSemanticControlPolicyV1(options.policy);
    if (!options.assessors.length || options.assessors.length > options.policy.limits.maximumAssessors)
      throw new RangeError("semantic_assessor_count_invalid");
    const ids = new Set<string>();
    for (const assessor of options.assessors) {
      validateSemanticAssessorDescriptorV1(assessor.descriptor);
      if (ids.has(assessor.descriptor.assessorId)) throw new TypeError("semantic_assessor_id_duplicate");
      ids.add(assessor.descriptor.assessorId);
    }
    for (const id of options.policy.enforcingAssessorIds) {
      const descriptor = options.assessors.find((item) => item.descriptor.assessorId === id)?.descriptor;
      if (!descriptor) throw new TypeError("semantic_enforcing_assessor_missing");
      if (descriptor.basis === "reference_digest_heuristic")
        throw new TypeError("digest_heuristic_cannot_enforce_constraints");
    }
    for (const dimension of requiredSemanticDimensions) {
      const groups = new Set(
        options.assessors
          .filter((assessor) => assessor.descriptor.supportedDimensions.includes(dimension))
          .map((assessor) => assessor.descriptor.independenceGroup),
      );
      if (groups.size < options.policy.minimumGroupsPerDimension)
        throw new TypeError(`semantic_dimension_coverage_unavailable:${dimension}`);
    }
    if (options.ensemble) {
      assertDigest(options.ensemble.bindingDigest, "ensemble.bindingDigest");
      assertDigest(options.ensemble.policyDigest, "ensemble.policyDigest");
      if (typeof options.ensemble.verifyVerdict !== "function")
        throw new TypeError("semantic_ensemble_verifier_required");
    }
    if (options.intervention) {
      assertDigest(options.intervention.bindingDigest, "intervention.bindingDigest");
      assertDigest(options.intervention.policyDigest, "intervention.policyDigest");
      if (typeof options.intervention.verifyOperationGate !== "function")
        throw new TypeError("semantic_intervention_verifier_required");
    }
    if (options.actionAuthorization) {
      assertDigest(
        options.actionAuthorization.effectConsumerDigest,
        "actionAuthorization.effectConsumerDigest",
      );
      assertIdentifier(
        options.actionAuthorization.sinkId,
        "actionAuthorization.sinkId",
      );
      assertDigest(
        options.actionAuthorization.sinkKeyDigest,
        "actionAuthorization.sinkKeyDigest",
      );
      assertIdentifier(
        options.actionAuthorization.authority.issuerId,
        "actionAuthorization.issuerId",
      );
      assertDigest(
        options.actionAuthorization.authority.issuerKeyDigest,
        "actionAuthorization.issuerKeyDigest",
      );
      if (
        typeof options.actionAuthorization.authority.issue !== "function" ||
        typeof options.actionAuthorization.authority.lookupAndVerify !== "function"
      ) throw new TypeError("semantic_action_authorization_authority_invalid");
    }
    this.assessorSetDigest = digestSemanticControlV1(
      "assessor-set",
      {
        assessors: options.assessors
          .map((item) => item.descriptor.descriptorDigest)
          .sort(),
        ensemble: options.ensemble
          ? {
              bindingDigest: options.ensemble.bindingDigest,
              policyDigest: options.ensemble.policyDigest,
            }
          : null,
        intervention: options.intervention
          ? {
              bindingDigest: options.intervention.bindingDigest,
              policyDigest: options.intervention.policyDigest,
            }
          : null,
        actionAuthorization: options.actionAuthorization
          ? {
              effectConsumerDigest: options.actionAuthorization.effectConsumerDigest,
              sinkId: options.actionAuthorization.sinkId,
              sinkKeyDigest: options.actionAuthorization.sinkKeyDigest,
              issuerId: options.actionAuthorization.authority.issuerId,
              issuerKeyDigest: options.actionAuthorization.authority.issuerKeyDigest,
            }
          : null,
      } as unknown as JsonValue,
    );
    this.stateKey = `semantic-alignment:${options.binding.bindingId}`;
    this.store = options.store ?? new InMemorySemanticControlStateStoreV1();
    this.anchor =
      options.monotonicAnchor ??
      (this.store as unknown as SemanticControlMonotonicAnchorV1);
    if (typeof this.anchor.readAnchor !== "function")
      throw new TypeError("semantic_external_monotonic_anchor_required");
  }

  async getState(): Promise<SemanticControlStateV1 | null> {
    const state = await this.store.load(this.stateKey);
    if (state) await this.validateState(state);
    else if (await this.anchor.readAnchor(this.stateKey))
      throw new TypeError("semantic_state_missing_below_anchor");
    return state;
  }

  async preStep(input: SemanticControlEvaluationInputV1) {
    this.requireCheckpoint(input, "pre_step");
    return this.evaluate(input);
  }

  async postOutput(input: SemanticControlEvaluationInputV1) {
    this.requireCheckpoint(input, "post_output");
    return this.evaluate(input);
  }

  async preAction(input: SemanticControlEvaluationInputV1) {
    this.requireCheckpoint(input, "pre_action");
    return this.evaluate(input);
  }

  async runStep<T>(input: SemanticControlEvaluationInputV1, run: () => Promise<T> | T) {
    const decision = await this.preStep(input);
    return deepFreeze({ decision, value: decision.proceed ? await run() : null });
  }

  async releaseOutput<T>(input: SemanticControlEvaluationInputV1, release: () => Promise<T> | T) {
    const decision = await this.postOutput(input);
    return deepFreeze({ decision, value: decision.proceed ? await release() : null });
  }

  async authorizeAction(input: SemanticControlEvaluationInputV1) {
    const decision = await this.preAction(input);
    if (!decision.proceed)
      return deepFreeze({ decision, authorization: null });
    const boundary = this.options.actionAuthorization;
    if (!boundary)
      throw new TypeError("semantic_action_authorization_boundary_required");
    const request = validateSemanticControlRequestV1(input.request);
    if (request.actionPayloadDigest === null)
      throw new TypeError("semantic_action_payload_digest_required");
    const committed = await this.getState();
    if (
      !committed ||
      committed.revision < decision.committedStateRevision ||
      ![
        committed.lastDecision?.decisionDigest,
        ...committed.recentDecisions.map((item) => item.decisionDigest),
      ].includes(decision.decisionDigest)
    ) throw new TypeError("semantic_action_decision_not_committed");
    const maximumLogicalTimeMs =
      this.options.policy.limits.maximumLogicalTimeMs;
    const ttlMs = this.options.policy.limits.actionAuthorizationTtlMs;
    const validUntilLogicalTimeMs =
      ttlMs > maximumLogicalTimeMs - request.logicalTimeMs
        ? maximumLogicalTimeMs
        : request.logicalTimeMs + ttlMs;
    const claims = createSemanticActionAuthorizationClaimsV1({
      schemaVersion: 1 as const,
      authorizationId: request.requestId,
      requestDigest: request.requestDigest,
      decisionDigest: decision.decisionDigest,
      bindingDigest: request.bindingDigest,
      authorityDigest: request.authorityDigest,
      policyDigest: this.options.policy.policyDigest,
      assessorSetDigest: this.assessorSetDigest,
      effectConsumerDigest: boundary.effectConsumerDigest,
      sinkId: boundary.sinkId,
      sinkKeyDigest: boundary.sinkKeyDigest,
      targetDigest: request.targetDigest,
      materialDigest: request.materialDigest,
      actionPayloadDigest: request.actionPayloadDigest,
      sequence: request.sequence,
      committedStateRevision: decision.committedStateRevision,
      validFromLogicalTimeMs: request.logicalTimeMs,
      validUntilLogicalTimeMs,
    });
    const issued = validateSemanticActionAuthorizationV1(
      await boundary.authority.issue(claims),
      boundary.authority,
    );
    if (issued.claims.claimsDigest !== claims.claimsDigest)
      throw new TypeError("semantic_action_authorization_claims_mismatch");
    const authorization = await this.verifyActionAuthorization({
      authorizationId: claims.authorizationId,
      authorizationDigest: issued.authorizationDigest,
      expectedTargetDigest: claims.targetDigest,
      expectedActionPayloadDigest: claims.actionPayloadDigest,
      currentLogicalTimeMs: request.logicalTimeMs,
    });
    return deepFreeze({ decision, authorization });
  }

  async verifyActionAuthorization(input: {
    readonly authorizationId: string;
    readonly authorizationDigest?: string;
    readonly expectedTargetDigest: string;
    readonly expectedActionPayloadDigest: string;
    readonly currentLogicalTimeMs: number;
  }): Promise<SemanticActionAuthorizationV1> {
    const boundary = this.options.actionAuthorization;
    if (!boundary)
      throw new TypeError("semantic_action_authorization_boundary_required");
    assertIdentifier(input.authorizationId, "authorizationId");
    if (input.authorizationDigest !== undefined)
      assertDigest(input.authorizationDigest, "authorizationDigest");
    assertDigest(input.expectedTargetDigest, "expectedTargetDigest");
    assertDigest(input.expectedActionPayloadDigest, "expectedActionPayloadDigest");
    assertSafeInteger(input.currentLogicalTimeMs, "currentLogicalTimeMs");
    if (input.currentLogicalTimeMs > this.options.policy.limits.maximumLogicalTimeMs)
      throw new RangeError("semantic_action_authorization_logical_time_exceeded");
    const current = await this.getState();
    if (!current) throw new TypeError("semantic_action_authorization_state_missing");
    if (input.currentLogicalTimeMs < current.logicalTimeHighWaterMs)
      throw new RangeError("semantic_action_authorization_time_below_high_water");
    const verified = await boundary.authority.lookupAndVerify({
      authorizationId: input.authorizationId,
      ...(input.authorizationDigest === undefined
        ? {}
        : { authorizationDigest: input.authorizationDigest }),
      effectConsumerDigest: boundary.effectConsumerDigest,
      sinkId: boundary.sinkId,
      sinkKeyDigest: boundary.sinkKeyDigest,
      currentLogicalTimeMs: input.currentLogicalTimeMs,
      currentStateRevision: current.revision,
    });
    if (!verified)
      throw new TypeError("semantic_action_authorization_unverified");
    const authorization = validateSemanticActionAuthorizationV1(
      verified,
      boundary.authority,
    );
    const claims = authorization.claims;
    const retained = current.recentDecisions.find(
      (record) =>
        record.requestDigest === claims.requestDigest &&
        record.decisionDigest === claims.decisionDigest &&
        record.sequence === claims.sequence &&
        record.checkpoint === "pre_action" &&
        record.disposition === "allow",
    );
    if (
      claims.authorizationId !== input.authorizationId ||
      claims.bindingDigest !== this.options.binding.bindingDigest ||
      claims.authorityDigest !== this.options.binding.authorityDigest ||
      claims.policyDigest !== this.options.policy.policyDigest ||
      claims.assessorSetDigest !== this.assessorSetDigest ||
      claims.effectConsumerDigest !== boundary.effectConsumerDigest ||
      claims.sinkId !== boundary.sinkId ||
      claims.sinkKeyDigest !== boundary.sinkKeyDigest ||
      claims.targetDigest !== input.expectedTargetDigest ||
      claims.actionPayloadDigest !== input.expectedActionPayloadDigest ||
      claims.committedStateRevision > current.revision ||
      !retained ||
      input.currentLogicalTimeMs < claims.validFromLogicalTimeMs ||
      input.currentLogicalTimeMs > claims.validUntilLogicalTimeMs
    ) throw new TypeError("semantic_action_authorization_currentness_invalid");
    return authorization;
  }

  async dispatchAuthorizedAction(
    input: {
      readonly authorizationId: string;
      readonly authorizationDigest?: string;
      readonly expectedTargetDigest: string;
      readonly expectedActionPayloadDigest: string;
      readonly currentLogicalTimeMs: number;
    },
    sink: SemanticActionEffectSinkV1,
  ): Promise<{
    readonly authorization: SemanticActionAuthorizationV1;
    readonly effectReceipt: SemanticActionEffectReceiptV1;
  }> {
    if (!sink || typeof sink !== "object")
      throw new TypeError("semantic_action_effect_sink_invalid");
    assertIdentifier(sink.sinkId, "sink.sinkId");
    assertDigest(sink.sinkKeyDigest, "sink.sinkKeyDigest");
    assertDigest(sink.effectConsumerDigest, "sink.effectConsumerDigest");
    if (
      typeof sink.applyOnce !== "function" ||
      typeof sink.verifyReceipt !== "function"
    ) throw new TypeError("semantic_action_effect_sink_invalid");
    const boundary = this.options.actionAuthorization;
    if (!boundary)
      throw new TypeError("semantic_action_authorization_boundary_required");
    if (
      sink.effectConsumerDigest !== boundary.effectConsumerDigest ||
      sink.sinkId !== boundary.sinkId ||
      sink.sinkKeyDigest !== boundary.sinkKeyDigest
    ) throw new TypeError("semantic_action_effect_sink_binding_mismatch");
    const authorization = await this.verifyActionAuthorization(input);
    const effectReceipt = validateSemanticActionEffectReceiptV1(
      await sink.applyOnce({
        authorization,
        targetDigest: input.expectedTargetDigest,
        actionPayloadDigest: input.expectedActionPayloadDigest,
      }),
    );
    if (
      effectReceipt.authorizationDigest !== authorization.authorizationDigest ||
      effectReceipt.effectConsumerDigest !== boundary.effectConsumerDigest ||
      effectReceipt.sinkId !== boundary.sinkId ||
      effectReceipt.sinkKeyDigest !== boundary.sinkKeyDigest ||
      effectReceipt.committedAtLogicalTimeMs <
        authorization.claims.validFromLogicalTimeMs ||
      effectReceipt.committedAtLogicalTimeMs >
        authorization.claims.validUntilLogicalTimeMs ||
      effectReceipt.committedAtLogicalTimeMs > input.currentLogicalTimeMs ||
      !(await sink.verifyReceipt(effectReceipt))
    ) throw new TypeError("semantic_action_effect_receipt_unverified");
    return deepFreeze({ authorization, effectReceipt });
  }

  async dispatchAction(
    input: SemanticControlEvaluationInputV1,
    currentLogicalTimeMs: number,
    sink: SemanticActionEffectSinkV1,
  ) {
    assertSafeInteger(currentLogicalTimeMs, "currentLogicalTimeMs");
    if (currentLogicalTimeMs > this.options.policy.limits.maximumLogicalTimeMs)
      throw new RangeError("semantic_action_authorization_logical_time_exceeded");
    const authorized = await this.authorizeAction(input);
    if (!authorized.authorization)
      return deepFreeze({ ...authorized, effectReceipt: null });
    const request = validateSemanticControlRequestV1(input.request);
    const dispatched = await this.dispatchAuthorizedAction(
      {
        authorizationId: authorized.authorization.claims.authorizationId,
        authorizationDigest: authorized.authorization.authorizationDigest,
        expectedTargetDigest: request.targetDigest,
        expectedActionPayloadDigest: request.actionPayloadDigest!,
        currentLogicalTimeMs,
      },
      sink,
    );
    return deepFreeze({
      decision: authorized.decision,
      ...dispatched,
    });
  }

  async evaluate(raw: SemanticControlEvaluationInputV1): Promise<SemanticControlDecisionV1> {
    const request = validateSemanticControlRequestV1(raw.request);
    this.assertRequestBounds(request);
    this.assertPayloadBinding(request, raw.interventionPayload);
    const before = await this.loadOrInitial();
    const replay = before.lastDecision;
    if (replay?.requestDigest === request.requestDigest) return replay;
    this.assertForward(before, request.sequence, request.logicalTimeMs);
    this.assertHistory(before, request.priorCourseActionDigests);

    const outcomes = await Promise.all(this.options.assessors.map((assessor) => this.ask(assessor, request)));
    let aggregate = this.aggregate(request, outcomes.filter((item): item is AssessmentOutcome => item !== null));
    const reasons = new Set(aggregate.reasonCodes);
    let disposition = aggregate.disposition;
    let ensembleDecision: SemanticControlDecisionV1["ensembleDecision"] = null;
    let ensembleVerdictDigest: string | null = null;
    let interventionAllowed: boolean | null = null;
    let interventionAssessmentDigests: string[] = [];

    if (this.options.ensemble && disposition !== "block") {
      try {
        const ensembleInput = {
          invocationId: request.requestId,
          signalDigest: aggregate.assessmentDigest,
          executionDomain: request.checkpoint === "pre_action" ? "action" : "inference",
          surface: request.checkpoint === "pre_step" ? "input" : request.checkpoint === "post_output" ? "output" : "action",
          modalities: request.modalities,
          step: request.sequence,
          logicalTimeMs: request.logicalTimeMs,
        } as const;
        const ensemble = await this.options.ensemble.assess(ensembleInput);
        const expectedEnsembleRequest = createAssessorEnsembleRequestV1({
          schemaVersion: 1,
          bindingDigest: this.options.ensemble.bindingDigest,
          policyDigest: this.options.ensemble.policyDigest,
          ...ensembleInput,
        });
        const { verdictDigest, ...verdictBody } = ensemble.verdict;
        const verdict = createAssessorEnsembleVerdictV1(verdictBody);
        if (
          ensemble.verdict.schemaVersion !== 1 ||
          verdict.verdictDigest !== verdictDigest ||
          verdict.requestDigest !== expectedEnsembleRequest.requestDigest ||
          (verdict.decision === "allow" && !verdict.coverageComplete) ||
          !(await this.options.ensemble.verifyVerdict({
            requestDigest: expectedEnsembleRequest.requestDigest,
            verdictDigest: verdict.verdictDigest,
          }))
        ) throw new TypeError("semantic_ensemble_verdict_binding_invalid");
        ensembleDecision = verdict.decision;
        ensembleVerdictDigest = verdict.verdictDigest;
        if (ensembleDecision === "block") {
          disposition = "block";
          reasons.add("independent_ensemble_blocked");
        } else if (ensembleDecision === "modify") {
          disposition = disposition === "abstain" ? "abstain" : "steer";
          reasons.add("independent_ensemble_requested_modification");
        } else if (ensembleDecision === "unresolved") {
          disposition = "abstain";
          reasons.add("independent_ensemble_unresolved");
        }
      } catch {
        disposition = "block";
        reasons.add("independent_ensemble_unavailable");
      }
    }

    if (request.checkpoint === "pre_action" && disposition === "steer") {
      disposition = "block";
      reasons.add("pre_action_steering_requires_new_action");
    }
    if (request.checkpoint === "pre_action" && this.options.intervention && disposition === "allow") {
      try {
        const gate = await this.options.intervention.gateOperation({
          operationId: request.requestId,
          kind: "action",
          step: request.sequence,
          logicalTimeMs: request.logicalTimeMs,
          payload: raw.interventionPayload!,
        });
        await this.validateInterventionGate(request, raw.interventionPayload!, gate);
        interventionAllowed = gate.allowed;
        interventionAssessmentDigests = gate.assessments
          .map((item) => item.assessmentDigest)
          .sort();
        if (!gate.allowed) {
          disposition = "block";
          reasons.add("inference_intervention_gate_blocked");
        }
      } catch {
        disposition = "block";
        interventionAllowed = false;
        reasons.add("inference_intervention_gate_unavailable");
      }
    }

    const finalReasons = [...reasons].sort().slice(0, this.options.policy.limits.maximumReasonCodes);
    // The aggregate remains the semantic measurement. External gates are
    // separately bound into the final decision and cannot rewrite its metrics.
    aggregate = deepFreeze(aggregate);
    return this.commitDecision(before, request, aggregate, disposition, {
      ensembleDecision,
      ensembleVerdictDigest,
      interventionAllowed,
      interventionAssessmentDigests,
      reasons: finalReasons,
    });
  }

  private async ask(
    assessor: SemanticAssessorPortV1,
    request: import("./semantic-alignment-contracts.js").SemanticControlRequestV1,
  ): Promise<AssessmentOutcome | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("semantic_assessor_timeout")), this.options.policy.limits.assessorTimeoutMs);
      });
      const assessment = await Promise.race([Promise.resolve(assessor.assess(request)), timeout]);
      return {
        assessor,
        assessment: validateSemanticAssessorAssessmentV1(assessment, assessor.descriptor, request, this.options.policy),
      };
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private aggregate(
    request: import("./semantic-alignment-contracts.js").SemanticControlRequestV1,
    outcomes: readonly AssessmentOutcome[],
  ): SemanticAggregateAssessmentV1 {
    const groups = new Map<string, AssessmentOutcome[]>();
    for (const outcome of outcomes) {
      const values = groups.get(outcome.assessor.descriptor.independenceGroup) ?? [];
      values.push(outcome);
      groups.set(outcome.assessor.descriptor.independenceGroup, values);
    }
    const dimensionValues = new Map<SemanticControlDimensionV1, number[]>();
    for (const dimension of SEMANTIC_CONTROL_DIMENSIONS_V1) dimensionValues.set(dimension, []);
    for (const groupOutcomes of groups.values()) {
      for (const dimension of SEMANTIC_CONTROL_DIMENSIONS_V1) {
        const key = dimensionMetricKey(dimension);
        const values = groupOutcomes.map((item) => item.assessment.metrics[key]).filter((value): value is number => value !== null);
        if (!values.length) continue;
        const conservative = beneficialDimensions.has(dimension) ? Math.min(...values) : Math.max(...values);
        dimensionValues.get(dimension)?.push(conservative);
      }
    }
    const aggregateValue = (dimension: SemanticControlDimensionV1): number | null => {
      const values = [...(dimensionValues.get(dimension) ?? [])].sort((a, b) => a - b);
      if (!values.length) return null;
      if (dimension === "role_coherence" || dimension === "mission_alignment")
        return values[0] ?? null;
      if (dimension === "context_conflict" || dimension === "uncertainty")
        return values[values.length - 1] ?? null;
      const index = beneficialDimensions.has(dimension)
        ? Math.floor((values.length - 1) / 2)
        : Math.floor(values.length / 2);
      return values[index] ?? null;
    };
    const metrics: SemanticMetricVectorV1 = deepFreeze({
      roleCoherenceBps: aggregateValue("role_coherence"),
      missionAlignmentBps: aggregateValue("mission_alignment"),
      contextConflictBps: aggregateValue("context_conflict"),
      uncertaintyBps: aggregateValue("uncertainty"),
      courseActionDiversityBps: aggregateValue("course_action_diversity"),
      courseActionNoveltyBps: aggregateValue("course_action_novelty"),
    });
    const dimensionGroupCounts = deepFreeze(Object.fromEntries(
      SEMANTIC_CONTROL_DIMENSIONS_V1.map((dimension) => [dimension, dimensionValues.get(dimension)?.length ?? 0]),
    ) as Record<SemanticControlDimensionV1, number>);
    const enforcing = new Set(this.options.policy.enforcingAssessorIds);
    const hardConstraintViolations = [...new Set(
      outcomes
        .filter((item) => enforcing.has(item.assessor.descriptor.assessorId))
        .flatMap((item) => item.assessment.hardConstraintViolations),
    )].sort() as SemanticConstraintViolationV1[];
    const reasons = new Set<string>();
    let disposition: SemanticControlDispositionV1 = "allow";
    if (groups.size < this.options.policy.minimumIndependenceGroups) {
      disposition = "abstain";
      reasons.add("semantic_independence_quorum_unavailable");
    }
    if (requiredSemanticDimensions.some((dimension) => dimensionGroupCounts[dimension] < this.options.policy.minimumGroupsPerDimension)) {
      disposition = "abstain";
      reasons.add("semantic_dimension_coverage_incomplete");
    }
    if (
      request.checkpoint === "pre_step" &&
      request.candidateCourseActionDigests.length > 0 &&
      dimensionGroupCounts.course_action_diversity <
        this.options.policy.minimumGroupsPerDimension
    ) {
      disposition = "abstain";
      reasons.add("course_action_diversity_coverage_incomplete");
    }
    if (
      request.checkpoint === "pre_step" &&
      request.selectedCourseActionDigest !== null &&
      dimensionGroupCounts.course_action_novelty <
        this.options.policy.minimumGroupsPerDimension
    ) {
      disposition = "abstain";
      reasons.add("course_action_novelty_coverage_incomplete");
    }
    if (hardConstraintViolations.length) {
      disposition = "block";
      reasons.add("authoritative_hard_constraint_violation");
    }
    const t = this.options.policy.thresholds;
    if (metrics.roleCoherenceBps !== null && metrics.roleCoherenceBps < t.minimumRoleCoherenceBps) {
      disposition = "block";
      reasons.add("role_coherence_below_hard_minimum");
    }
    if (metrics.missionAlignmentBps !== null && metrics.missionAlignmentBps < t.minimumMissionAlignmentBps) {
      disposition = "block";
      reasons.add("mission_alignment_below_hard_minimum");
    }
    if (metrics.contextConflictBps !== null && metrics.contextConflictBps > t.maximumContextConflictBps) {
      disposition = request.checkpoint === "pre_action" ? "block" : disposition === "allow" ? "steer" : disposition;
      reasons.add("context_conflict_above_maximum");
    }
    if (metrics.uncertaintyBps !== null && metrics.uncertaintyBps > t.maximumUncertaintyBps) {
      disposition = request.checkpoint === "pre_action" ? "block" : disposition === "allow" ? "steer" : disposition;
      reasons.add("semantic_uncertainty_above_maximum");
    }
    if (request.checkpoint === "pre_step") {
      if (metrics.courseActionDiversityBps !== null && metrics.courseActionDiversityBps < t.minimumCourseActionDiversityBps) {
        if (disposition === "allow") disposition = "steer";
        reasons.add("course_action_diversity_below_exploration_floor");
      }
      if (metrics.courseActionNoveltyBps !== null && metrics.courseActionNoveltyBps < t.minimumCourseActionNoveltyBps) {
        if (disposition === "allow") disposition = "steer";
        reasons.add("course_action_novelty_below_exploration_floor");
      }
    }
    if (outcomes.some((item) => item.assessment.recommendation === "steer" || item.assessment.recommendation === "block")) {
      if (disposition === "allow") disposition = "steer";
      reasons.add("assessor_advisory_concern");
    }
    const evidenceDigests = [...new Set(outcomes.flatMap((item) => item.assessment.evidenceDigests))]
      .sort()
      .slice(0, this.options.policy.limits.maximumEvidenceDigests);
    return createSemanticAggregateAssessmentV1({
      schemaVersion: 1,
      requestDigest: request.requestDigest,
      disposition,
      metrics,
      hardConstraintViolations,
      countedAssessorIds: outcomes.map((item) => item.assessor.descriptor.assessorId).sort(),
      countedIndependenceGroups: [...groups.keys()].sort(),
      dimensionGroupCounts,
      missingAssessorIds: this.options.assessors
        .map((item) => item.descriptor.assessorId)
        .filter((id) => !outcomes.some((item) => item.assessor.descriptor.assessorId === id))
        .sort(),
      reasonCodes: [...reasons].sort().slice(0, this.options.policy.limits.maximumReasonCodes),
      evidenceDigests,
    });
  }

  private async commitDecision(
    initial: SemanticControlStateV1,
    request: import("./semantic-alignment-contracts.js").SemanticControlRequestV1,
    aggregate: SemanticAggregateAssessmentV1,
    disposition: SemanticControlDispositionV1,
    gates: {
      readonly ensembleDecision: SemanticControlDecisionV1["ensembleDecision"];
      readonly ensembleVerdictDigest: string | null;
      readonly interventionAllowed: boolean | null;
      readonly interventionAssessmentDigests: readonly string[];
      readonly reasons: readonly string[];
    },
  ): Promise<SemanticControlDecisionV1> {
    let prior = initial;
    for (let attempt = 0; attempt < this.options.policy.limits.maximumCommitAttempts; attempt++) {
      const existing = prior.lastDecision;
      if (existing?.requestDigest === request.requestDigest) return existing;
      this.assertForward(prior, request.sequence, request.logicalTimeMs);
      this.assertHistory(prior, request.priorCourseActionDigests);
      const proceed =
        disposition === "allow" ||
        (request.checkpoint === "pre_step" && disposition === "steer");
      const decisionBody = deepFreeze({
        schemaVersion: 1 as const,
        requestId: request.requestId,
        requestDigest: request.requestDigest,
        checkpoint: request.checkpoint,
        disposition,
        proceed,
        aggregate,
        ensembleDecision: gates.ensembleDecision,
        ensembleVerdictDigest: gates.ensembleVerdictDigest,
        interventionAllowed: gates.interventionAllowed,
        interventionAssessmentDigests: [...gates.interventionAssessmentDigests].sort(),
        reasonCodes: [...gates.reasons],
        priorStateRevision: prior.revision,
        committedStateRevision: prior.revision + 1,
      });
      const decision = deepFreeze({
        ...decisionBody,
        decisionDigest: digestSemanticControlV1("decision", decisionBody as unknown as JsonValue),
      });
      const courseActionHistory =
        request.checkpoint !== "pre_step" ||
        !proceed ||
        request.selectedCourseActionDigest === null
        ? prior.courseActionHistory
        : [...prior.courseActionHistory, request.selectedCourseActionDigest]
            .slice(-this.options.policy.limits.maximumCourseActionHistory);
      const record = deepFreeze({
        schemaVersion: 1 as const,
        requestDigest: request.requestDigest,
        checkpoint: request.checkpoint,
        sequence: request.sequence,
        disposition,
        aggregateAssessmentDigest: aggregate.assessmentDigest,
        decisionDigest: decision.decisionDigest,
      });
      const stateBody = deepFreeze({
        ...prior,
        revision: prior.revision + 1,
        sequenceHighWater: request.sequence,
        logicalTimeHighWaterMs: request.logicalTimeMs,
        courseActionHistory,
        recentDecisions: [...prior.recentDecisions, record].slice(-this.options.policy.limits.maximumRetainedDecisions),
        lastDecision: decision,
        predecessorStateDigest: prior.stateDigest,
      });
      const { stateDigest: _old, ...withoutDigest } = stateBody;
      const next = deepFreeze({
        ...withoutDigest,
        stateDigest: digestSemanticControlV1("state", withoutDigest as unknown as JsonValue),
      });
      if (await this.store.save({
        state: next,
        expectedRevision: prior.revision === 0 ? null : prior.revision,
        expectedStateDigest: prior.revision === 0 ? null : prior.stateDigest,
      })) {
        const committed = await this.store.load(this.stateKey);
        if (!committed)
          throw new TypeError("semantic_committed_state_missing");
        await this.validateState(committed);
        return decision;
      }
      prior = await this.loadOrInitial();
    }
    throw new Error("semantic_state_commit_exhausted");
  }

  private async loadOrInitial(): Promise<SemanticControlStateV1> {
    const loaded = await this.store.load(this.stateKey);
    if (loaded) {
      await this.validateState(loaded);
      return loaded;
    }
    if (await this.anchor.readAnchor(this.stateKey))
      throw new TypeError("semantic_state_missing_below_anchor");
    return createSemanticControlStateV1({
      stateKey: this.stateKey,
      bindingDigest: this.options.binding.bindingDigest,
      policyDigest: this.options.policy.policyDigest,
      assessorSetDigest: this.assessorSetDigest,
    });
  }

  private async validateState(state: SemanticControlStateV1): Promise<void> {
    validateSemanticControlStateV1(state, {
      stateKey: this.stateKey,
      bindingDigest: this.options.binding.bindingDigest,
      policyDigest: this.options.policy.policyDigest,
      assessorSetDigest: this.assessorSetDigest,
      policy: this.options.policy,
    });
    const anchor = await this.anchor.readAnchor(this.stateKey);
    if (
      state.revision > 0 &&
      (!anchor ||
        state.revision !== anchor.revision ||
        state.sequenceHighWater !== anchor.sequenceHighWater ||
        state.logicalTimeHighWaterMs !== anchor.logicalTimeHighWaterMs ||
        state.stateDigest !== anchor.stateDigest)
    )
      throw new TypeError("semantic_state_anchor_mismatch");
  }

  private assertRequestBounds(request: import("./semantic-alignment-contracts.js").SemanticControlRequestV1): void {
    if (
      request.bindingDigest !== this.options.binding.bindingDigest ||
      request.missionAnchorDigest !== this.options.binding.missionAnchorDigest ||
      request.roleAnchorDigest !== this.options.binding.roleAnchorDigest ||
      request.authorityDigest !== this.options.binding.authorityDigest
    ) throw new TypeError("semantic_request_binding_mismatch");
    const limits = this.options.policy.limits;
    if (request.sequence > limits.maximumSequence || request.logicalTimeMs > limits.maximumLogicalTimeMs)
      throw new RangeError("semantic_request_bound_exceeded");
    if (request.candidateCourseActionDigests.length > limits.maximumCourseActionCandidates || request.priorCourseActionDigests.length > limits.maximumCourseActionHistory)
      throw new RangeError("semantic_course_action_bound_exceeded");
  }

  private async validateInterventionGate(
    request: import("./semantic-alignment-contracts.js").SemanticControlRequestV1,
    payload: string,
    gate: InferenceInterventionOperationGateResultV1,
  ): Promise<void> {
    const port = this.options.intervention!;
    if (!gate || typeof gate.allowed !== "boolean" || !Array.isArray(gate.assessments))
      throw new TypeError("semantic_intervention_gate_shape_invalid");
    for (const assessment of gate.assessments)
      validateInterventionAssessmentRecord(assessment);
    const state = gate.state;
    if (!state || typeof state !== "object")
      throw new TypeError("semantic_intervention_state_missing");
    const { stateDigest, ...stateBody } = state;
    assertDigest(stateDigest, "intervention.stateDigest");
    if (
      stateDigest !== digestInferenceInterventionV1("state", stateBody) ||
      state.bindingDigest !== port.bindingDigest ||
      state.policyDigest !== port.policyDigest ||
      state.activeInvocation !== null ||
      state.unresolvedEffect !== null
    ) throw new TypeError("semantic_intervention_state_binding_invalid");
    const inputDigest = `sha256:${sha256Hex(encoder.encode(payload))}`;
    const invocationDigest = digestInferenceInterventionV1("invocation-action", {
      invocationId: request.requestId,
      executionDomain: "action",
      bindingDigest: port.bindingDigest,
      policyDigest: port.policyDigest,
      inputDigest,
      contextDigests: [],
      modalityManifestDigest: digestInferenceInterventionV1("modalities", []),
      roleReinforcementDigest: null,
      step: request.sequence,
      logicalTimeMs: request.logicalTimeMs,
    });
    const terminal = state.lastInvocation;
    if (
      !terminal ||
      terminal.invocationId !== request.requestId ||
      terminal.invocationDigest !== invocationDigest ||
      terminal.executionDomain !== "action" ||
      terminal.step !== request.sequence ||
      state.lastInvocationDigest !== invocationDigest ||
      state.stepHighWater !== request.sequence ||
      state.logicalTimeHighWaterMs !== request.logicalTimeMs ||
      (terminal.decision === "allowed") !== gate.allowed
    ) throw new TypeError("semantic_intervention_terminal_binding_invalid");
    if (!(await port.verifyOperationGate({
      operationId: request.requestId,
      step: request.sequence,
      logicalTimeMs: request.logicalTimeMs,
      payload,
      stateDigest,
      allowed: gate.allowed,
    }))) throw new TypeError("semantic_intervention_receipt_unverified");
  }

  private assertPayloadBinding(request: import("./semantic-alignment-contracts.js").SemanticControlRequestV1, payload: string | undefined): void {
    if (request.checkpoint !== "pre_action") {
      if (payload !== undefined) throw new TypeError("semantic_action_payload_outside_pre_action");
      return;
    }
    if (payload === undefined || request.actionPayloadDigest === null)
      throw new TypeError("semantic_action_payload_required");
    if (
      digestSemanticOperationPayloadV1(
        payload,
        this.options.policy.limits.maximumActionPayloadBytes,
      ) !== request.actionPayloadDigest
    )
      throw new TypeError("semantic_action_payload_digest_mismatch");
  }

  private assertForward(state: SemanticControlStateV1, sequence: number, logicalTimeMs: number): void {
    if (sequence <= state.sequenceHighWater || logicalTimeMs < state.logicalTimeHighWaterMs)
      throw new RangeError("semantic_request_replay_or_reorder_rejected");
  }

  private assertHistory(state: SemanticControlStateV1, supplied: readonly string[]): void {
    if (
      supplied.length !== state.courseActionHistory.length ||
      supplied.some((digest, index) => digest !== state.courseActionHistory[index])
    ) throw new TypeError("semantic_course_action_history_mismatch");
  }

  private requireCheckpoint(input: SemanticControlEvaluationInputV1, expected: import("./semantic-alignment-contracts.js").SemanticControlCheckpointV1): void {
    if (input.request.checkpoint !== expected) throw new TypeError(`semantic_checkpoint_mismatch:${expected}`);
  }
}

function validateInterventionAssessmentRecord(
  value: InferenceInterventionAssessmentV1,
): void {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    typeof value.assessorId !== "string" ||
    value.assessorId.length === 0 ||
    !Number.isSafeInteger(value.assessorVersion) ||
    value.assessorVersion < 1 ||
    !["allow", "modify", "block", "unavailable"].includes(value.decision) ||
    [value.riskBps, value.uncertaintyBps, value.roleCoherenceBps].some(
      (item) => !Number.isSafeInteger(item) || item < 0 || item > 10_000,
    ) ||
    !Array.isArray(value.reasonCodes) ||
    value.reasonCodes.length > 32 ||
    value.reasonCodes.some(
      (item) =>
        typeof item !== "string" ||
        item.length === 0 ||
        encoder.encode(item).byteLength > 256,
    ) ||
    !Array.isArray(value.evidenceDigests) ||
    value.evidenceDigests.length > 32
  ) throw new TypeError("semantic_intervention_assessment_invalid");
  assertDigest(value.assessorImplementationDigest, "assessorImplementationDigest");
  for (const digest of value.evidenceDigests)
    assertDigest(digest, "intervention.evidenceDigest");
  const { assessmentDigest, ...body } = value;
  assertDigest(assessmentDigest, "assessmentDigest");
  if (assessmentDigest !== digestInferenceInterventionV1("assessment", body))
    throw new TypeError("semantic_intervention_assessment_digest_invalid");
}
