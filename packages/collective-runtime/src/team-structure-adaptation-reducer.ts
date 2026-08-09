import type {
  TeamStructureAdaptationDecisionV1,
  TeamStructureAdaptationStateV1,
  TeamStructureDecisionReductionInputV1,
  TeamStructureObservationReductionInputV1,
  TeamStructureTemplateArmV1,
} from "./team-structure-adaptation-contracts.js";
import {
  createTeamStructureAdaptationDecisionV1,
  createTeamStructureAdaptationStateV1,
  validateTeamStructureAdaptationRequestV1,
  validateTeamStructureObservationV1,
} from "./team-structure-adaptation-validation.js";

/** Applies only the finite outcome category. No external score or reward enters this transition. */
export function recordTeamStructureObservationV1(
  input: TeamStructureObservationReductionInputV1,
): TeamStructureAdaptationStateV1 {
  const observation = validateTeamStructureObservationV1(input.observation);
  const { state, catalog, policy } = input;
  const template = catalog.templates.find(
    (item) => item.templateId === observation.templateId,
  );
  if (!template || template.templateDigest !== observation.templateDigest)
    throw new TypeError("team structure observation template is not approved");
  const decision = state.decisions.find(
    (item) => item.adaptationEpoch === observation.adaptationEpoch,
  );
  if (
    !decision ||
    decision.decisionDigest !== observation.decisionDigest ||
    decision.selectedTemplateId !== observation.templateId ||
    decision.selectedTemplateDigest !== observation.templateDigest
  )
    throw new TypeError(
      "team structure observation is not bound to a stored decision",
    );
  const outcomeCount = safeAdd(
    safeAdd(
      observation.completedPositionCount,
      observation.failedPositionCount,
      "observation outcome count",
    ),
    observation.unsafePositionCount,
    "observation outcome count",
  );
  if (outcomeCount > template.positions.length)
    throw new TypeError(
      "team structure observation exceeds template positions",
    );
  if (
    observation.outcome === "completed" &&
    observation.completedPositionCount !== template.positions.length
  )
    throw new TypeError("completed observation does not cover the template");
  if (
    observation.outcome === "incomplete" &&
    outcomeCount >= template.positions.length
  )
    throw new TypeError("incomplete observation covers the full template");
  const sameId = state.observationHeads.find(
    (head) => head.observationId === observation.observationId,
  );
  if (sameId) {
    if (sameId.observationDigest === observation.observationDigest)
      return state;
    throw new TypeError(
      "team structure observation ID conflicts with stored evidence",
    );
  }
  const sameExecution = state.observationHeads.find(
    (head) =>
      head.executionId === observation.executionId &&
      head.executionEpoch === observation.executionEpoch,
  );
  if (sameExecution) {
    if (sameExecution.observationDigest === observation.observationDigest)
      return state;
    throw new TypeError(
      "team structure observation execution conflicts with stored evidence",
    );
  }
  if (observation.observedAtLogicalMs < state.logicalTimeHighWaterMs)
    throw new TypeError("team structure observation logical time regressed");
  if (
    state.observationDigests.length >= policy.policy.limits.maximumObservations
  )
    throw new TypeError("team structure observation history is full");
  const arms = state.arms.map((arm) =>
    arm.templateId === template.templateId
      ? learn(
          arm,
          observation.outcome,
          Math.max(state.adaptationEpochHighWater, observation.adaptationEpoch),
          policy.policy,
        )
      : arm,
  );
  return createTeamStructureAdaptationStateV1({
    stateKey: state.stateKey,
    adaptationId: state.adaptationId,
    adaptationVersion: state.adaptationVersion,
    implementationId: state.implementationId,
    catalog,
    policy,
    revision: increment(state.revision, "adaptation state revision"),
    logicalTimeHighWaterMs: observation.observedAtLogicalMs,
    arms,
    observationDigests: [
      ...state.observationDigests,
      observation.observationDigest,
    ],
    observationHeads: [
      ...state.observationHeads,
      {
        schemaVersion: 1,
        observationId: observation.observationId,
        executionId: observation.executionId,
        executionEpoch: observation.executionEpoch,
        adaptationEpoch: observation.adaptationEpoch,
        decisionDigest: observation.decisionDigest,
        teamEpoch: observation.teamEpoch,
        observationDigest: observation.observationDigest,
      },
    ],
    decisions: state.decisions,
    lastDecision: state.lastDecision,
    predecessorStateDigest: state.stateDigest,
  });
}

export function decideTeamStructureV1(
  input: TeamStructureDecisionReductionInputV1,
): {
  readonly state: TeamStructureAdaptationStateV1;
  readonly decision: TeamStructureAdaptationDecisionV1;
} {
  const request = validateTeamStructureAdaptationRequestV1(input.request);
  const { state, catalog, policy } = input;
  const replay = state.decisions.find(
    (decision) => decision.requestDigest === request.requestDigest,
  );
  if (replay) return { state, decision: replay };
  if (
    state.decisions.some((decision) => decision.requestId === request.requestId)
  )
    throw new TypeError(
      "team structure request ID conflicts with decision history",
    );
  if (
    state.decisions.some(
      (decision) => decision.adaptationEpoch === request.nextAdaptationEpoch,
    )
  )
    throw new TypeError(
      "team structure target epoch conflicts with decision history",
    );
  if (request.logicalTimeMs < state.logicalTimeHighWaterMs)
    throw new TypeError("team structure decision logical time regressed");
  if (
    request.validUntilLogicalMs - request.logicalTimeMs >
    policy.policy.limits.maximumDecisionTtlMs
  )
    throw new TypeError("team structure decision exceeds policy TTL");
  if (request.currentAdaptationEpoch !== state.adaptationEpochHighWater)
    throw new TypeError(
      "team structure request epoch does not match state high-water",
    );
  if (state.decisions.length >= policy.policy.limits.maximumDecisions)
    throw new TypeError("team structure decision history is full");
  const eligible = request.eligibleTemplateIds
    .map((templateId) => {
      const template = catalog.templates.find(
        (item) => item.templateId === templateId,
      );
      const arm = state.arms.find((item) => item.templateId === templateId);
      if (!template || !arm || template.templateDigest !== arm.templateDigest)
        throw new TypeError(
          "team structure request contains an unapproved template",
        );
      if (arm.quarantinedUntilEpoch >= request.nextAdaptationEpoch) return null;
      return { template, arm };
    })
    .filter(
      (
        item,
      ): item is {
        readonly template: (typeof catalog.templates)[number];
        readonly arm: TeamStructureTemplateArmV1;
      } => item !== null,
    );
  if (!eligible.length)
    throw new TypeError("no eligible team structure template remains");

  const selected = choose({
    state,
    catalog,
    policy: policy.policy,
    request,
    eligible,
  });
  const decision = createTeamStructureAdaptationDecisionV1({
    schemaVersion: 1,
    decisionId: `team-structure-decision.${request.requestDigest.slice(7)}`,
    requestId: request.requestId,
    requestDigest: request.requestDigest,
    selectedTemplateId: selected.template.templateId,
    selectedTemplateDigest: selected.template.templateDigest,
    selectionMode: selected.mode,
    adaptationEpoch: request.nextAdaptationEpoch,
    advisoryOnly: true,
    evaluatedAtLogicalMs: request.logicalTimeMs,
    expiresAtLogicalMs: request.validUntilLogicalMs,
    priorStateRevision: state.revision,
    committedStateRevision: increment(
      state.revision,
      "adaptation state revision",
    ),
  });
  const arms = state.arms.map((arm) =>
    arm.templateId === selected.template.templateId
      ? {
          ...arm,
          selectionCount: increment(arm.selectionCount, "arm selection count"),
        }
      : arm,
  );
  const next = createTeamStructureAdaptationStateV1({
    stateKey: state.stateKey,
    adaptationId: state.adaptationId,
    adaptationVersion: state.adaptationVersion,
    implementationId: state.implementationId,
    catalog,
    policy,
    revision: increment(state.revision, "adaptation state revision"),
    logicalTimeHighWaterMs: request.logicalTimeMs,
    arms,
    observationDigests: state.observationDigests,
    observationHeads: state.observationHeads,
    decisions: [...state.decisions, decision],
    lastDecision: decision,
    predecessorStateDigest: state.stateDigest,
  });
  return { state: next, decision };
}

function learn(
  arm: TeamStructureTemplateArmV1,
  outcome: "completed" | "failed" | "unsafe" | "incomplete",
  adaptationEpoch: number,
  policy: TeamStructureObservationReductionInputV1["policy"]["policy"],
): TeamStructureTemplateArmV1 {
  const direction =
    outcome === "completed" ? 1n : outcome === "incomplete" ? 0n : -1n;
  const unsafe = outcome === "unsafe" ? 1 : 0;
  return {
    ...arm,
    weightMicros: clampBigInt(
      BigInt(arm.weightMicros) + direction * BigInt(policy.learningStepMicros),
      policy.minimumWeightMicros,
      policy.maximumWeightMicros,
    ),
    observationCount: increment(arm.observationCount, "arm observation count"),
    completedCount:
      outcome === "completed"
        ? increment(arm.completedCount, "arm completion count")
        : arm.completedCount,
    failedCount:
      outcome === "failed"
        ? increment(arm.failedCount, "arm failure count")
        : arm.failedCount,
    unsafeCount: unsafe
      ? increment(arm.unsafeCount, "arm unsafe count")
      : arm.unsafeCount,
    quarantinedUntilEpoch: unsafe
      ? Math.max(
          arm.quarantinedUntilEpoch,
          safeAdd(
            adaptationEpoch,
            policy.quarantineEpochs,
            "arm quarantine epoch",
          ),
        )
      : arm.quarantinedUntilEpoch,
  };
}

function choose(input: {
  readonly state: TeamStructureAdaptationStateV1;
  readonly catalog: TeamStructureDecisionReductionInputV1["catalog"];
  readonly policy: TeamStructureDecisionReductionInputV1["policy"]["policy"];
  readonly request: TeamStructureDecisionReductionInputV1["request"];
  readonly eligible: readonly {
    readonly template: TeamStructureDecisionReductionInputV1["catalog"]["templates"][number];
    readonly arm: TeamStructureTemplateArmV1;
  }[];
}): {
  readonly template: TeamStructureDecisionReductionInputV1["catalog"]["templates"][number];
  readonly mode: TeamStructureAdaptationDecisionV1["selectionMode"];
} {
  const { state, catalog, policy, request, eligible } = input;
  const baseline = eligible.find(
    (item) => item.template.templateId === catalog.baselineTemplateId,
  );
  const totalWeight = eligible.reduce(
    (sum, item) => sum + BigInt(item.arm.weightMicros),
    0n,
  );
  if (
    baseline &&
    BigInt(baseline.arm.weightMicros) * 10_000n <
      totalWeight * BigInt(policy.baselineProbabilityFloorBps)
  )
    return { template: baseline.template, mode: "baseline_floor" };

  if (request.explorationDrawBps < policy.explorationCapBps)
    return {
      template: exploratory(
        eligible,
        state.revision,
        request.nextAdaptationEpoch,
      ),
      mode: "explore",
    };

  const mature = eligible.filter(
    (item) => item.arm.observationCount >= policy.minimumObservationCount,
  );
  const matureAlternative = mature.some(
    (item) => item.template.templateId !== catalog.baselineTemplateId,
  );
  if (baseline && !matureAlternative)
    return { template: baseline.template, mode: "baseline" };
  if (!mature.length) {
    const fallback = [...eligible].sort(compareArms)[0]!;
    return { template: fallback.template, mode: "safe_fallback" };
  }

  const previous =
    state.lastDecision &&
    mature.find(
      (item) =>
        item.template.templateId === state.lastDecision?.selectedTemplateId,
    );
  if (
    previous &&
    request.nextAdaptationEpoch <=
      safeAdd(
        state.lastDecision!.adaptationEpoch,
        policy.cooldownEpochs,
        "decision cooldown epoch",
      )
  )
    return { template: previous.template, mode: "cooldown" };

  const best = [...mature].sort(compareArms)[0]!;
  if (
    previous &&
    BigInt(best.arm.weightMicros) - BigInt(previous.arm.weightMicros) <
      BigInt(policy.hysteresisMicros)
  )
    return { template: previous.template, mode: "hysteresis" };
  return { template: best.template, mode: "exploit" };
}

function exploratory(
  eligible: readonly {
    readonly template: TeamStructureDecisionReductionInputV1["catalog"]["templates"][number];
    readonly arm: TeamStructureTemplateArmV1;
  }[],
  revision: number,
  nextAdaptationEpoch: number,
): TeamStructureDecisionReductionInputV1["catalog"]["templates"][number] {
  const sorted = [...eligible].sort((left, right) =>
    left.template.templateId.localeCompare(right.template.templateId),
  );
  const ordinal = Number(
    (BigInt(revision) + BigInt(nextAdaptationEpoch)) % BigInt(sorted.length),
  );
  return sorted[ordinal]!.template;
}

function compareArms(
  left: {
    readonly template: TeamStructureDecisionReductionInputV1["catalog"]["templates"][number];
    readonly arm: TeamStructureTemplateArmV1;
  },
  right: {
    readonly template: TeamStructureDecisionReductionInputV1["catalog"]["templates"][number];
    readonly arm: TeamStructureTemplateArmV1;
  },
): number {
  return left.arm.weightMicros === right.arm.weightMicros
    ? left.template.templateId.localeCompare(right.template.templateId)
    : left.arm.weightMicros > right.arm.weightMicros
      ? -1
      : 1;
}

function clampBigInt(value: bigint, minimum: number, maximum: number): number {
  const bounded =
    value < BigInt(minimum)
      ? BigInt(minimum)
      : value > BigInt(maximum)
        ? BigInt(maximum)
        : value;
  return Number(bounded);
}

function safeAdd(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${label} exceeds safe integer range`);
  return value;
}

function increment(value: number, label: string): number {
  return safeAdd(value, 1, label);
}
