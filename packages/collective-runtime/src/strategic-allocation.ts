import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

export interface StrategicAllocationTaskV1 {
  readonly taskId: string;
  readonly taskDigest: PlanningDigestV1;
  readonly requiredCapabilityKeys: readonly string[];
  readonly requiredIndependenceGroupId: string | null;
  readonly budgetCeilingUnits: number;
  readonly collateralFloorUnits: number;
  readonly dependsOnTaskIds: readonly string[];
}

export interface StrategicCapabilityAttestationV1 {
  readonly attestationId: string;
  readonly peerId: string;
  readonly capabilityKeys: readonly string[];
  readonly capabilityConfidenceBasisPoints: number;
  readonly resourceCeilingUnits: number;
  readonly issuerId: string;
  readonly issuerKeyDigest: PlanningDigestV1;
  readonly validFromLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly attestationDigest: PlanningDigestV1;
}

export interface StrategicBidCommitmentV1 {
  readonly schemaVersion: 1;
  readonly commitmentId: string;
  readonly allocationId: string;
  readonly taskId: string;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly independenceGroupId: string;
  readonly sealedBidDigest: PlanningDigestV1;
  readonly committedAtLogicalMs: number;
  readonly commitmentDigest: PlanningDigestV1;
}

export interface StrategicBidRevealV1 {
  readonly schemaVersion: 1;
  readonly revealId: string;
  readonly commitmentId: string;
  readonly allocationId: string;
  readonly taskId: string;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly independenceGroupId: string;
  readonly declaredUtilityMicros: number;
  readonly declaredCostUnits: number;
  readonly declaredResourceUnits: number;
  readonly requestedBudgetUnits: number;
  readonly collateralUnits: number;
  readonly availabilityUntilLogicalMs: number;
  readonly capabilityAttestationDigest: PlanningDigestV1;
  readonly nonceDigest: PlanningDigestV1;
  readonly revealedAtLogicalMs: number;
  readonly revealDigest: PlanningDigestV1;
}

export interface StrategicPeerProjectionV1 {
  readonly peerId: string;
  readonly scopeDigest: string;
  readonly credibilityStateDigest: PlanningDigestV1;
  readonly credibilityScoreBasisPoints: number;
  readonly credibilityUncertaintyBasisPoints: number;
  readonly collusionPressureBasisPoints: number;
  readonly status: "eligible" | "restricted" | "quarantined" | "unknown";
}

export interface StrategicAllocationCandidateV1 {
  readonly commitment: StrategicBidCommitmentV1;
  readonly reveal: StrategicBidRevealV1;
  readonly attestation: StrategicCapabilityAttestationV1;
  readonly peer: StrategicPeerProjectionV1;
}

export interface StrategicAllocationPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly maximumTasksPerPeer: number;
  readonly maximumTasksPerIndependenceGroup: number;
  readonly maximumTotalBudgetUnits: number;
  readonly maximumTotalResourceUnits: number;
  readonly maximumCollusionPressureBasisPoints: number;
  readonly maximumCredibilityUncertaintyBasisPoints: number;
  readonly minimumCapabilityConfidenceBasisPoints: number;
  readonly utilityWeightBasisPoints: number;
  readonly costWeightBasisPoints: number;
  readonly credibilityWeightBasisPoints: number;
  readonly capabilityWeightBasisPoints: number;
  readonly collusionPenaltyWeightBasisPoints: number;
  readonly falseCommitmentPenaltyBasisPoints: number;
  readonly policyDigest: PlanningDigestV1;
}

const validatedStrategicAllocationPoliciesV1 =
  new WeakSet<StrategicAllocationPolicyV1>();

export interface StrategicAllocationEvidencePortV1 {
  verifyCapabilityAttestation(input: {
    readonly attestation: StrategicCapabilityAttestationV1;
    readonly task: StrategicAllocationTaskV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
  verifyPeerProjection(input: {
    readonly projection: StrategicPeerProjectionV1;
    readonly scopeDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface StrategicAllocationAwardV1 {
  readonly taskId: string;
  readonly taskDigest: PlanningDigestV1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly independenceGroupId: string;
  readonly revealDigest: PlanningDigestV1;
  readonly attestationDigest: PlanningDigestV1;
  readonly scoreMicros: number;
  readonly budgetUnits: number;
  readonly resourceUnits: number;
  readonly collateralUnits: number;
  readonly awardDigest: PlanningDigestV1;
}

export interface StrategicAllocationPlanV1 {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly allocationId: string;
  readonly scopeDigest: string;
  readonly policyDigest: PlanningDigestV1;
  readonly awards: readonly StrategicAllocationAwardV1[];
  readonly unallocatedTaskIds: readonly string[];
  readonly rejectedRevealDigests: readonly PlanningDigestV1[];
  readonly totalBudgetUnits: number;
  readonly totalResourceUnits: number;
  readonly totalCollateralUnits: number;
  readonly decidedAtLogicalMs: number;
  readonly planDigest: PlanningDigestV1;
}

export interface StrategicAllocationSettlementV1 {
  readonly schemaVersion: 1;
  readonly settlementId: string;
  readonly planDigest: PlanningDigestV1;
  readonly awardDigest: PlanningDigestV1;
  readonly outcome: "satisfied" | "failed" | "misrepresented" | "indeterminate";
  readonly releasedCollateralUnits: number;
  readonly forfeitedCollateralUnits: number;
  readonly falseCommitmentEvidenceDigest: PlanningDigestV1 | null;
  readonly replacementRequired: boolean;
  readonly settledAtLogicalMs: number;
  readonly settlementDigest: PlanningDigestV1;
}

export function createStrategicAllocationPolicyV1(
  input: Omit<StrategicAllocationPolicyV1, "policyDigest">,
): StrategicAllocationPolicyV1 {
  validatePolicyBody(input);
  const body = freeze(input);
  return freeze({
    ...body,
    policyDigest: digestPlanningJsonV1(
      "strategic-allocation-policy",
      body as unknown as PlanningJson,
    ),
  });
}

export function createStrategicBidCommitmentV1(input: {
  readonly commitmentId: string;
  readonly allocationId: string;
  readonly taskId: string;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly independenceGroupId: string;
  readonly sealedBidDigest: PlanningDigestV1;
  readonly committedAtLogicalMs: number;
}): StrategicBidCommitmentV1 {
  const body = { schemaVersion: 1 as const, ...input };
  validateCommitmentBody(body);
  return freeze({
    ...body,
    commitmentDigest: digestPlanningJsonV1(
      "strategic-bid-commitment",
      body as unknown as PlanningJson,
    ),
  });
}

export function createStrategicBidRevealV1(
  input: Omit<StrategicBidRevealV1, "schemaVersion" | "revealDigest">,
): StrategicBidRevealV1 {
  const body = { schemaVersion: 1 as const, ...input };
  validateRevealBody(body);
  return freeze({
    ...body,
    revealDigest: digestPlanningJsonV1(
      "strategic-bid-reveal",
      body as unknown as PlanningJson,
    ),
  });
}

export function strategicSealedBidDigestV1(
  reveal: Omit<
    StrategicBidRevealV1,
    | "schemaVersion"
    | "revealDigest"
    | "revealId"
    | "commitmentId"
    | "revealedAtLogicalMs"
  >,
): PlanningDigestV1 {
  return digestPlanningJsonV1("strategic-bid-commitment", {
    domain: "sealed-bid-v1",
    ...reveal,
  } as unknown as PlanningJson);
}

/**
 * Deterministic, manipulation-aware assignment. Every external claim is
 * reauthenticated before it influences ranking or resource reservation.
 */
export async function allocateStrategicallyV1(input: {
  readonly allocationId: string;
  readonly scopeDigest: string;
  readonly tasks: readonly StrategicAllocationTaskV1[];
  readonly candidates: readonly StrategicAllocationCandidateV1[];
  readonly policy: StrategicAllocationPolicyV1;
  readonly evidence: StrategicAllocationEvidencePortV1;
  readonly logicalTimeMs: number;
}): Promise<StrategicAllocationPlanV1> {
  const policy = validateStrategicAllocationPolicyV1(input.policy);
  const tasks = freeze(input.tasks);
  const candidates = freeze(input.candidates);
  identifier(input.allocationId, "allocationId");
  planningDigest(input.scopeDigest, "scopeDigest");
  integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  validateTasks(tasks);
  if (
    !input.evidence ||
    typeof input.evidence.verifyCapabilityAttestation !== "function" ||
    typeof input.evidence.verifyPeerProjection !== "function"
  )
    throw new TypeError("strategic allocation evidence port is required");
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const eligibleByTask = new Map<
    string,
    { candidate: StrategicAllocationCandidateV1; score: number }[]
  >();
  const rejected = new Set<PlanningDigestV1>();
  for (const candidate of candidates) {
    validateCandidate(candidate);
    const { commitment, reveal, attestation, peer } = candidate;
    const task = taskById.get(reveal.taskId);
    const sealed = strategicSealedBidDigestV1({
      allocationId: reveal.allocationId,
      taskId: reveal.taskId,
      peerId: reveal.peerId,
      peerInstanceId: reveal.peerInstanceId,
      independenceGroupId: reveal.independenceGroupId,
      declaredUtilityMicros: reveal.declaredUtilityMicros,
      declaredCostUnits: reveal.declaredCostUnits,
      declaredResourceUnits: reveal.declaredResourceUnits,
      requestedBudgetUnits: reveal.requestedBudgetUnits,
      collateralUnits: reveal.collateralUnits,
      availabilityUntilLogicalMs: reveal.availabilityUntilLogicalMs,
      capabilityAttestationDigest: reveal.capabilityAttestationDigest,
      nonceDigest: reveal.nonceDigest,
    });
    const structurallyEligible =
      task !== undefined &&
      commitment.commitmentId === reveal.commitmentId &&
      commitment.allocationId === input.allocationId &&
      commitment.taskId === reveal.taskId &&
      commitment.peerId === reveal.peerId &&
      commitment.peerInstanceId === reveal.peerInstanceId &&
      commitment.independenceGroupId === reveal.independenceGroupId &&
      commitment.sealedBidDigest === sealed &&
      reveal.capabilityAttestationDigest === attestation.attestationDigest &&
      attestation.peerId === reveal.peerId &&
      peer.peerId === reveal.peerId &&
      peer.scopeDigest === input.scopeDigest &&
      reveal.revealedAtLogicalMs >= commitment.committedAtLogicalMs &&
      input.logicalTimeMs < reveal.availabilityUntilLogicalMs &&
      reveal.requestedBudgetUnits <= (task?.budgetCeilingUnits ?? 0) &&
      reveal.collateralUnits >=
        (task?.collateralFloorUnits ?? Number.MAX_SAFE_INTEGER) &&
      reveal.declaredResourceUnits <= attestation.resourceCeilingUnits &&
      attestation.validFromLogicalMs <= input.logicalTimeMs &&
      input.logicalTimeMs < attestation.validUntilLogicalMs &&
      task?.requiredCapabilityKeys.every((key) =>
        attestation.capabilityKeys.includes(key),
      ) === true &&
      (task.requiredIndependenceGroupId === null ||
        task.requiredIndependenceGroupId === reveal.independenceGroupId) &&
      attestation.capabilityConfidenceBasisPoints >=
        policy.minimumCapabilityConfidenceBasisPoints &&
      peer.status === "eligible" &&
      peer.credibilityUncertaintyBasisPoints <=
        policy.maximumCredibilityUncertaintyBasisPoints &&
      peer.collusionPressureBasisPoints <=
        policy.maximumCollusionPressureBasisPoints;
    if (
      !structurallyEligible ||
      !(await input.evidence.verifyCapabilityAttestation({
        attestation,
        task: task!,
        logicalTimeMs: input.logicalTimeMs,
      })) ||
      !(await input.evidence.verifyPeerProjection({
        projection: peer,
        scopeDigest: input.scopeDigest,
        logicalTimeMs: input.logicalTimeMs,
      }))
    ) {
      rejected.add(reveal.revealDigest);
      continue;
    }
    const score = candidateScore(candidate, policy);
    const list = eligibleByTask.get(task!.taskId) ?? [];
    list.push({ candidate, score });
    eligibleByTask.set(task!.taskId, list);
  }

  const peerCounts = new Map<string, number>();
  const groupCounts = new Map<string, number>();
  const awards: StrategicAllocationAwardV1[] = [];
  const allocatedTaskIds = new Set<string>();
  let totalBudgetUnits = 0,
    totalResourceUnits = 0,
    totalCollateralUnits = 0;
  const orderedTasks = topologicalTasks(tasks);
  for (const task of orderedTasks) {
    const candidates = (eligibleByTask.get(task.taskId) ?? []).sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.reveal.requestedBudgetUnits -
          right.candidate.reveal.requestedBudgetUnits ||
        left.candidate.reveal.revealDigest.localeCompare(
          right.candidate.reveal.revealDigest,
        ),
    );
    if (
      task.dependsOnTaskIds.some(
        (dependency) => !allocatedTaskIds.has(dependency),
      )
    ) {
      for (const candidate of candidates)
        rejected.add(candidate.candidate.reveal.revealDigest);
      continue;
    }
    let awarded = false;
    for (const ranked of candidates) {
      const reveal = ranked.candidate.reveal;
      if (
        (peerCounts.get(reveal.peerId) ?? 0) >= policy.maximumTasksPerPeer ||
        (groupCounts.get(reveal.independenceGroupId) ?? 0) >=
          policy.maximumTasksPerIndependenceGroup ||
        totalBudgetUnits + reveal.requestedBudgetUnits >
          policy.maximumTotalBudgetUnits ||
        totalResourceUnits + reveal.declaredResourceUnits >
          policy.maximumTotalResourceUnits
      ) {
        rejected.add(reveal.revealDigest);
        continue;
      }
      const awardBody = {
        taskId: task.taskId,
        taskDigest: task.taskDigest,
        peerId: reveal.peerId,
        peerInstanceId: reveal.peerInstanceId,
        independenceGroupId: reveal.independenceGroupId,
        revealDigest: reveal.revealDigest,
        attestationDigest: ranked.candidate.attestation.attestationDigest,
        scoreMicros: ranked.score,
        budgetUnits: reveal.requestedBudgetUnits,
        resourceUnits: reveal.declaredResourceUnits,
        collateralUnits: reveal.collateralUnits,
      };
      awards.push(
        freeze({
          ...awardBody,
          awardDigest: digestPlanningJsonV1("strategic-allocation-plan", {
            domain: "award-v1",
            ...awardBody,
          } as unknown as PlanningJson),
        }),
      );
      totalBudgetUnits += reveal.requestedBudgetUnits;
      totalResourceUnits += reveal.declaredResourceUnits;
      totalCollateralUnits += reveal.collateralUnits;
      peerCounts.set(reveal.peerId, (peerCounts.get(reveal.peerId) ?? 0) + 1);
      groupCounts.set(
        reveal.independenceGroupId,
        (groupCounts.get(reveal.independenceGroupId) ?? 0) + 1,
      );
      allocatedTaskIds.add(task.taskId);
      awarded = true;
      for (const other of candidates)
        if (other !== ranked) rejected.add(other.candidate.reveal.revealDigest);
      break;
    }
    if (!awarded)
      for (const candidate of candidates)
        rejected.add(candidate.candidate.reveal.revealDigest);
  }
  const awardedTasks = new Set(awards.map((item) => item.taskId));
  const body = {
    schemaVersion: 1 as const,
    planId: "pending",
    allocationId: input.allocationId,
    scopeDigest: input.scopeDigest,
    policyDigest: policy.policyDigest,
    awards: awards.sort((left, right) =>
      left.taskId.localeCompare(right.taskId),
    ),
    unallocatedTaskIds: tasks
      .filter((item) => !awardedTasks.has(item.taskId))
      .map((item) => item.taskId)
      .sort(),
    rejectedRevealDigests: [...rejected].sort(),
    totalBudgetUnits,
    totalResourceUnits,
    totalCollateralUnits,
    decidedAtLogicalMs: input.logicalTimeMs,
  };
  const planDigest = digestPlanningJsonV1("strategic-allocation-plan", {
    ...body,
    planId: null,
  } as unknown as PlanningJson);
  return freeze({
    ...body,
    planId: `strategic-plan:${planDigest.slice(7, 47)}`,
    planDigest,
  });
}

export function settleStrategicAllocationV1(input: {
  readonly plan: StrategicAllocationPlanV1;
  readonly awardDigest: PlanningDigestV1;
  readonly outcome: StrategicAllocationSettlementV1["outcome"];
  readonly outcomeEvidenceDigest: PlanningDigestV1;
  readonly settledAtLogicalMs: number;
  readonly policy: StrategicAllocationPolicyV1;
}): StrategicAllocationSettlementV1 {
  const policy = validateStrategicAllocationPolicyV1(input.policy);
  const plan = validateStrategicAllocationPlanV1(input.plan, policy);
  const award = plan.awards.find(
    (item) => item.awardDigest === input.awardDigest,
  );
  if (!award)
    throw new TypeError("strategic settlement award binding is invalid");
  if (
    !["satisfied", "failed", "misrepresented", "indeterminate"].includes(
      input.outcome,
    )
  )
    throw new TypeError("strategic settlement outcome invalid");
  planningDigest(input.outcomeEvidenceDigest, "outcomeEvidenceDigest");
  integer(
    input.settledAtLogicalMs,
    "settledAtLogicalMs",
    plan.decidedAtLogicalMs,
    Number.MAX_SAFE_INTEGER,
  );
  const falseCommitment = input.outcome === "misrepresented";
  const failed = input.outcome === "failed" || falseCommitment;
  const forfeitedCollateralUnits = falseCommitment
    ? Math.min(
        award.collateralUnits,
        Math.ceil(
          (award.collateralUnits * policy.falseCommitmentPenaltyBasisPoints) /
            10_000,
        ),
      )
    : 0;
  const evidenceDigest = falseCommitment
    ? digestPlanningJsonV1("strategic-allocation-settlement", {
        domain: "false-commitment-evidence-v1",
        awardDigest: award.awardDigest,
        revealDigest: award.revealDigest,
        outcomeEvidenceDigest: input.outcomeEvidenceDigest,
      })
    : null;
  const body = {
    schemaVersion: 1 as const,
    settlementId: `settlement:${award.awardDigest.slice(7, 31)}:${input.settledAtLogicalMs}`,
    planDigest: plan.planDigest,
    awardDigest: award.awardDigest,
    outcome: input.outcome,
    releasedCollateralUnits: award.collateralUnits - forfeitedCollateralUnits,
    forfeitedCollateralUnits,
    falseCommitmentEvidenceDigest: evidenceDigest,
    replacementRequired: failed,
    settledAtLogicalMs: input.settledAtLogicalMs,
  };
  return freeze({
    ...body,
    settlementDigest: digestPlanningJsonV1(
      "strategic-allocation-settlement",
      body as unknown as PlanningJson,
    ),
  });
}

export function validateStrategicAllocationPlanV1(
  input: StrategicAllocationPlanV1,
  policyInput: StrategicAllocationPolicyV1,
): StrategicAllocationPlanV1 {
  const policy = validateStrategicAllocationPolicyV1(policyInput);
  if (
    !input ||
    input.schemaVersion !== 1 ||
    input.policyDigest !== policy.policyDigest
  )
    throw new TypeError(
      "strategic allocation plan schema or policy binding invalid",
    );
  identifier(input.allocationId, "allocationId");
  planningDigest(input.scopeDigest, "scopeDigest");
  integer(
    input.decidedAtLogicalMs,
    "decidedAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  canonicalStrings(input.unallocatedTaskIds, "unallocatedTaskIds");
  const rejected = [...input.rejectedRevealDigests];
  rejected.forEach((item) => planningDigest(item, "rejectedRevealDigest"));
  if (
    new Set(rejected).size !== rejected.length ||
    rejected.some((item, index) => index > 0 && rejected[index - 1] > item)
  )
    throw new TypeError("rejected reveal digests must be canonical");
  const taskIds = new Set<string>();
  const peerCounts = new Map<string, number>();
  const groupCounts = new Map<string, number>();
  let totalBudgetUnits = 0,
    totalResourceUnits = 0,
    totalCollateralUnits = 0;
  for (const [index, award] of input.awards.entries()) {
    identifier(award.taskId, "award.taskId");
    if (
      taskIds.has(award.taskId) ||
      (index > 0 && input.awards[index - 1].taskId > award.taskId)
    )
      throw new TypeError(
        "strategic allocation awards must be canonical and unique",
      );
    taskIds.add(award.taskId);
    planningDigest(award.taskDigest, "award.taskDigest");
    identifier(award.peerId, "award.peerId");
    identifier(award.peerInstanceId, "award.peerInstanceId");
    identifier(award.independenceGroupId, "award.independenceGroupId");
    peerCounts.set(award.peerId, (peerCounts.get(award.peerId) ?? 0) + 1);
    groupCounts.set(
      award.independenceGroupId,
      (groupCounts.get(award.independenceGroupId) ?? 0) + 1,
    );
    planningDigest(award.revealDigest, "award.revealDigest");
    planningDigest(award.attestationDigest, "award.attestationDigest");
    integer(
      award.scoreMicros,
      "award.scoreMicros",
      Number.MIN_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    );
    integer(award.budgetUnits, "award.budgetUnits", 0, Number.MAX_SAFE_INTEGER);
    integer(
      award.resourceUnits,
      "award.resourceUnits",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    integer(
      award.collateralUnits,
      "award.collateralUnits",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const { awardDigest, ...awardBody } = award;
    planningDigest(awardDigest, "award.awardDigest");
    if (
      digestPlanningJsonV1("strategic-allocation-plan", {
        domain: "award-v1",
        ...awardBody,
      } as unknown as PlanningJson) !== awardDigest
    )
      throw new TypeError("strategic allocation award digest invalid");
    totalBudgetUnits += award.budgetUnits;
    totalResourceUnits += award.resourceUnits;
    totalCollateralUnits += award.collateralUnits;
  }
  if (
    !Number.isSafeInteger(totalBudgetUnits) ||
    !Number.isSafeInteger(totalResourceUnits) ||
    !Number.isSafeInteger(totalCollateralUnits) ||
    totalBudgetUnits !== input.totalBudgetUnits ||
    totalResourceUnits !== input.totalResourceUnits ||
    totalCollateralUnits !== input.totalCollateralUnits ||
    totalBudgetUnits > policy.maximumTotalBudgetUnits ||
    totalResourceUnits > policy.maximumTotalResourceUnits
  )
    throw new TypeError("strategic allocation plan totals invalid");
  if (
    input.unallocatedTaskIds.some((item) => taskIds.has(item)) ||
    [...peerCounts.values()].some(
      (count) => count > policy.maximumTasksPerPeer,
    ) ||
    [...groupCounts.values()].some(
      (count) => count > policy.maximumTasksPerIndependenceGroup,
    )
  )
    throw new TypeError(
      "strategic allocation plan capacity constraints invalid",
    );
  const { planDigest, planId: _planId, ...body } = input;
  planningDigest(planDigest, "planDigest");
  const actual = digestPlanningJsonV1("strategic-allocation-plan", {
    ...body,
    planId: null,
  } as unknown as PlanningJson);
  if (
    actual !== planDigest ||
    input.planId !== `strategic-plan:${actual.slice(7, 47)}`
  )
    throw new TypeError("strategic allocation plan digest invalid");
  return freeze(input);
}

function candidateScore(
  candidate: StrategicAllocationCandidateV1,
  policy: StrategicAllocationPolicyV1,
): number {
  const reveal = candidate.reveal;
  const normalizedUtility = Math.max(
    -1_000_000_000,
    Math.min(1_000_000_000, reveal.declaredUtilityMicros),
  );
  const value =
    (normalizedUtility * policy.utilityWeightBasisPoints) / 10_000 -
    (reveal.declaredCostUnits * policy.costWeightBasisPoints) / 10_000 +
    (candidate.peer.credibilityScoreBasisPoints *
      policy.credibilityWeightBasisPoints) /
      10_000 +
    (candidate.attestation.capabilityConfidenceBasisPoints *
      policy.capabilityWeightBasisPoints) /
      10_000 -
    (candidate.peer.collusionPressureBasisPoints *
      policy.collusionPenaltyWeightBasisPoints) /
      10_000;
  if (!Number.isSafeInteger(Math.round(value)))
    throw new RangeError("strategic allocation score overflow");
  return Math.round(value);
}

function topologicalTasks(
  tasks: readonly StrategicAllocationTaskV1[],
): StrategicAllocationTaskV1[] {
  const byId = new Map(tasks.map((item) => [item.taskId, item]));
  const ordered: StrategicAllocationTaskV1[] = [];
  const pending = new Set(tasks.map((item) => item.taskId));
  while (pending.size) {
    const ready = [...pending]
      .filter((id) =>
        byId
          .get(id)!
          .dependsOnTaskIds.every((dependency) => !pending.has(dependency)),
      )
      .sort();
    if (ready.length === 0)
      throw new TypeError("strategic allocation task graph contains a cycle");
    for (const id of ready) {
      pending.delete(id);
      ordered.push(byId.get(id)!);
    }
  }
  return ordered;
}

/**
 * Reconstructs a policy from its authenticated body. The returned value is a
 * fresh immutable snapshot, so callers never retain authority through a
 * mutable configuration object supplied at construction time.
 */
export function validateStrategicAllocationPolicyV1(
  input: StrategicAllocationPolicyV1,
): StrategicAllocationPolicyV1 {
  if (validatedStrategicAllocationPoliciesV1.has(input)) return input;
  const { policyDigest, ...body } = input;
  planningDigest(policyDigest, "policyDigest");
  const rebuilt = createStrategicAllocationPolicyV1(body);
  if (rebuilt.policyDigest !== policyDigest)
    throw new TypeError("strategic allocation policy digest mismatch");
  validatedStrategicAllocationPoliciesV1.add(rebuilt);
  return rebuilt;
}

function validatePolicyBody(
  input: Omit<StrategicAllocationPolicyV1, "policyDigest">,
): void {
  if (input.schemaVersion !== 1)
    throw new TypeError("strategic allocation policy schema invalid");
  identifier(input.policyId, "policyId");
  integer(input.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  integer(input.maximumTasksPerPeer, "maximumTasksPerPeer", 1, 100_000);
  integer(
    input.maximumTasksPerIndependenceGroup,
    "maximumTasksPerIndependenceGroup",
    1,
    100_000,
  );
  integer(
    input.maximumTotalBudgetUnits,
    "maximumTotalBudgetUnits",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.maximumTotalResourceUnits,
    "maximumTotalResourceUnits",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  for (const [label, value] of Object.entries(input).filter(([key]) =>
    key.endsWith("BasisPoints"),
  ))
    bps(value, label);
}

function validateTasks(tasks: readonly StrategicAllocationTaskV1[]): void {
  if (tasks.length === 0 || tasks.length > 100_000)
    throw new RangeError("strategic allocation tasks invalid");
  const ids = new Set<string>();
  for (const task of tasks) {
    identifier(task.taskId, "taskId");
    if (ids.has(task.taskId))
      throw new TypeError("strategic allocation task duplicated");
    ids.add(task.taskId);
    planningDigest(task.taskDigest, "taskDigest");
    canonicalStrings(task.requiredCapabilityKeys, "requiredCapabilityKeys");
    canonicalStrings(task.dependsOnTaskIds, "dependsOnTaskIds");
    if (task.requiredIndependenceGroupId !== null)
      identifier(
        task.requiredIndependenceGroupId,
        "requiredIndependenceGroupId",
      );
    integer(
      task.budgetCeilingUnits,
      "budgetCeilingUnits",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    integer(
      task.collateralFloorUnits,
      "collateralFloorUnits",
      0,
      Number.MAX_SAFE_INTEGER,
    );
  }
  if (
    tasks.some((task) => task.dependsOnTaskIds.some((item) => !ids.has(item)))
  )
    throw new TypeError("strategic allocation task dependency unavailable");
  topologicalTasks(tasks);
}

function validateCandidate(candidate: StrategicAllocationCandidateV1): void {
  const commitment = candidate.commitment;
  const { commitmentDigest, ...commitmentBody } = commitment;
  validateCommitmentBody(commitmentBody);
  if (
    digestPlanningJsonV1(
      "strategic-bid-commitment",
      commitmentBody as unknown as PlanningJson,
    ) !== commitmentDigest
  )
    throw new TypeError("strategic bid commitment digest invalid");
  const reveal = candidate.reveal;
  const { revealDigest, ...revealBody } = reveal;
  validateRevealBody(revealBody);
  if (
    digestPlanningJsonV1(
      "strategic-bid-reveal",
      revealBody as unknown as PlanningJson,
    ) !== revealDigest
  )
    throw new TypeError("strategic bid reveal digest invalid");
  identifier(candidate.attestation.attestationId, "attestationId");
  identifier(candidate.attestation.peerId, "attestation.peerId");
  canonicalStrings(
    candidate.attestation.capabilityKeys,
    "attestation.capabilityKeys",
  );
  bps(
    candidate.attestation.capabilityConfidenceBasisPoints,
    "capabilityConfidenceBasisPoints",
  );
  integer(
    candidate.attestation.resourceCeilingUnits,
    "resourceCeilingUnits",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  identifier(candidate.attestation.issuerId, "attestation.issuerId");
  planningDigest(candidate.attestation.issuerKeyDigest, "issuerKeyDigest");
  planningDigest(candidate.attestation.attestationDigest, "attestationDigest");
  integer(
    candidate.attestation.validFromLogicalMs,
    "attestation.validFromLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    candidate.attestation.validUntilLogicalMs,
    "attestation.validUntilLogicalMs",
    candidate.attestation.validFromLogicalMs + 1,
    Number.MAX_SAFE_INTEGER,
  );
  identifier(candidate.peer.peerId, "projection.peerId");
  planningDigest(candidate.peer.scopeDigest, "projection.scopeDigest");
  planningDigest(
    candidate.peer.credibilityStateDigest,
    "credibilityStateDigest",
  );
  bps(
    candidate.peer.credibilityScoreBasisPoints,
    "credibilityScoreBasisPoints",
  );
  bps(
    candidate.peer.credibilityUncertaintyBasisPoints,
    "credibilityUncertaintyBasisPoints",
  );
  bps(
    candidate.peer.collusionPressureBasisPoints,
    "collusionPressureBasisPoints",
  );
  if (
    !["eligible", "restricted", "quarantined", "unknown"].includes(
      candidate.peer.status,
    )
  )
    throw new TypeError("peer projection status invalid");
}

function validateCommitmentBody(
  input: Omit<StrategicBidCommitmentV1, "commitmentDigest">,
): void {
  if (input.schemaVersion !== 1)
    throw new TypeError("strategic bid commitment schema invalid");
  for (const [label, value] of Object.entries({
    commitmentId: input.commitmentId,
    allocationId: input.allocationId,
    taskId: input.taskId,
    peerId: input.peerId,
    peerInstanceId: input.peerInstanceId,
    independenceGroupId: input.independenceGroupId,
  }))
    identifier(value, label);
  planningDigest(input.sealedBidDigest, "sealedBidDigest");
  integer(
    input.committedAtLogicalMs,
    "committedAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
}

function validateRevealBody(
  input: Omit<StrategicBidRevealV1, "revealDigest">,
): void {
  if (input.schemaVersion !== 1)
    throw new TypeError("strategic bid reveal schema invalid");
  for (const [label, value] of Object.entries({
    revealId: input.revealId,
    commitmentId: input.commitmentId,
    allocationId: input.allocationId,
    taskId: input.taskId,
    peerId: input.peerId,
    peerInstanceId: input.peerInstanceId,
    independenceGroupId: input.independenceGroupId,
  }))
    identifier(value, label);
  integer(
    input.declaredUtilityMicros,
    "declaredUtilityMicros",
    -1_000_000_000,
    1_000_000_000,
  );
  for (const [label, value] of Object.entries({
    declaredCostUnits: input.declaredCostUnits,
    declaredResourceUnits: input.declaredResourceUnits,
    requestedBudgetUnits: input.requestedBudgetUnits,
    collateralUnits: input.collateralUnits,
  }))
    integer(value, label, 0, Number.MAX_SAFE_INTEGER);
  integer(
    input.availabilityUntilLogicalMs,
    "availabilityUntilLogicalMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  planningDigest(
    input.capabilityAttestationDigest,
    "capabilityAttestationDigest",
  );
  planningDigest(input.nonceDigest, "nonceDigest");
  integer(
    input.revealedAtLogicalMs,
    "revealedAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
}

function canonicalStrings(values: readonly string[], label: string): void {
  if (
    !Array.isArray(values) ||
    values.length > 100_000 ||
    values.some(
      (item) =>
        typeof item !== "string" || item.length === 0 || item.length > 256,
    )
  )
    throw new TypeError(`${label} invalid`);
  const canonical = [...new Set(values)].sort();
  if (
    canonical.length !== values.length ||
    canonical.some((item, index) => item !== values[index])
  )
    throw new TypeError(`${label} must be canonical`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value)
  )
    throw new TypeError(`${label} invalid`);
}

function planningDigest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    throw new TypeError(`${label} invalid`);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new RangeError(`${label} invalid`);
  return value as number;
}

function bps(value: unknown, label: string): number {
  return integer(value, label, 0, 10_000);
}

function freeze<T>(value: T): T {
  const clone = structuredClone(value);
  const recurse = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>))
      recurse(child);
    Object.freeze(item);
  };
  recurse(clone);
  return clone;
}
