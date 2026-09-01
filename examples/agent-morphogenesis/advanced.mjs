import { createHash } from "node:crypto";

import {
  InMemoryMorphogenesisOperatorExecutionStoreV2,
  MorphogenesisOperatorExecutionRuntimeV2,
  compileMorphogenesisOperatorV2,
  createMorphogenesisOperationV1,
  createMorphogenesisPolicyV1,
  createMorphogenesisPolicyV2,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  createTeamTopologyNodeV1,
  createTeamTopologyStateV1,
  createTeamTopologyTransformationRequestV1,
  teamTopologyDigestV1,
} from "@agentplat/collective-runtime";
import {
  InMemoryMorphogenesisTeamTopologyStateStoreV2,
  TeamTopologyMorphogenesisBoundaryV2,
} from "@agentplat/collective-host/morphogenesis-operator-adapters";

const digest = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const baselineRecord = createMorphogenesisPolicyV1({
  schemaVersion: 1,
  policyId: "policy:advanced-example",
  policyVersion: 1,
  parentPolicyDigest: null,
  requiredSourceClasses: ["mission", "membership", "team", "work"],
  allowedOperators: ["recruit_existing"],
  allowedDecisionRoutes: ["authorized_agent", "authorized_person", "collective"],
  requireIndependentDecider: true,
  allowAgentCreation: false,
  maximumPopulation: 16,
  maximumNewAgentsPerProposal: 0,
  maximumResourceUnitsPerProposal: 100,
  minimumNeedSeverityBps: 5_000,
  limits: {
    maximumSourceHeads: 16,
    maximumComponents: 64,
    maximumPositions: 16,
    maximumAgentDispositions: 16,
    maximumOperations: 16,
    maximumDependenciesPerOperation: 8,
    maximumEvidenceDigests: 16,
    maximumInvariantDigests: 16,
    maximumProposalTtlMs: 1_000,
    maximumNeedTtlMs: 1_000,
    maximumSourceFreshnessMs: 1_000,
    maximumCommitAttempts: 4,
    maximumTransformationsPerWindow: 4,
    transformationWindowMs: 10_000,
    cooldownMs: 0,
    hysteresisBps: 0,
  },
});
const baseline = baselineRecord.policy;

const policy = createMorphogenesisPolicyV2({
  ...baseline,
  schemaVersion: 2,
  allowedOperators: [...baseline.allowedOperators, "split_team"].sort(),
  enabledAdvancedCapabilities: ["team_topology_transformations"],
  maximumDerivedAgentsPerProposal: 0,
  maximumSynthesizedAgentsPerProposal: 0,
  maximumRoleChangesPerProposal: 0,
  maximumWorkReassignmentsPerProposal: 0,
  maximumReplacementsPerProposal: 0,
  maximumSuspensionsPerProposal: 0,
  maximumTopologyOperationsPerProposal: 1,
  maximumCreationDepth: 0,
});

const source = createTeamTopologyNodeV1({
  teamId: "team:advanced:source",
  parentTeamIds: [],
  memberIds: ["agent:forensics", "agent:triage"],
  coordinatorId: "agent:forensics",
  membershipEpoch: 1,
  membershipConfigurationDigest: digest("membership:1"),
});
const targets = [
  createTeamTopologyNodeV1({
    teamId: "team:advanced:forensics",
    parentTeamIds: [source.teamId],
    memberIds: ["agent:forensics"],
    coordinatorId: "agent:forensics",
    membershipEpoch: 2,
    membershipConfigurationDigest: digest("membership:2"),
  }),
  createTeamTopologyNodeV1({
    teamId: "team:advanced:triage",
    parentTeamIds: [source.teamId],
    memberIds: ["agent:triage"],
    coordinatorId: "agent:triage",
    membershipEpoch: 2,
    membershipConfigurationDigest: digest("membership:2"),
  }),
];
const topology = createTeamTopologyStateV1({
  topologyId: "topology:advanced-example",
  epoch: 1,
  topology: [source],
});
const request = createTeamTopologyTransformationRequestV1({
  transformationId: "transformation:advanced-example:split",
  operation: "split",
  sourceTeamIds: [source.teamId],
  targetTeams: targets,
  priorTopologyDigest: teamTopologyDigestV1(topology.topology),
  policyDigest: policy.policyDigest,
  quorumDigest: digest("quorum-certificate"),
  requestedAtLogicalMs: 100,
  validUntilLogicalMs: 1_000,
});
const operation = createMorphogenesisOperationV1({
  operationId: "operation:advanced-example:split",
  operator: "split_team",
  effectClass: "protected_external",
  dependsOnOperationIds: [],
  targetReferenceDigest: request.requestDigest,
  compensation: "restore_predecessor_before_commit",
}, policy);
const plan = compileMorphogenesisOperatorV2({
  planId: "plan:advanced-example:split",
  operation,
  policy,
  binding: {
    operator: "split_team",
    transformationRequestDigest: request.requestDigest,
    topologyPolicyDigest: policy.policyDigest,
  },
  compilerId: "compiler:advanced-example",
  compilerVersion: 1,
  compilerImplementationDigest: digest("compiler"),
  compiledAtLogicalMs: 110,
});

const topologyStore = new InMemoryMorphogenesisTeamTopologyStateStoreV2([topology]);
const runtime = new MorphogenesisOperatorExecutionRuntimeV2({
  store: new InMemoryMorphogenesisOperatorExecutionStoreV2(),
  boundaries: new TeamTopologyMorphogenesisBoundaryV2({
    store: topologyStore,
    requests: { async resolve(value) {
      return value === request.requestDigest
        ? { topologyId: topology.topologyId, request }
        : null;
    } },
  }),
});
let state = await runtime.initialize({
  stateKey: "operator-execution:advanced-example",
  scopeDigest: digest("scope"),
  plan,
  proposalDigest: digest("proposal"),
  decisionDigest: digest("decision-by-agent-person-or-quorum"),
  authorizationDigest: digest("authorization"),
  authorityFenceDigest: digest("authority-fence"),
  expectedMorphologyEpoch: 1,
  logicalTimeMs: 120,
});
while (state.status !== "completed")
  state = await runtime.advance({
    stateKey: state.stateKey,
    logicalTimeMs: 130 + state.revision,
  });
const activated = await topologyStore.load(topology.topologyId);

console.log(JSON.stringify({
  exampleOnly: true,
  operator: plan.operator,
  executionStatus: state.status,
  stepReceipts: state.receipts.map(({ boundary, resultDigest }) => ({ boundary, resultDigest })),
  topologyEpoch: activated.epoch,
  teamIds: activated.topology.map(({ teamId }) => teamId),
}, null, 2));
