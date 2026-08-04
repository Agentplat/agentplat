import type { JsonObject, JsonValue } from "@agentplat/core";
import {
  createPlanFragmentProposalV1,
  validateAdaptiveRoleBindingV1,
  validateMissionIntentV1,
  validateMissionObservationV1,
  validatePlanFragmentV1,
  validatePlanViewV1,
  type MissionIntentV1,
  type MissionObservationV1,
  type PlanFragmentProposalV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";
import { validateWorkContractV1 } from "@agentplat/collective-control";
import type {
  PortableAgentAdapterRequirementsV1,
  PortableAgentObservationV1,
  PortableAgentSessionSnapshotV1,
  PortableAgentStepOutcomeV1,
} from "@agentplat/runtime/adapter";

import type {
  CollectivePeerAgentBindingV1,
  CollectivePeerCurrentnessDecisionV1,
  CollectivePeerExecuteInputV1,
  CollectivePeerExecuteOutcomeV1,
  CollectivePeerPlanDraftV1,
  CollectivePeerPlanInputV1,
  CollectivePeerPlanOutcomeV1,
  CollectivePeerRuntimeOptionsV1,
} from "./peer-contracts.js";
import { CollectivePeerRuntimeErrorV1 } from "./peer-errors.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const DEFAULT_MAXIMUM_CONTEXT_BYTES = 1_048_576;
const PLANNING_INSTRUCTIONS = Object.freeze([
  "Propose bounded work only from the supplied peer-local observations.",
  "Return proposal data; never claim assignment or action authority.",
]);

/**
 * Productive peer-local bridge from planning and current Mesh assignments to
 * portable agents. Agent outputs remain proposals until existing reducers and
 * authority gateways accept them.
 */
export class CollectivePeerRuntimeV1 {
  private readonly sessions: CollectivePeerRuntimeOptionsV1["sessions"];
  private readonly currentness: CollectivePeerRuntimeOptionsV1["currentness"];
  private readonly maximumPlanningContextBytes: number;
  private readonly maximumExecutionContextBytes: number;

  constructor(options: CollectivePeerRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      invalid("peer runtime options are required");
    if (
      !options.sessions ||
      typeof options.sessions.createSession !== "function" ||
      typeof options.sessions.getSession !== "function" ||
      typeof options.sessions.step !== "function" ||
      typeof options.sessions.close !== "function"
    ) {
      invalid("portable session runtime is required");
    }
    if (
      !options.currentness ||
      typeof options.currentness.check !== "function"
    ) {
      invalid("collective currentness port is required");
    }
    identifier(options.currentness.currentnessId, "currentnessId");
    identifier(
      options.currentness.implementationId,
      "currentness implementationId",
    );
    positiveInteger(
      options.currentness.currentnessVersion,
      "currentnessVersion",
    );
    this.sessions = options.sessions;
    this.currentness = options.currentness;
    this.maximumPlanningContextBytes = byteLimit(
      options.maximumPlanningContextBytes,
      "maximumPlanningContextBytes",
    );
    this.maximumExecutionContextBytes = byteLimit(
      options.maximumExecutionContextBytes,
      "maximumExecutionContextBytes",
    );
  }

  async plan(
    input: CollectivePeerPlanInputV1,
  ): Promise<CollectivePeerPlanOutcomeV1> {
    if (!input || typeof input !== "object")
      invalid("peer planning input is required");
    const intent = validateMissionIntentV1(input.missionIntent);
    const view = validatePlanViewV1(input.planView);
    const agent = normalizeAgentBinding(
      input.agent,
      ["structured"],
      ["structured"],
    );
    const tenantId = identifier(input.tenant?.tenantId, "tenant.tenantId");
    const stepId = identifier(input.stepId, "stepId");
    const logicalTimeMs = safeInteger(input.logicalTimeMs, "logicalTimeMs", 0);
    const validFrom = safeInteger(
      input.roleValidFromLogicalMs,
      "roleValidFromLogicalMs",
      0,
    );
    const validUntil = safeInteger(
      input.roleValidUntilLogicalMs,
      "roleValidUntilLogicalMs",
      1,
    );
    if (
      validUntil <= validFrom ||
      logicalTimeMs < validFrom ||
      logicalTimeMs >= validUntil
    ) {
      invalid("planning role validity does not contain the logical time");
    }
    assertPlanningScope(intent, view, agent, tenantId);
    const observations = normalizePlanningObservations(
      input.observations,
      intent,
      view,
    );
    const allowedInputReferenceDigests = sortedDigests(
      input.allowedInputReferenceDigests,
      "allowedInputReferenceDigests",
      true,
    );
    const context = planningContext(
      intent,
      view,
      observations,
      allowedInputReferenceDigests,
    );
    assertBytes(context, this.maximumPlanningContextBytes, "planning context");
    const session = await this.ensurePlanningSession({
      tenant: input.tenant,
      agent,
      intent,
      view,
      validFrom,
      validUntil,
    });
    const outcome = await this.sessions.step(
      agent.sessionId,
      {
        schemaVersion: 1,
        stepId,
        expectedSessionRevision: session.revision,
        interactionMode: "invoke",
        observations: observations.map(portablePlanningObservation),
        input: context,
        requestedOutputModalities: ["structured"],
        logicalTimeMs,
      },
      stepOptions(input),
    );
    if (outcome.record.result.status !== "completed") {
      return Object.freeze({
        status: mapPlanStatus(outcome.record.result.status),
        proposal: null,
        session: outcome.session,
        step: outcome.record,
        reasonCode: outcome.record.result.reasonCode ?? "agent_step_failed",
      });
    }
    const draft = parsePlanDraft(outcome);
    if (draft.disposition === "abstain") {
      return Object.freeze({
        status: "abstained",
        proposal: null,
        session: outcome.session,
        step: outcome.record,
        reasonCode: draft.reasonCode,
      });
    }
    const proposal = proposalFromDraft({
      draft,
      intent,
      view,
      observations,
      allowedInputReferenceDigests,
      logicalTimeMs,
    });
    return Object.freeze({
      status: "proposed",
      proposal,
      session: outcome.session,
      step: outcome.record,
      reasonCode: null,
    });
  }

  async execute(
    input: CollectivePeerExecuteInputV1,
  ): Promise<CollectivePeerExecuteOutcomeV1> {
    if (!input || typeof input !== "object")
      invalid("peer execution input is required");
    const workContract = validateWorkContractV1(input.assignment.workContract);
    const role = validateAdaptiveRoleBindingV1(input.assignment.roleBinding);
    const fragment = validatePlanFragmentV1(input.assignment.targetFragment);
    const tenantId = identifier(input.tenant?.tenantId, "tenant.tenantId");
    if (!Array.isArray(input.observations))
      invalid("execution observations must be an array");
    if (!Array.isArray(input.requestedOutputModalities)) {
      invalid("requestedOutputModalities must be an array");
    }
    const agent = normalizeAgentBinding(
      input.agent,
      ["structured", ...input.observations.map(({ modality }) => modality)],
      input.requestedOutputModalities,
    );
    const stepId = identifier(input.stepId, "stepId");
    const logicalTimeMs = safeInteger(input.logicalTimeMs, "logicalTimeMs", 0);
    assertExecutionBinding({
      workContract,
      role,
      fragment,
      tenantId,
      agent,
      logicalTimeMs,
    });
    const pre = await this.checkCurrentness(
      "pre_step",
      workContract,
      role,
      logicalTimeMs,
    );
    if (!pre.current) return withheld(workContract, pre.reasonCode);
    const context = executionContext(workContract, role, fragment, input.input);
    assertBytes(
      context,
      this.maximumExecutionContextBytes,
      "execution context",
    );
    const session = await this.ensureExecutionSession({
      tenant: input.tenant,
      agent,
      workContract,
      role,
      fragment,
    });
    const outcome = await this.sessions.step(
      agent.sessionId,
      {
        schemaVersion: 1,
        stepId,
        expectedSessionRevision: session.revision,
        interactionMode: "invoke",
        observations: input.observations,
        input: context,
        requestedOutputModalities: input.requestedOutputModalities,
        logicalTimeMs,
      },
      stepOptions(input),
    );
    if (outcome.record.result.status !== "completed") {
      return Object.freeze({
        status: mapExecutionStatus(outcome.record.result.status),
        workContract,
        session: null,
        step: null,
        reasonCode: outcome.record.result.reasonCode ?? "agent_step_failed",
      });
    }
    const post = await this.checkCurrentness(
      "post_step",
      workContract,
      role,
      logicalTimeMs,
    );
    if (!post.current) {
      try {
        await this.sessions.close(agent.sessionId);
      } catch {
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          "stale peer session could not be closed",
        );
      }
      return withheld(workContract, post.reasonCode);
    }
    return Object.freeze({
      status: "released",
      workContract,
      session: outcome.session,
      step: outcome.record,
      reasonCode: null,
    });
  }

  private async ensurePlanningSession(input: {
    tenant: CollectivePeerPlanInputV1["tenant"];
    agent: CollectivePeerAgentBindingV1;
    intent: MissionIntentV1;
    view: CollectivePeerPlanInputV1["planView"];
    validFrom: number;
    validUntil: number;
  }): Promise<PortableAgentSessionSnapshotV1> {
    const metadata = {
      collectivePeerKind: "planning",
      missionIntentDigest: input.intent.intentDigest,
      peerId: input.agent.peerId,
      peerInstanceId: input.agent.peerInstanceId,
    } as const;
    const existing = await this.sessions.getSession(input.agent.sessionId);
    if (existing) {
      assertSessionBinding(existing, {
        tenantId: input.tenant.tenantId,
        agent: input.agent,
        objectiveId: input.intent.objective.objectiveId,
        roleBindingId: input.agent.sessionId,
        roleKey: "collective.planner",
        roleInstructions: PLANNING_INSTRUCTIONS,
        roleConstraints: planningRoleConstraints(input.intent, input.view),
        validFromLogicalMs: input.validFrom,
        validUntilLogicalMs: input.validUntil,
        metadata,
      });
      return existing;
    }
    return this.sessions.createSession({
      sessionId: input.agent.sessionId,
      tenant: input.tenant,
      agentId: input.agent.agentId,
      adapterId: input.agent.adapterId,
      adapterVersion: input.agent.adapterVersion,
      requirements: input.agent.requirements,
      role: {
        schemaVersion: 1,
        roleBindingId: input.agent.sessionId,
        roleRevision: 1,
        predecessorRoleBindingId: null,
        objectiveId: input.intent.objective.objectiveId,
        roleKey: "collective.planner",
        instructions: PLANNING_INSTRUCTIONS,
        constraints: planningRoleConstraints(input.intent, input.view),
        validFromLogicalMs: input.validFrom,
        validUntilLogicalMs: input.validUntil,
      },
      metadata,
    });
  }

  private async ensureExecutionSession(input: {
    tenant: CollectivePeerExecuteInputV1["tenant"];
    agent: CollectivePeerAgentBindingV1;
    workContract: ReturnType<typeof validateWorkContractV1>;
    role: ReturnType<typeof validateAdaptiveRoleBindingV1>;
    fragment: ReturnType<typeof validatePlanFragmentV1>;
  }): Promise<PortableAgentSessionSnapshotV1> {
    const metadata = {
      collectivePeerKind: "execution",
      peerId: input.agent.peerId,
      peerInstanceId: input.agent.peerInstanceId,
      workContractDigest: input.workContract.workContractDigest,
      adaptiveRoleBindingDigest: input.role.roleBindingDigest,
      currentnessId: this.currentness.currentnessId,
      currentnessVersion: this.currentness.currentnessVersion,
      currentnessImplementationId: this.currentness.implementationId,
    } as const;
    const existing = await this.sessions.getSession(input.agent.sessionId);
    if (existing) {
      assertSessionBinding(existing, {
        tenantId: input.tenant.tenantId,
        agent: input.agent,
        objectiveId: input.workContract.objective.objectiveId,
        roleBindingId: input.role.roleBindingId,
        roleKey: input.role.roleKey,
        roleInstructions: input.workContract.completionCriteria,
        roleConstraints: executionRoleConstraints(
          input.workContract,
          input.role,
          input.fragment,
          this.currentness,
        ),
        validFromLogicalMs: input.workContract.createdAtLogicalMs,
        validUntilLogicalMs:
          input.workContract.assignment.leaseExpiresAtLogicalMs,
        metadata,
      });
      return existing;
    }
    return this.sessions.createSession({
      sessionId: input.agent.sessionId,
      tenant: input.tenant,
      agentId: input.agent.agentId,
      adapterId: input.agent.adapterId,
      adapterVersion: input.agent.adapterVersion,
      requirements: input.agent.requirements,
      role: {
        schemaVersion: 1,
        roleBindingId: input.role.roleBindingId,
        roleRevision: 1,
        predecessorRoleBindingId: null,
        objectiveId: input.workContract.objective.objectiveId,
        roleKey: input.role.roleKey,
        instructions: input.workContract.completionCriteria,
        constraints: executionRoleConstraints(
          input.workContract,
          input.role,
          input.fragment,
          this.currentness,
        ),
        validFromLogicalMs: input.workContract.createdAtLogicalMs,
        validUntilLogicalMs:
          input.workContract.assignment.leaseExpiresAtLogicalMs,
      },
      metadata,
    });
  }

  private async checkCurrentness(
    phase: "pre_step" | "post_step",
    workContract: ReturnType<typeof validateWorkContractV1>,
    role: ReturnType<typeof validateAdaptiveRoleBindingV1>,
    logicalTimeMs: number,
  ): Promise<CollectivePeerCurrentnessDecisionV1> {
    try {
      const decision = await this.currentness.check({
        schemaVersion: 1,
        phase,
        workContract,
        role,
        logicalTimeMs,
      });
      if (
        !decision ||
        typeof decision !== "object" ||
        Object.keys(decision).sort().join(",") !== "current,reasonCode" ||
        typeof decision.current !== "boolean" ||
        typeof decision.reasonCode !== "string" ||
        decision.reasonCode.length === 0 ||
        decision.reasonCode.length > 256 ||
        !IDENTIFIER.test(decision.reasonCode)
      ) {
        throw new Error("malformed currentness decision");
      }
      if (decision.current && decision.reasonCode !== "current") {
        throw new Error("current decision has invalid reason");
      }
      return Object.freeze({
        ...decision,
      }) as CollectivePeerCurrentnessDecisionV1;
    } catch {
      return Object.freeze({
        current: false as const,
        reasonCode: "currentness_unavailable",
      });
    }
  }
}

function normalizeAgentBinding(
  input: CollectivePeerAgentBindingV1,
  requiredInputs: readonly PortableAgentObservationV1["modality"][],
  requiredOutputs: readonly PortableAgentObservationV1["modality"][],
): CollectivePeerAgentBindingV1 {
  if (!input || typeof input !== "object")
    invalid("peer agent binding is required");
  const requirements = input.requirements;
  if (!requirements || typeof requirements !== "object")
    invalid("agent requirements are required");
  if (
    !Array.isArray(requirements.inputModalities) ||
    !Array.isArray(requirements.outputModalities) ||
    !Array.isArray(requirements.controlPoints)
  ) {
    invalid("agent requirement arrays are required");
  }
  const inputModalities = mergeDeclaredTokens(
    requirements.inputModalities,
    requiredInputs,
    "inputModalities",
  ) as PortableAgentAdapterRequirementsV1["inputModalities"];
  const outputModalities = mergeDeclaredTokens(
    requirements.outputModalities,
    requiredOutputs,
    "outputModalities",
  ) as PortableAgentAdapterRequirementsV1["outputModalities"];
  const controlPoints = mergeDeclaredTokens(
    requirements.controlPoints,
    [
      "pre_step",
      "post_output",
      ...(outputModalities.includes("action") ? ["pre_action"] : []),
    ],
    "controlPoints",
  ) as PortableAgentAdapterRequirementsV1["controlPoints"];
  return Object.freeze({
    sessionId: identifier(input.sessionId, "sessionId"),
    peerId: identifier(input.peerId, "peerId"),
    peerInstanceId: identifier(input.peerInstanceId, "peerInstanceId"),
    agentId: identifier(input.agentId, "agentId"),
    adapterId: identifier(input.adapterId, "adapterId"),
    adapterVersion: boundedText(input.adapterVersion, "adapterVersion", 128),
    requirements: Object.freeze({
      ...(requirements.agentKinds === undefined
        ? {}
        : { agentKinds: Object.freeze([...requirements.agentKinds]) }),
      inputModalities,
      outputModalities,
      interactionMode: "invoke",
      controlPoints,
      requireCancellation: true,
      ...(requirements.requireCheckpoint === undefined
        ? {}
        : { requireCheckpoint: requirements.requireCheckpoint }),
      ...(requirements.requireRestore === undefined
        ? {}
        : { requireRestore: requirements.requireRestore }),
    }),
  });
}

function assertPlanningScope(
  intent: MissionIntentV1,
  view: CollectivePeerPlanInputV1["planView"],
  agent: CollectivePeerAgentBindingV1,
  tenantId: string,
): void {
  if (
    intent.tenantId !== tenantId ||
    view.tenantId !== tenantId ||
    view.policyDomainId !== intent.policyDomainId ||
    view.missionIntentId !== intent.missionIntentId ||
    view.intentRevision !== intent.revision ||
    view.intentDigest !== intent.intentDigest ||
    view.selectionPolicyDigest !== intent.selectionPolicyDigest ||
    agent.peerId !== view.peerId ||
    agent.peerInstanceId !== view.peerInstanceId
  ) {
    invalid("planning intent and local view binding is invalid");
  }
}

function normalizePlanningObservations(
  input: readonly MissionObservationV1[],
  intent: MissionIntentV1,
  view: CollectivePeerPlanInputV1["planView"],
): readonly MissionObservationV1[] {
  if (!Array.isArray(input) || input.length > 4_096)
    invalid("planning observations are invalid");
  const values = input.map(validateMissionObservationV1);
  const ids = new Set<string>();
  for (const observation of values) {
    if (
      ids.has(observation.observationId) ||
      observation.missionIntentId !== intent.missionIntentId ||
      observation.intentRevision !== intent.revision ||
      observation.intentDigest !== intent.intentDigest ||
      observation.observerPeerId !== view.peerId ||
      observation.observerInstanceId !== view.peerInstanceId ||
      observation.logicalTimeMs > view.logicalTimeHighWaterMs
    ) {
      invalid("planning observation binding is invalid");
    }
    ids.add(observation.observationId);
  }
  return Object.freeze(values);
}

function planningContext(
  intent: MissionIntentV1,
  view: CollectivePeerPlanInputV1["planView"],
  observations: readonly MissionObservationV1[],
  allowedInputReferenceDigests: readonly PlanningDigestV1[],
): JsonObject {
  const shard = view.budgetShards.find(
    (item) =>
      item.peerId === view.peerId &&
      item.peerInstanceId === view.peerInstanceId,
  );
  return {
    protocol: "agentplat.collective-peer.planning.v1",
    missionIntent: intent as unknown as JsonObject,
    localPlanView: {
      planViewId: view.planViewId,
      revision: view.revision,
      stateDigest: view.stateDigest,
      selectedHeads: view.selectedHeads as unknown as JsonValue,
      causalFrontierDigests: view.causalFrontierDigests as unknown as JsonValue,
      unresolvedDependencyDigests:
        view.unresolvedDependencyDigests as unknown as JsonValue,
      budgetShard: (shard ?? null) as unknown as JsonValue,
      activeRoleBindings: view.activeRoleBindings as unknown as JsonValue,
    },
    availableObservationDigests: observations.map(
      ({ observationDigest }) => observationDigest,
    ),
    allowedInputReferenceDigests:
      allowedInputReferenceDigests as unknown as JsonValue,
    requiredResponse: {
      disposition: "abstain_or_propose",
      authority: "proposal_only",
      proposeFields: [
        "schemaVersion",
        "disposition",
        "proposalRevision",
        "semanticSlotKey",
        "predecessorFragmentDigest",
        "parentFragmentDigests",
        "dependencyFragmentDigests",
        "outcomeStatements",
        "roleKey",
        "requiredCapabilityKeys",
        "inputReferenceDigest",
        "basisObservationDigests",
        "requestedBudgetUnits",
        "workDeadline",
      ],
    },
  };
}

function portablePlanningObservation(
  observation: MissionObservationV1,
): PortableAgentObservationV1 {
  return Object.freeze({
    schemaVersion: 1,
    observationId: observation.observationId,
    sourceZone: "environment_untrusted",
    sourceId: observation.observerPeerId,
    modality: "structured",
    content:
      observation.publicValue === null
        ? { contentReferenceDigest: observation.contentReferenceDigest }
        : (observation.publicValue as JsonValue),
    contentReference: null,
    provenance: {
      missionObservationDigest: observation.observationDigest,
      visibility: observation.visibility,
      observationKind: observation.observationKind,
    },
    observedAtLogicalMs: observation.logicalTimeMs,
  });
}

function parsePlanDraft(
  outcome: PortableAgentStepOutcomeV1,
): CollectivePeerPlanDraftV1 {
  const output = outcome.record.result.outputs.find(
    (candidate) =>
      candidate.modality === "structured" && isRecord(candidate.content),
  );
  if (!output || !isRecord(output.content))
    agentOutputInvalid("structured plan draft is required");
  const value = output.content;
  if (value.disposition === "abstain") {
    exact(
      value,
      ["schemaVersion", "disposition", "reasonCode"],
      "planning abstention",
    );
    if (value.schemaVersion !== 1)
      agentOutputInvalid("planning draft schemaVersion is invalid");
    return Object.freeze({
      schemaVersion: 1,
      disposition: "abstain",
      reasonCode: boundedText(value.reasonCode, "planning reasonCode", 256),
    });
  }
  exact(
    value,
    [
      "schemaVersion",
      "disposition",
      "proposalRevision",
      "semanticSlotKey",
      "predecessorFragmentDigest",
      "parentFragmentDigests",
      "dependencyFragmentDigests",
      "outcomeStatements",
      "roleKey",
      "requiredCapabilityKeys",
      "inputReferenceDigest",
      "basisObservationDigests",
      "requestedBudgetUnits",
      "workDeadline",
    ],
    "planning proposal draft",
  );
  if (value.schemaVersion !== 1 || value.disposition !== "propose") {
    agentOutputInvalid("planning proposal disposition is invalid");
  }
  return Object.freeze({
    schemaVersion: 1,
    disposition: "propose",
    proposalRevision: positiveInteger(
      value.proposalRevision,
      "proposalRevision",
    ),
    semanticSlotKey: token(value.semanticSlotKey, "semanticSlotKey"),
    predecessorFragmentDigest:
      value.predecessorFragmentDigest === null
        ? null
        : digest(value.predecessorFragmentDigest, "predecessorFragmentDigest"),
    parentFragmentDigests: sortedDigests(
      value.parentFragmentDigests,
      "parentFragmentDigests",
      false,
    ),
    dependencyFragmentDigests: sortedDigests(
      value.dependencyFragmentDigests,
      "dependencyFragmentDigests",
      false,
    ),
    outcomeStatements: sortedTexts(
      value.outcomeStatements,
      "outcomeStatements",
    ),
    roleKey: token(value.roleKey, "roleKey"),
    requiredCapabilityKeys: sortedTokens(
      value.requiredCapabilityKeys,
      "requiredCapabilityKeys",
      true,
    ),
    inputReferenceDigest: digest(
      value.inputReferenceDigest,
      "inputReferenceDigest",
    ),
    basisObservationDigests: sortedDigests(
      value.basisObservationDigests,
      "basisObservationDigests",
      true,
    ),
    requestedBudgetUnits: positiveInteger(
      value.requestedBudgetUnits,
      "requestedBudgetUnits",
    ),
    workDeadline: timestamp(value.workDeadline, "workDeadline"),
  });
}

function proposalFromDraft(input: {
  draft: Extract<CollectivePeerPlanDraftV1, { disposition: "propose" }>;
  intent: MissionIntentV1;
  view: CollectivePeerPlanInputV1["planView"];
  observations: readonly MissionObservationV1[];
  allowedInputReferenceDigests: readonly PlanningDigestV1[];
  logicalTimeMs: number;
}): PlanFragmentProposalV1 {
  const observationDigests = new Set(
    input.observations.map(({ observationDigest }) => observationDigest),
  );
  const fragmentDigests = new Set(
    input.view.fragments.map(({ fragmentDigest }) => fragmentDigest),
  );
  if (
    input.draft.basisObservationDigests.some(
      (value) => !observationDigests.has(value),
    ) ||
    !input.allowedInputReferenceDigests.includes(
      input.draft.inputReferenceDigest,
    ) ||
    input.draft.requiredCapabilityKeys.some(
      (value) => !input.intent.permittedCapabilityKeys.includes(value),
    ) ||
    (input.draft.predecessorFragmentDigest !== null &&
      !fragmentDigests.has(input.draft.predecessorFragmentDigest)) ||
    [
      ...input.draft.parentFragmentDigests,
      ...input.draft.dependencyFragmentDigests,
    ].some((value) => !fragmentDigests.has(value))
  ) {
    agentOutputInvalid("planning draft cites data outside the local context");
  }
  try {
    return createPlanFragmentProposalV1({
      schemaVersion: 1,
      proposalRevision: input.draft.proposalRevision,
      missionIntentId: input.intent.missionIntentId,
      intentRevision: input.intent.revision,
      intentDigest: input.intent.intentDigest,
      proposerPeerId: input.view.peerId,
      proposerInstanceId: input.view.peerInstanceId,
      semanticSlotKey: input.draft.semanticSlotKey,
      predecessorFragmentDigest: input.draft.predecessorFragmentDigest,
      parentFragmentDigests: input.draft.parentFragmentDigests,
      dependencyFragmentDigests: input.draft.dependencyFragmentDigests,
      outcomeStatements: input.draft.outcomeStatements,
      roleKey: input.draft.roleKey,
      requiredCapabilityKeys: input.draft.requiredCapabilityKeys,
      inputReferenceDigest: input.draft.inputReferenceDigest,
      basisObservationDigests: input.draft.basisObservationDigests,
      requestedBudgetUnits: input.draft.requestedBudgetUnits,
      workDeadline: input.draft.workDeadline,
      proposedAtLogicalMs: input.logicalTimeMs,
    });
  } catch {
    agentOutputInvalid("planning draft violates the planning contract");
  }
}

function assertExecutionBinding(input: {
  workContract: ReturnType<typeof validateWorkContractV1>;
  role: ReturnType<typeof validateAdaptiveRoleBindingV1>;
  fragment: ReturnType<typeof validatePlanFragmentV1>;
  tenantId: string;
  agent: CollectivePeerAgentBindingV1;
  logicalTimeMs: number;
}): void {
  if (
    input.workContract.tenantId !== input.tenantId ||
    input.role.status !== "current" ||
    input.role.workContractId !== input.workContract.workContractId ||
    input.role.workContractDigest !== input.workContract.workContractDigest ||
    input.role.fragmentDigest !== input.fragment.fragmentDigest ||
    input.role.roleKey !== input.workContract.roleKey ||
    input.role.assignedPeerId !==
      input.workContract.assignment.assignedPeerId ||
    input.role.assignedInstanceId !==
      input.workContract.assignment.assignedInstanceId ||
    input.role.assignmentAuthorityId !==
      input.workContract.assignment.assignmentAuthorityId ||
    input.role.assignmentEpoch !==
      input.workContract.assignment.assignmentEpoch ||
    input.role.authorityGeneration !==
      input.workContract.assignment.authorityGeneration ||
    input.role.fencingToken !== input.workContract.assignment.fencingToken ||
    input.role.leaseExpiresAtLogicalMs !==
      input.workContract.assignment.leaseExpiresAtLogicalMs ||
    input.workContract.status !== "active" ||
    (input.fragment.status !== "assigned" &&
      input.fragment.status !== "executing") ||
    input.logicalTimeMs < input.workContract.createdAtLogicalMs ||
    input.logicalTimeMs >=
      input.workContract.assignment.leaseExpiresAtLogicalMs ||
    input.agent.peerId !== input.role.assignedPeerId ||
    input.agent.peerInstanceId !== input.role.assignedInstanceId
  ) {
    invalid("adaptive role and Work Contract binding is invalid");
  }
}

function executionContext(
  work: ReturnType<typeof validateWorkContractV1>,
  role: ReturnType<typeof validateAdaptiveRoleBindingV1>,
  fragment: ReturnType<typeof validatePlanFragmentV1>,
  input: JsonObject | null,
): JsonObject {
  return {
    protocol: "agentplat.collective-peer.execution.v1",
    authority: {
      kind: "work_contract",
      workContractId: work.workContractId,
      workContractDigest: work.workContractDigest,
      assignmentAuthorityId: role.assignmentAuthorityId,
      assignmentEpoch: role.assignmentEpoch,
      authorityGeneration: role.authorityGeneration,
      fencingToken: role.fencingToken,
      leaseExpiresAtLogicalMs: role.leaseExpiresAtLogicalMs,
    },
    task: {
      roleKey: work.roleKey,
      requiredCapabilityKeys:
        work.requiredCapabilityKeys as unknown as JsonValue,
      completionCriteria: work.completionCriteria as unknown as JsonValue,
      fragmentDigest: fragment.fragmentDigest,
      inputReferenceDigest: work.inputReferenceDigest,
    },
    input,
    resultAuthority: "candidate_only",
    actionAuthority: "proposal_only",
  };
}

function assertSessionBinding(
  session: PortableAgentSessionSnapshotV1,
  binding: {
    tenantId: string;
    agent: CollectivePeerAgentBindingV1;
    objectiveId: string;
    roleBindingId: string;
    roleKey: string;
    roleInstructions: readonly string[];
    roleConstraints: JsonObject;
    validFromLogicalMs: number;
    validUntilLogicalMs: number;
    metadata: Readonly<Record<string, JsonValue>>;
  },
): void {
  if (
    session.tenantId !== binding.tenantId ||
    session.agentId !== binding.agent.agentId ||
    session.objectiveId !== binding.objectiveId ||
    session.manifest.adapterId !== binding.agent.adapterId ||
    session.manifest.adapterVersion !== binding.agent.adapterVersion ||
    session.role.roleBindingId !== binding.roleBindingId ||
    session.role.roleKey !== binding.roleKey ||
    session.role.roleRevision !== 1 ||
    session.role.predecessorRoleBindingId !== null ||
    stableJson(session.role.instructions as unknown as JsonValue) !==
      stableJson(binding.roleInstructions as unknown as JsonValue) ||
    stableJson(session.role.constraints) !==
      stableJson(binding.roleConstraints) ||
    session.role.validFromLogicalMs !== binding.validFromLogicalMs ||
    session.role.validUntilLogicalMs !== binding.validUntilLogicalMs ||
    session.status !== "active" ||
    stableJson(session.metadata) !== stableJson(binding.metadata)
  ) {
    throw new CollectivePeerRuntimeErrorV1(
      "SESSION_BINDING_INVALID",
      `portable session "${session.sessionId}" is bound to different peer work`,
    );
  }
}

function planningRoleConstraints(
  intent: MissionIntentV1,
  view: CollectivePeerPlanInputV1["planView"],
): JsonObject {
  return {
    missionIntentDigest: intent.intentDigest,
    peerId: view.peerId,
    peerInstanceId: view.peerInstanceId,
  };
}

function executionRoleConstraints(
  work: ReturnType<typeof validateWorkContractV1>,
  role: ReturnType<typeof validateAdaptiveRoleBindingV1>,
  fragment: ReturnType<typeof validatePlanFragmentV1>,
  currentness: CollectivePeerRuntimeOptionsV1["currentness"],
): JsonObject {
  return {
    peerId: role.assignedPeerId,
    peerInstanceId: role.assignedInstanceId,
    missionIntentId: role.missionIntentId,
    missionIntentDigest: role.intentDigest,
    planViewDigest: role.planViewDigest,
    fragmentDigest: fragment.fragmentDigest,
    workContractId: work.workContractId,
    workContractDigest: work.workContractDigest,
    assignmentAuthorityId: role.assignmentAuthorityId,
    assignmentEpoch: role.assignmentEpoch,
    authorityGeneration: role.authorityGeneration,
    fencingToken: role.fencingToken,
    currentnessId: currentness.currentnessId,
    currentnessVersion: currentness.currentnessVersion,
    currentnessImplementationId: currentness.implementationId,
  };
}

function stepOptions(input: {
  tenant: CollectivePeerPlanInputV1["tenant"];
  signal?: AbortSignal;
  credentials?: Readonly<Record<string, string>>;
  metadata?: CollectivePeerPlanInputV1["metadata"];
}) {
  return {
    tenant: input.tenant,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.credentials === undefined
      ? {}
      : { credentials: input.credentials }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

function withheld(
  workContract: ReturnType<typeof validateWorkContractV1>,
  reasonCode: string,
): CollectivePeerExecuteOutcomeV1 {
  return Object.freeze({
    status: "withheld",
    workContract,
    session: null,
    step: null,
    reasonCode,
  });
}

function mapPlanStatus(status: "refused" | "paused" | "failed") {
  return status;
}

function mapExecutionStatus(status: "refused" | "paused" | "failed") {
  return status;
}

function sortedDigests(
  input: unknown,
  label: string,
  nonEmpty: boolean,
): readonly PlanningDigestV1[] {
  const values = sortedStrings(input, label, nonEmpty).map((value) =>
    digest(value, label),
  );
  return Object.freeze(values);
}

function sortedTokens(
  input: unknown,
  label: string,
  nonEmpty: boolean,
): readonly string[] {
  return Object.freeze(
    sortedStrings(input, label, nonEmpty).map((value) => token(value, label)),
  );
}

function mergeDeclaredTokens(
  declared: unknown,
  required: readonly string[],
  label: string,
): readonly string[] {
  const base = sortedTokens(declared, label, false);
  return Object.freeze([...new Set([...base, ...required])].sort(compareAscii));
}

function sortedTexts(input: unknown, label: string): readonly string[] {
  return Object.freeze(
    sortedStrings(input, label, true).map((value) =>
      boundedText(value, label, 8_192),
    ),
  );
}

function sortedStrings(
  input: unknown,
  label: string,
  nonEmpty: boolean,
): string[] {
  if (
    !Array.isArray(input) ||
    input.length > 4_096 ||
    (nonEmpty && input.length === 0) ||
    input.some((value) => typeof value !== "string")
  ) {
    agentOutputInvalid(`${label} must be a bounded string array`);
  }
  const result = [...(input as string[])].sort(compareAscii);
  if (new Set(result).size !== result.length)
    agentOutputInvalid(`${label} contains duplicates`);
  return result;
}

function exact(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, JsonValue> {
  if (!isRecord(value)) agentOutputInvalid(`${label} must be an object`);
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    agentOutputInvalid(`${label} fields are invalid`);
  }
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertBytes(value: JsonValue, maximum: number, label: string): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximum) {
    invalid(`${label} exceeds its byte limit`);
  }
}

function byteLimit(value: number | undefined, label: string): number {
  const normalized = value ?? DEFAULT_MAXIMUM_CONTEXT_BYTES;
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < 1_024 ||
    normalized > 16_777_216
  ) {
    invalid(`${label} must be from 1024 through 16777216`);
  }
  return normalized;
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !IDENTIFIER.test(value)
  ) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function token(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !IDENTIFIER.test(value)
  ) {
    agentOutputInvalid(`${label} is invalid`);
  }
  return value;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    value.includes("\u0000")
  ) {
    agentOutputInvalid(`${label} is invalid`);
  }
  return value;
}

function digest(value: unknown, label: string): PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    agentOutputInvalid(`${label} is invalid`);
  return value as PlanningDigestV1;
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    agentOutputInvalid(`${label} is invalid`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    invalid(`${label} is invalid`);
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    agentOutputInvalid(`${label} is invalid`);
  return value as number;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort(compareAscii)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key]!)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function invalid(message: string): never {
  throw new CollectivePeerRuntimeErrorV1("VALIDATION_ERROR", message);
}

function agentOutputInvalid(message: string): never {
  throw new CollectivePeerRuntimeErrorV1("AGENT_OUTPUT_INVALID", message);
}
