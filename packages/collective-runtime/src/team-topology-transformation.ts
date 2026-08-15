import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

export const TEAM_TOPOLOGY_TRANSFORMATION_SCHEMA_VERSION_V1 = 1 as const;
export const TEAM_TOPOLOGY_TRANSFORMATION_STATE_FORMAT_V1 =
  "application/vnd.agentplat.team-topology-state.v1+json" as const;

export type TeamTopologyOperationV1 = "split" | "merge" | "federate";
export type TeamTopologyStatusV1 =
  | "proposed"
  | "certified"
  | "activated"
  | "rolled_back"
  | "rejected";

export interface TeamTopologyNodeV1 {
  readonly teamId: AgentPlatID;
  readonly parentTeamIds: readonly AgentPlatID[];
  readonly memberIds: readonly AgentPlatID[];
  readonly coordinatorId: AgentPlatID | null;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly nodeDigest: PlanningDigestV1;
}

export interface TeamTopologyTransformationRequestV1 {
  readonly schemaVersion: 1;
  readonly transformationId: AgentPlatID;
  readonly operation: TeamTopologyOperationV1;
  readonly sourceTeamIds: readonly AgentPlatID[];
  readonly targetTeams: readonly TeamTopologyNodeV1[];
  readonly priorTopology: readonly TeamTopologyNodeV1[];
  readonly priorTopologyDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly quorumDigest: PlanningDigestV1;
  readonly requestedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface TeamTopologyTransformationV1 {
  readonly schemaVersion: 1;
  readonly transformationId: AgentPlatID;
  readonly operation: TeamTopologyOperationV1;
  readonly sourceTeamIds: readonly AgentPlatID[];
  readonly targetTeams: readonly TeamTopologyNodeV1[];
  readonly priorTopology: readonly TeamTopologyNodeV1[];
  readonly priorTopologyDigest: PlanningDigestV1;
  readonly nextTopologyDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly quorumDigest: PlanningDigestV1;
  readonly epoch: number;
  readonly status: TeamTopologyStatusV1;
  readonly rollbackOfTransformationId: AgentPlatID | null;
  readonly transformationDigest: PlanningDigestV1;
}

export interface TeamTopologyStateV1 {
  readonly format: typeof TEAM_TOPOLOGY_TRANSFORMATION_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly topologyId: AgentPlatID;
  readonly epoch: number;
  readonly topology: readonly TeamTopologyNodeV1[];
  readonly transformations: readonly TeamTopologyTransformationV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

const digest = (domain: string, value: unknown): PlanningDigestV1 =>
  digestPlanningJsonV1(domain as never, value as never);

function nodeDigest(node: Omit<TeamTopologyNodeV1, "nodeDigest">): PlanningDigestV1 {
  return digest("team-topology-node", node);
}

function topologyDigest(nodes: readonly TeamTopologyNodeV1[]): PlanningDigestV1 {
  return digest(
    "team-topology",
    nodes.map(({ nodeDigest: _digest, ...node }) => ({ ...node, nodeDigest: nodeDigest(node) })),
  );
}

function assertDigest(value: unknown, label: string): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} must be a sha256 digest`);
}

function assertId(value: unknown, label: string): asserts value is AgentPlatID {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function validateNode(node: TeamTopologyNodeV1): TeamTopologyNodeV1 {
  assertId(node.teamId, "team ID");
  if (!Array.isArray(node.parentTeamIds) || !Array.isArray(node.memberIds))
    throw new TypeError("topology node membership is invalid");
  if (!Number.isSafeInteger(node.membershipEpoch) || node.membershipEpoch < 1)
    throw new TypeError("topology node membership epoch is invalid");
  assertDigest(node.membershipConfigurationDigest, "membership configuration digest");
  for (const id of [...node.parentTeamIds, ...node.memberIds]) assertId(id, "topology member ID");
  if (node.coordinatorId !== null) assertId(node.coordinatorId, "coordinator ID");
  const expected = nodeDigest({
    teamId: node.teamId,
    parentTeamIds: node.parentTeamIds,
    memberIds: node.memberIds,
    coordinatorId: node.coordinatorId,
    membershipEpoch: node.membershipEpoch,
    membershipConfigurationDigest: node.membershipConfigurationDigest,
  });
  if (node.nodeDigest !== expected) throw new TypeError("topology node digest is invalid");
  return node;
}

export function createTeamTopologyStateV1(input: {
  readonly topologyId: AgentPlatID;
  readonly epoch: number;
  readonly topology: readonly TeamTopologyNodeV1[];
  readonly transformations?: readonly TeamTopologyTransformationV1[];
  readonly predecessorStateDigest?: PlanningDigestV1 | null;
}): TeamTopologyStateV1 {
  assertId(input.topologyId, "topology ID");
  if (!Number.isSafeInteger(input.epoch) || input.epoch < 1) throw new TypeError("topology epoch is invalid");
  const topology = input.topology.map(validateNode);
  const seen = new Set<string>();
  for (const node of topology) {
    if (seen.has(node.teamId)) throw new TypeError("topology team ID is duplicated");
    seen.add(node.teamId);
  }
  const predecessorStateDigest = input.predecessorStateDigest ?? null;
  if (predecessorStateDigest !== null) assertDigest(predecessorStateDigest, "predecessor state digest");
  const body = { topologyId: input.topologyId, epoch: input.epoch, topology, transformations: input.transformations ?? [], predecessorStateDigest };
  return Object.freeze({
    format: TEAM_TOPOLOGY_TRANSFORMATION_STATE_FORMAT_V1,
    schemaVersion: 1,
    ...body,
    stateDigest: digest("team-topology-state", body),
  });
}

export function validateTeamTopologyTransformationRequestV1(input: TeamTopologyTransformationRequestV1): TeamTopologyTransformationRequestV1 {
  if (input.schemaVersion !== 1) throw new TypeError("topology transformation schema is invalid");
  assertId(input.transformationId, "transformation ID");
  if (!["split", "merge", "federate"].includes(input.operation)) throw new TypeError("topology operation is invalid");
  if (!Array.isArray(input.sourceTeamIds) || input.sourceTeamIds.length < 1) throw new TypeError("source teams are required");
  input.sourceTeamIds.forEach((id) => assertId(id, "source team ID"));
  input.targetTeams.forEach(validateNode);
  if (input.operation === "split" && input.targetTeams.length < 2) throw new TypeError("split requires at least two target teams");
  if ((input.operation === "merge" || input.operation === "federate") && input.sourceTeamIds.length < 2) throw new TypeError(`${input.operation} requires at least two source teams`);
  assertDigest(input.priorTopologyDigest, "prior topology digest");
  assertDigest(input.policyDigest, "policy digest");
  assertDigest(input.quorumDigest, "quorum digest");
  if (!Number.isSafeInteger(input.requestedAtLogicalMs) || input.validUntilLogicalMs <= input.requestedAtLogicalMs) throw new TypeError("topology request time window is invalid");
  const { requestDigest: _digest, ...body } = input;
  if (input.requestDigest !== digest("team-topology-request", body)) throw new TypeError("topology request digest is invalid");
  return input;
}

export function createTeamTopologyTransformationRequestV1(input: Omit<TeamTopologyTransformationRequestV1, "schemaVersion" | "requestDigest">): TeamTopologyTransformationRequestV1 {
  const body = { schemaVersion: 1 as const, ...input };
  return Object.freeze({ ...body, requestDigest: digest("team-topology-request", body) });
}

export function certifyTeamTopologyTransformationV1(input: { readonly state: TeamTopologyStateV1; readonly request: TeamTopologyTransformationRequestV1; }): TeamTopologyStateV1 {
  validateTeamTopologyTransformationRequestV1(input.request);
  if (input.request.priorTopologyDigest !== topologyDigest(input.state.topology)) throw new TypeError("topology request is based on a stale topology");
  const nextTopologyDigest = topologyDigest(input.request.targetTeams);
  const transformationBody = {
    schemaVersion: 1 as const,
    transformationId: input.request.transformationId,
    operation: input.request.operation,
    sourceTeamIds: input.request.sourceTeamIds,
    targetTeams: input.request.targetTeams,
    priorTopology: input.state.topology,
    priorTopologyDigest: input.request.priorTopologyDigest,
    nextTopologyDigest,
    policyDigest: input.request.policyDigest,
    quorumDigest: input.request.quorumDigest,
    epoch: input.state.epoch + 1,
    status: "certified" as const,
    rollbackOfTransformationId: null,
  };
  const transformation = Object.freeze({ ...transformationBody, transformationDigest: digest("team-topology-transformation", transformationBody) });
  return createTeamTopologyStateV1({ topologyId: input.state.topologyId, epoch: input.state.epoch, topology: input.state.topology, transformations: [...input.state.transformations, transformation], predecessorStateDigest: input.state.stateDigest });
}

export function activateTeamTopologyTransformationV1(input: { readonly state: TeamTopologyStateV1; readonly transformationId: AgentPlatID; }): TeamTopologyStateV1 {
  const transformation = input.state.transformations.find((item) => item.transformationId === input.transformationId);
  if (!transformation || transformation.status !== "certified") throw new TypeError("topology transformation is not certifiable");
  const activated = { ...transformation, status: "activated" as const, transformationDigest: "" as PlanningDigestV1 };
  const { transformationDigest: _digest, ...body } = activated;
  const updated = { ...activated, transformationDigest: digest("team-topology-transformation", body) };
  return createTeamTopologyStateV1({ topologyId: input.state.topologyId, epoch: transformation.epoch, topology: transformation.targetTeams, transformations: input.state.transformations.map((item) => item.transformationId === transformation.transformationId ? updated : item), predecessorStateDigest: input.state.stateDigest });
}

/** Records a compensating transition and restores the topology pinned by the prior digest. */
export function rollbackTeamTopologyTransformationV1(input: { readonly state: TeamTopologyStateV1; readonly transformationId: AgentPlatID; }): TeamTopologyStateV1 {
  const transformation = input.state.transformations.find((item) => item.transformationId === input.transformationId);
  if (!transformation || transformation.status !== "activated") throw new TypeError("only an activated topology transformation can be rolled back");
  const rollbackBody = {
    schemaVersion: 1 as const,
    transformationId: `${transformation.transformationId}:rollback` as AgentPlatID,
    operation: transformation.operation,
    sourceTeamIds: transformation.targetTeams.map((team) => team.teamId),
    targetTeams: transformation.priorTopology,
    priorTopologyDigest: transformation.nextTopologyDigest,
    nextTopologyDigest: transformation.priorTopologyDigest,
    policyDigest: transformation.policyDigest,
    quorumDigest: transformation.quorumDigest,
    epoch: input.state.epoch + 1,
    status: "rolled_back" as const,
    rollbackOfTransformationId: transformation.transformationId,
  };
  const rollback = Object.freeze({ ...rollbackBody, transformationDigest: digest("team-topology-transformation", rollbackBody) });
  const marked = input.state.transformations.map((item) => item.transformationId === transformation.transformationId ? { ...item, status: "rolled_back" as const } : item);
  return createTeamTopologyStateV1({ topologyId: input.state.topologyId, epoch: rollback.epoch, topology: transformation.priorTopology, transformations: [...marked, rollback], predecessorStateDigest: input.state.stateDigest });
}
