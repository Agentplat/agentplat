import assert from "node:assert/strict";

import {
  PEER_STRATEGY_EVIDENCE_GOSSIP_TOPIC_V1,
  createPeerStrategyEvidenceBindingV1,
  createPeerStrategyEvidenceCohortV1,
  createPeerStrategyEvidenceExchangePolicyV1,
  fromMeshSparseDigestV2,
  toMeshSparseDigestV2,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";

const digest = (character) => `sha256:${character.repeat(64)}`;

const cohort = createPeerStrategyEvidenceCohortV1({
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission-intent",
  objectiveId: "objective",
  contextClassDigest: digest("a"),
});
const binding = createPeerStrategyEvidenceBindingV1({
  operation: "offer_routing",
  strategyId: "safe-baseline",
  strategyDigest: digest("b"),
  implementationDigest: digest("c"),
  feedbackSchemaDigest: digest("d"),
});
const policy = createPeerStrategyEvidenceExchangePolicyV1({
  schemaVersion: 1,
  policyId: "evidence-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  feedbackSchemaDigest: digest("d"),
  minimumDistinctPeers: 2,
  minimumDistinctIndependenceGroups: 2,
  minimumConfidenceBps: 8_000,
  maximumPriorInfluenceBps: 2_000,
  limits: {
    maximumAttestations: 8,
    maximumAttestationsPerPeer: 2,
    maximumSourceHeads: 8,
    maximumCertificates: 4,
    maximumFeedbackSignalDigests: 8,
    maximumAttestationTtlMs: 60_000,
    maximumFutureSkewMs: 1_000,
    maximumReasonCodesPerDecision: 4,
    maximumCommitAttempts: 2,
    maximumGossipFanout: 3,
    maximumGossipHops: 3,
  },
});

assert.match(cohort.cohortDigest, /^sha256:[0-9a-f]{64}$/u);
assert.match(binding.bindingDigest, /^sha256:[0-9a-f]{64}$/u);
assert.match(policy.policyDigest, /^sha256:[0-9a-f]{64}$/u);
assert.equal(PEER_STRATEGY_EVIDENCE_GOSSIP_TOPIC_V1, "peer-strategy-evidence.v1");
assert.equal(fromMeshSparseDigestV2(toMeshSparseDigestV2(digest("e"))), digest("e"));
