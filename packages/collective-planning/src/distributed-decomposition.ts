import type { JsonValue } from "@agentplat/core";

import {
  CollectivePlanningValidationError,
  deepFreezePlanning,
  digestPlanningJsonV1,
} from "./canonical.js";
import type { PlanningDigestV1 } from "./contracts.js";

export interface MissionTaskTemplateV1 {
  readonly templateId: string;
  readonly matchTerms: readonly string[];
  readonly steps: readonly {
    readonly stepKey: string;
    readonly roleKey: string;
    readonly requiredCapabilityKeys: readonly string[];
    readonly dependencyStepKeys: readonly string[];
    readonly budgetWeightBasisPoints: number;
  }[];
}

export interface DistributedDecompositionPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly maximumTasks: number;
  readonly maximumDepth: number;
  readonly maximumDependenciesPerTask: number;
  readonly maximumBudgetUnits: number;
  readonly minimumProposalConfidenceBasisPoints: number;
  readonly templates: readonly MissionTaskTemplateV1[];
  readonly policyDigest: PlanningDigestV1;
}

export interface MissionDecompositionRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly proposerPeerId: string;
  readonly proposerInstanceId: string;
  readonly outcomeStatements: readonly string[];
  readonly permittedCapabilityKeys: readonly string[];
  readonly availableRoleKeys: readonly string[];
  readonly observationDigests: readonly PlanningDigestV1[];
  readonly totalBudgetUnits: number;
  readonly priorGraphDigest: PlanningDigestV1 | null;
  readonly logicalTimeMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface MissionTaskNodeV1 {
  readonly schemaVersion: 1;
  readonly taskId: string;
  readonly semanticSlotKey: string;
  readonly outcomeIndex: number;
  readonly stepKey: string;
  readonly roleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly dependencyTaskDigests: readonly PlanningDigestV1[];
  readonly budgetUnits: number;
  readonly confidenceBasisPoints: number;
  readonly proposerPeerId: string;
  readonly proposerInstanceId: string;
  readonly basisObservationDigests: readonly PlanningDigestV1[];
  readonly predecessorTaskDigest: PlanningDigestV1 | null;
  readonly taskDigest: PlanningDigestV1;
}

export interface MissionDecompositionGraphV1 {
  readonly schemaVersion: 1;
  readonly graphId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly previousGraphDigest: PlanningDigestV1 | null;
  readonly tasks: readonly MissionTaskNodeV1[];
  readonly headTaskDigests: readonly PlanningDigestV1[];
  readonly totalBudgetUnits: number;
  readonly contributingPeerIds: readonly string[];
  readonly conflictSlotKeys: readonly string[];
  readonly logicalTimeMs: number;
  readonly graphDigest: PlanningDigestV1;
}

export interface MissionDecompositionMergeV1 {
  readonly schemaVersion: 1;
  readonly mergeId: string;
  readonly candidateGraphDigests: readonly PlanningDigestV1[];
  readonly selectedTaskDigests: readonly PlanningDigestV1[];
  readonly rejectedTaskDigests: readonly PlanningDigestV1[];
  readonly repairedTaskDigests: readonly PlanningDigestV1[];
  readonly conflictSlotKeys: readonly string[];
  readonly resultingGraphDigest: PlanningDigestV1;
  readonly mergeDigest: PlanningDigestV1;
}

/** Deterministic local factorizer using a versioned, domain-owned task catalog. */
export class ReferenceMissionDecomposerV1 {
  readonly policy: DistributedDecompositionPolicyV1;

  constructor(policy: DistributedDecompositionPolicyV1) {
    this.policy = validateDistributedDecompositionPolicyV1(policy);
  }

  factorize(requestInput: MissionDecompositionRequestV1): MissionDecompositionGraphV1 {
    const request = validateMissionDecompositionRequestV1(requestInput);
    if (request.totalBudgetUnits > this.policy.maximumBudgetUnits)
      fail("mission decomposition budget exceeds policy");
    const tasks: MissionTaskNodeV1[] = [];
    for (const [outcomeIndex, outcome] of request.outcomeStatements.entries()) {
      const template = selectTemplate(outcome, this.policy.templates);
      const steps = template?.steps ?? [fallbackStep(outcomeIndex, request.availableRoleKeys)];
      const taskByStep = new Map<string, MissionTaskNodeV1>();
      for (const step of steps) {
        if (!request.availableRoleKeys.includes(step.roleKey))
          fail(`mission decomposition role unavailable: ${step.roleKey}`);
        if (step.requiredCapabilityKeys.some((item) => !request.permittedCapabilityKeys.includes(item)))
          fail(`mission decomposition capability unavailable for ${step.stepKey}`);
        const dependencies = step.dependencyStepKeys.map((item) => {
          const dependency = taskByStep.get(item);
          if (!dependency) fail(`mission decomposition dependency is not prior: ${item}`);
          return dependency.taskDigest;
        }).sort();
        const body = {
          schemaVersion: 1 as const,
          taskId: `${request.requestId}:${outcomeIndex}:${step.stepKey}`,
          semanticSlotKey: `outcome:${outcomeIndex}:step:${step.stepKey}`,
          outcomeIndex,
          stepKey: step.stepKey,
          roleKey: step.roleKey,
          requiredCapabilityKeys: [...step.requiredCapabilityKeys].sort(),
          dependencyTaskDigests: dependencies,
          budgetUnits: Math.max(1, Math.floor(request.totalBudgetUnits * step.budgetWeightBasisPoints / 10_000)),
          confidenceBasisPoints: template ? 9_000 : this.policy.minimumProposalConfidenceBasisPoints,
          proposerPeerId: request.proposerPeerId,
          proposerInstanceId: request.proposerInstanceId,
          basisObservationDigests: [...request.observationDigests].sort(),
          predecessorTaskDigest: null,
        };
        const task = deepFreezePlanning({
          ...body,
          taskDigest: digestPlanningJsonV1("mission-task-node", body as unknown as JsonValue),
        }) as unknown as MissionTaskNodeV1;
        taskByStep.set(step.stepKey, task);
        tasks.push(task);
      }
    }
    if (tasks.length > this.policy.maximumTasks)
      fail("mission decomposition task capacity exceeded");
    return createMissionDecompositionGraphV1({
      missionIntentId: request.missionIntentId,
      intentRevision: request.intentRevision,
      intentDigest: request.intentDigest,
      policyDigest: this.policy.policyDigest,
      revision: 1,
      previousGraphDigest: request.priorGraphDigest,
      tasks,
      conflictSlotKeys: [],
      logicalTimeMs: request.logicalTimeMs,
    }, this.policy);
  }
}

/** One deterministic head per semantic slot, followed by dependency closure. */
export function mergeMissionDecompositionsV1(input: {
  readonly graphs: readonly MissionDecompositionGraphV1[];
  readonly priorGraph: MissionDecompositionGraphV1 | null;
  readonly policy: DistributedDecompositionPolicyV1;
  readonly logicalTimeMs: number;
}): { readonly graph: MissionDecompositionGraphV1; readonly merge: MissionDecompositionMergeV1 } {
  const policy = validateDistributedDecompositionPolicyV1(input.policy);
  if (input.graphs.length === 0) fail("mission decomposition merge requires candidates");
  const graphs = input.graphs.map((graph) => validateMissionDecompositionGraphV1(graph, policy));
  const first = graphs[0];
  if (graphs.some((graph) =>
    graph.missionIntentId !== first.missionIntentId ||
    graph.intentRevision !== first.intentRevision ||
    graph.intentDigest !== first.intentDigest ||
    graph.policyDigest !== policy.policyDigest,
  )) fail("mission decomposition candidate scopes differ");
  const priorGraph = input.priorGraph === null
    ? null
    : validateMissionDecompositionGraphV1(input.priorGraph, policy);
  if (priorGraph && (
    priorGraph.missionIntentId !== first.missionIntentId ||
    priorGraph.intentDigest !== first.intentDigest ||
    priorGraph.intentRevision > first.intentRevision
  )) fail("mission decomposition prior graph scope differs");
  const candidateTimeHighWater = graphs.reduce(
    (maximum, graph) => Math.max(maximum, graph.logicalTimeMs),
    priorGraph?.logicalTimeMs ?? 0,
  );
  if (input.logicalTimeMs < candidateTimeHighWater)
    fail("mission decomposition merge logical time rollback");
  const bySlot = new Map<string, MissionTaskNodeV1[]>();
  for (const task of graphs.flatMap((graph) => graph.tasks)) {
    const slot = bySlot.get(task.semanticSlotKey) ?? [];
    if (!slot.some((item) => item.taskDigest === task.taskDigest)) slot.push(task);
    bySlot.set(task.semanticSlotKey, slot);
  }
  const selected: MissionTaskNodeV1[] = [];
  const rejected: MissionTaskNodeV1[] = [];
  const conflicts: string[] = [];
  for (const [slotKey, candidates] of [...bySlot].sort(([left], [right]) => left.localeCompare(right))) {
    candidates.sort(compareTasks);
    selected.push(candidates[0]);
    rejected.push(...candidates.slice(1));
    if (candidates.length > 1) conflicts.push(slotKey);
  }
  const normalized = normalizeSelectedTasks(selected, graphs.flatMap((graph) => graph.tasks));
  rejected.push(...selected.filter((item) => !normalized.sourceTaskDigests.has(item.taskDigest)));
  const graph = createMissionDecompositionGraphV1({
    missionIntentId: first.missionIntentId,
    intentRevision: first.intentRevision,
    intentDigest: first.intentDigest,
    policyDigest: policy.policyDigest,
    revision: (priorGraph?.revision ?? 0) + 1,
    previousGraphDigest: priorGraph?.graphDigest ?? null,
    tasks: normalized.tasks,
    conflictSlotKeys: conflicts,
    logicalTimeMs: input.logicalTimeMs,
  }, policy);
  const mergeBody = {
    schemaVersion: 1 as const,
    mergeId: `merge:${graph.graphDigest.slice(7, 47)}`,
    candidateGraphDigests: graphs.map((item) => item.graphDigest).sort(),
    selectedTaskDigests: graph.tasks.map((item) => item.taskDigest).sort(),
    rejectedTaskDigests: [...new Set(rejected.map((item) => item.taskDigest))].sort(),
    repairedTaskDigests: graph.tasks.filter((item) => item.predecessorTaskDigest !== null).map((item) => item.taskDigest).sort(),
    conflictSlotKeys: [...conflicts].sort(),
    resultingGraphDigest: graph.graphDigest,
  };
  return deepFreezePlanning({
    graph,
    merge: {
      ...mergeBody,
      mergeDigest: digestPlanningJsonV1("mission-decomposition-merge", mergeBody as unknown as JsonValue),
    },
  }) as unknown as { readonly graph: MissionDecompositionGraphV1; readonly merge: MissionDecompositionMergeV1 };
}

/** Replaces only invalid tasks and their transitive descendants. */
export function repairMissionDecompositionV1(input: {
  readonly graph: MissionDecompositionGraphV1;
  readonly invalidatedTaskDigests: readonly PlanningDigestV1[];
  readonly replacementGraphs: readonly MissionDecompositionGraphV1[];
  readonly policy: DistributedDecompositionPolicyV1;
  readonly logicalTimeMs: number;
}) {
  const policy = validateDistributedDecompositionPolicyV1(input.policy);
  const graph = validateMissionDecompositionGraphV1(input.graph, policy);
  if (input.invalidatedTaskDigests.some((item) => !graph.tasks.some((task) => task.taskDigest === item)))
    fail("mission decomposition invalidation target unavailable");
  const affected = new Set(input.invalidatedTaskDigests);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of graph.tasks)
      if (!affected.has(task.taskDigest) && task.dependencyTaskDigests.some((item) => affected.has(item))) {
        affected.add(task.taskDigest);
        changed = true;
      }
  }
  const retained = graph.tasks.filter((item) => !affected.has(item.taskDigest));
  const affectedSlots = new Map(
    graph.tasks.filter((item) => affected.has(item.taskDigest)).map((item) => [item.semanticSlotKey, item.taskDigest]),
  );
  const replacementCandidates = input.replacementGraphs
    .map((item) => validateMissionDecompositionGraphV1(item, policy))
    .filter((item) =>
      item.missionIntentId === graph.missionIntentId &&
      item.intentRevision === graph.intentRevision &&
      item.intentDigest === graph.intentDigest,
    )
    .flatMap((item) => item.tasks)
    .filter((item) => affectedSlots.has(item.semanticSlotKey));
  const replacementBySlot = new Map<string, MissionTaskNodeV1>();
  for (const candidate of replacementCandidates.sort(compareTasks))
    if (!replacementBySlot.has(candidate.semanticSlotKey)) replacementBySlot.set(candidate.semanticSlotKey, candidate);
  if ([...affectedSlots.keys()].some((slot) => !replacementBySlot.has(slot)))
    fail("mission decomposition repair lacks a replacement for every affected task");
  const replacementTasks = [...replacementBySlot.values()]
    .map((item) => {
      const { taskDigest: _taskDigest, ...body } = item;
      const repairedBody = { ...body, predecessorTaskDigest: affectedSlots.get(item.semanticSlotKey) ?? null };
      return deepFreezePlanning({
        ...repairedBody,
        taskDigest: digestPlanningJsonV1("mission-task-node", repairedBody as unknown as JsonValue),
      }) as unknown as MissionTaskNodeV1;
    });
  const normalizedRepair = normalizeSelectedTasks(
    [...retained, ...replacementTasks],
    [...retained, ...replacementCandidates, ...replacementTasks],
  );
  if (normalizedRepair.tasks.length !== retained.length + replacementTasks.length)
    fail("mission decomposition repair could not close replacement dependencies");
  const candidate = createMissionDecompositionGraphV1({
    missionIntentId: graph.missionIntentId,
    intentRevision: graph.intentRevision,
    intentDigest: graph.intentDigest,
    policyDigest: graph.policyDigest,
    revision: graph.revision + 1,
    previousGraphDigest: graph.graphDigest,
    tasks: normalizedRepair.tasks,
    conflictSlotKeys: [],
    logicalTimeMs: input.logicalTimeMs,
  }, policy);
  return mergeMissionDecompositionsV1({
    graphs: [candidate],
    priorGraph: graph,
    policy,
    logicalTimeMs: input.logicalTimeMs,
  });
}

export function createDistributedDecompositionPolicyV1(
  input: Omit<DistributedDecompositionPolicyV1, "policyDigest">,
): DistributedDecompositionPolicyV1 {
  validatePolicyBody(input);
  const body = deepFreezePlanning(structuredClone(input));
  return deepFreezePlanning({
    ...body,
    policyDigest: digestPlanningJsonV1("distributed-decomposition-policy", body as unknown as JsonValue),
  }) as unknown as DistributedDecompositionPolicyV1;
}

export function validateDistributedDecompositionPolicyV1(
  input: DistributedDecompositionPolicyV1,
): DistributedDecompositionPolicyV1 {
  const { policyDigest, ...body } = input;
  const rebuilt = createDistributedDecompositionPolicyV1(body);
  if (rebuilt.policyDigest !== policyDigest) fail("distributed decomposition policy digest mismatch");
  return rebuilt;
}

export function createMissionDecompositionRequestV1(
  input: Omit<MissionDecompositionRequestV1, "requestDigest">,
): MissionDecompositionRequestV1 {
  validateRequestBody(input);
  const body = deepFreezePlanning(structuredClone(input));
  return deepFreezePlanning({
    ...body,
    requestDigest: digestPlanningJsonV1("mission-decomposition-request", body as unknown as JsonValue),
  }) as unknown as MissionDecompositionRequestV1;
}

export function validateMissionDecompositionRequestV1(
  input: MissionDecompositionRequestV1,
): MissionDecompositionRequestV1 {
  const { requestDigest, ...body } = input;
  const rebuilt = createMissionDecompositionRequestV1(body);
  if (rebuilt.requestDigest !== requestDigest) fail("mission decomposition request digest mismatch");
  return rebuilt;
}

export function validateMissionDecompositionGraphV1(
  graph: MissionDecompositionGraphV1,
  policy: DistributedDecompositionPolicyV1,
): MissionDecompositionGraphV1 {
  planningDigest(graph.graphDigest, "graphDigest");
  const rebuilt = createMissionDecompositionGraphV1({
    missionIntentId: graph.missionIntentId,
    intentRevision: graph.intentRevision,
    intentDigest: graph.intentDigest,
    policyDigest: graph.policyDigest,
    revision: graph.revision,
    previousGraphDigest: graph.previousGraphDigest,
    tasks: graph.tasks,
    conflictSlotKeys: graph.conflictSlotKeys,
    logicalTimeMs: graph.logicalTimeMs,
  }, policy);
  if (rebuilt.graphDigest !== graph.graphDigest || rebuilt.graphId !== graph.graphId)
    fail("mission decomposition graph digest mismatch");
  return rebuilt;
}

export function validateMissionTaskNodeV1(
  task: MissionTaskNodeV1,
  policy: DistributedDecompositionPolicyV1,
): MissionTaskNodeV1 {
  if (task.schemaVersion !== 1) fail("mission task node schema invalid");
  identifier(task.taskId, "taskId");
  identifier(task.semanticSlotKey, "semanticSlotKey");
  integer(task.outcomeIndex, "outcomeIndex", 0, Number.MAX_SAFE_INTEGER);
  identifier(task.stepKey, "stepKey");
  identifier(task.roleKey, "roleKey");
  canonicalStrings(task.requiredCapabilityKeys, "requiredCapabilityKeys");
  canonicalDigests(task.dependencyTaskDigests, "dependencyTaskDigests");
  if (task.dependencyTaskDigests.length > policy.maximumDependenciesPerTask)
    fail("mission task dependency capacity exceeded");
  integer(task.budgetUnits, "budgetUnits", 1, policy.maximumBudgetUnits);
  bps(task.confidenceBasisPoints, "confidenceBasisPoints");
  identifier(task.proposerPeerId, "proposerPeerId");
  identifier(task.proposerInstanceId, "proposerInstanceId");
  canonicalDigests(task.basisObservationDigests, "basisObservationDigests");
  if (task.predecessorTaskDigest !== null)
    planningDigest(task.predecessorTaskDigest, "predecessorTaskDigest");
  const { taskDigest, ...body } = task;
  planningDigest(taskDigest, "taskDigest");
  if (digestPlanningJsonV1("mission-task-node", body as unknown as JsonValue) !== taskDigest)
    fail("mission task node digest mismatch");
  return deepFreezePlanning(structuredClone(task)) as unknown as MissionTaskNodeV1;
}

function createMissionDecompositionGraphV1(
  input: {
    readonly missionIntentId: string;
    readonly intentRevision: number;
    readonly intentDigest: PlanningDigestV1;
    readonly policyDigest: PlanningDigestV1;
    readonly revision: number;
    readonly previousGraphDigest: PlanningDigestV1 | null;
    readonly tasks: readonly MissionTaskNodeV1[];
    readonly conflictSlotKeys: readonly string[];
    readonly logicalTimeMs: number;
  },
  policy: DistributedDecompositionPolicyV1,
): MissionDecompositionGraphV1 {
  identifier(input.missionIntentId, "missionIntentId");
  integer(input.intentRevision, "intentRevision", 1, Number.MAX_SAFE_INTEGER);
  planningDigest(input.intentDigest, "intentDigest");
  if (input.policyDigest !== policy.policyDigest) fail("mission decomposition policy binding invalid");
  integer(input.revision, "revision", 1, Number.MAX_SAFE_INTEGER);
  if (input.previousGraphDigest !== null) planningDigest(input.previousGraphDigest, "previousGraphDigest");
  integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  const tasks = input.tasks
    .map((task) => validateMissionTaskNodeV1(task, policy))
    .sort((left, right) => left.semanticSlotKey.localeCompare(right.semanticSlotKey));
  if (tasks.length > policy.maximumTasks) fail("mission decomposition task capacity exceeded");
  if (new Set(tasks.map((item) => item.semanticSlotKey)).size !== tasks.length)
    fail("mission decomposition contains duplicate semantic slots");
  assertAcyclic(tasks, policy.maximumDepth);
  const dependencies = new Set(tasks.flatMap((item) => item.dependencyTaskDigests));
  const headTaskDigests = tasks.filter((item) => !dependencies.has(item.taskDigest)).map((item) => item.taskDigest).sort();
  const totalBudgetUnits = tasks.reduce((sum, item) => sum + item.budgetUnits, 0);
  if (!Number.isSafeInteger(totalBudgetUnits) || totalBudgetUnits > policy.maximumBudgetUnits)
    fail("mission decomposition aggregate budget invalid");
  const body = {
    schemaVersion: 1 as const,
    graphId: "pending",
    missionIntentId: input.missionIntentId,
    intentRevision: input.intentRevision,
    intentDigest: input.intentDigest,
    policyDigest: input.policyDigest,
    revision: input.revision,
    previousGraphDigest: input.previousGraphDigest,
    tasks,
    headTaskDigests,
    totalBudgetUnits,
    contributingPeerIds: [...new Set(tasks.map((item) => item.proposerPeerId))].sort(),
    conflictSlotKeys: [...new Set(input.conflictSlotKeys)].sort(),
    logicalTimeMs: input.logicalTimeMs,
  };
  const graphDigest = digestPlanningJsonV1(
    "mission-decomposition-graph",
    { ...body, graphId: null } as unknown as JsonValue,
  );
  return deepFreezePlanning({
    ...body,
    graphId: `decomposition:${graphDigest.slice(7, 47)}`,
    graphDigest,
  }) as unknown as MissionDecompositionGraphV1;
}

function assertAcyclic(tasks: readonly MissionTaskNodeV1[], maximumDepth: number): void {
  const byDigest = new Map(tasks.map((item) => [item.taskDigest, item]));
  const visiting = new Set<PlanningDigestV1>();
  const complete = new Set<PlanningDigestV1>();
  const visit = (digestValue: PlanningDigestV1, depth: number) => {
    if (depth > maximumDepth) fail("mission decomposition depth exceeded");
    if (complete.has(digestValue)) return;
    if (visiting.has(digestValue)) fail("mission decomposition cycle detected");
    const task = byDigest.get(digestValue);
    if (!task) fail("mission decomposition dependency unavailable");
    visiting.add(digestValue);
    for (const dependency of task.dependencyTaskDigests) visit(dependency, depth + 1);
    visiting.delete(digestValue);
    complete.add(digestValue);
  };
  for (const task of tasks) visit(task.taskDigest, 1);
}

function compareTasks(left: MissionTaskNodeV1, right: MissionTaskNodeV1): number {
  return right.confidenceBasisPoints - left.confidenceBasisPoints ||
    left.budgetUnits - right.budgetUnits || left.taskDigest.localeCompare(right.taskDigest);
}

function normalizeSelectedTasks(
  selected: readonly MissionTaskNodeV1[],
  allCandidates: readonly MissionTaskNodeV1[],
): { readonly tasks: readonly MissionTaskNodeV1[]; readonly sourceTaskDigests: ReadonlySet<PlanningDigestV1> } {
  const candidateByDigest = new Map(allCandidates.map((item) => [item.taskDigest, item]));
  const selectedBySlot = new Map(selected.map((item) => [item.semanticSlotKey, item]));
  const normalizedBySlot = new Map<string, MissionTaskNodeV1>();
  const sourceTaskDigests = new Set<PlanningDigestV1>();
  const pending = new Set(selected.map((item) => item.semanticSlotKey));
  let progress = true;
  while (pending.size > 0 && progress) {
    progress = false;
    for (const slot of [...pending].sort()) {
      const task = selectedBySlot.get(slot)!;
      const dependencySlots = task.dependencyTaskDigests.map((item) => candidateByDigest.get(item)?.semanticSlotKey ?? null);
      if (dependencySlots.some((item) => item === null)) continue;
      if (dependencySlots.some((item) => !normalizedBySlot.has(item!))) continue;
      const dependencies = dependencySlots.map((item) => normalizedBySlot.get(item!)!.taskDigest).sort();
      const changed = dependencies.some((item, index) => item !== task.dependencyTaskDigests[index]);
      if (!changed) normalizedBySlot.set(slot, task);
      else {
        const { taskDigest: _taskDigest, ...body } = task;
        const repairedBody = {
          ...body,
          dependencyTaskDigests: dependencies,
          predecessorTaskDigest: task.taskDigest,
        };
        normalizedBySlot.set(slot, deepFreezePlanning({
          ...repairedBody,
          taskDigest: digestPlanningJsonV1("mission-task-node", repairedBody as unknown as JsonValue),
        }) as unknown as MissionTaskNodeV1);
      }
      sourceTaskDigests.add(task.taskDigest);
      pending.delete(slot);
      progress = true;
    }
  }
  return {
    tasks: [...normalizedBySlot.values()].sort((left, right) => left.semanticSlotKey.localeCompare(right.semanticSlotKey)),
    sourceTaskDigests,
  };
}

function selectTemplate(outcome: string, templates: readonly MissionTaskTemplateV1[]) {
  const normalized = outcome.toLocaleLowerCase("en-US");
  return [...templates]
    .map((template) => ({ template, score: template.matchTerms.filter((term) => normalized.includes(term)).length }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.template.templateId.localeCompare(right.template.templateId))[0]?.template;
}

function fallbackStep(outcomeIndex: number, roles: readonly string[]) {
  if (roles.length === 0) fail("mission decomposition has no available roles");
  return {
    stepKey: `deliver-outcome-${outcomeIndex}`,
    roleKey: roles[0],
    requiredCapabilityKeys: [] as readonly string[],
    dependencyStepKeys: [] as readonly string[],
    budgetWeightBasisPoints: 10_000,
  };
}

function validatePolicyBody(input: Omit<DistributedDecompositionPolicyV1, "policyDigest">): void {
  if (input.schemaVersion !== 1) fail("distributed decomposition policy schema invalid");
  identifier(input.policyId, "policyId");
  integer(input.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  integer(input.maximumTasks, "maximumTasks", 1, 100_000);
  integer(input.maximumDepth, "maximumDepth", 1, 10_000);
  integer(input.maximumDependenciesPerTask, "maximumDependenciesPerTask", 0, 10_000);
  integer(input.maximumBudgetUnits, "maximumBudgetUnits", 1, Number.MAX_SAFE_INTEGER);
  bps(input.minimumProposalConfidenceBasisPoints, "minimumProposalConfidenceBasisPoints");
  if (input.templates.length > 10_000) fail("mission decomposition template capacity exceeded");
  for (const template of input.templates) {
    identifier(template.templateId, "templateId");
    canonicalStrings(template.matchTerms, "matchTerms");
    const stepKeys = new Set<string>();
    for (const step of template.steps) {
      identifier(step.stepKey, "stepKey");
      identifier(step.roleKey, "roleKey");
      if (stepKeys.has(step.stepKey)) fail("mission decomposition template step duplicated");
      if (step.dependencyStepKeys.some((item) => !stepKeys.has(item)))
        fail("mission decomposition template dependencies must reference prior steps");
      if (step.dependencyStepKeys.length > input.maximumDependenciesPerTask)
        fail("mission decomposition template dependency capacity exceeded");
      stepKeys.add(step.stepKey);
      canonicalStrings(step.requiredCapabilityKeys, "requiredCapabilityKeys");
      canonicalStrings(step.dependencyStepKeys, "dependencyStepKeys");
      bps(step.budgetWeightBasisPoints, "budgetWeightBasisPoints");
    }
  }
}

function validateRequestBody(input: Omit<MissionDecompositionRequestV1, "requestDigest">): void {
  if (input.schemaVersion !== 1) fail("mission decomposition request schema invalid");
  identifier(input.requestId, "requestId");
  identifier(input.missionIntentId, "missionIntentId");
  integer(input.intentRevision, "intentRevision", 1, Number.MAX_SAFE_INTEGER);
  planningDigest(input.intentDigest, "intentDigest");
  identifier(input.proposerPeerId, "proposerPeerId");
  identifier(input.proposerInstanceId, "proposerInstanceId");
  canonicalStrings(input.permittedCapabilityKeys, "permittedCapabilityKeys");
  canonicalStrings(input.availableRoleKeys, "availableRoleKeys");
  canonicalDigests(input.observationDigests, "observationDigests");
  integer(input.totalBudgetUnits, "totalBudgetUnits", 1, Number.MAX_SAFE_INTEGER);
  if (input.priorGraphDigest !== null) planningDigest(input.priorGraphDigest, "priorGraphDigest");
  integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  if (input.outcomeStatements.length === 0 || input.outcomeStatements.length > 10_000)
    fail("mission decomposition outcomes invalid");
  if (input.outcomeStatements.some((item) => typeof item !== "string" || item.length === 0 || item.length > 8_192))
    fail("mission decomposition outcome statement invalid");
}

function canonicalStrings(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 100_000 || values.some((item) => typeof item !== "string" || item.length === 0 || item.length > 512))
    fail(`${label} invalid`);
  const normalized = [...new Set(values)].sort();
  if (normalized.length !== values.length || normalized.some((item, index) => item !== values[index]))
    fail(`${label} must be canonical`);
}

function canonicalDigests(values: readonly PlanningDigestV1[], label: string): void {
  if (!Array.isArray(values) || values.length > 100_000) fail(`${label} invalid`);
  values.forEach((item) => planningDigest(item, label));
  const canonical = [...new Set(values)].sort();
  if (canonical.length !== values.length || canonical.some((item, index) => item !== values[index]))
    fail(`${label} must be canonical`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value)) fail(`${label} invalid`);
}

function planningDigest(value: unknown, label: string): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) fail(`${label} invalid`);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) fail(`${label} invalid`);
  return value as number;
}

function bps(value: unknown, label: string): number {
  return integer(value, label, 0, 10_000);
}

function fail(message: string): never {
  throw new CollectivePlanningValidationError(message);
}
