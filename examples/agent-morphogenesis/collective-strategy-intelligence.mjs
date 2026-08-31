import { createHash } from "node:crypto";

import {
  createMorphogenesisStrategyCollectiveSyncAdapterV4,
  createMorphogenesisStrategyIntelligencePolicyV4,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  InMemoryPeerStrategyEvidenceStoreV1,
  createPeerStrategyEvidenceExchangePolicyV1,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";

const digest = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const intelligencePolicy = createMorphogenesisStrategyIntelligencePolicyV4({
  schemaVersion: 4,
  policyId: "policy:morphogenesis-intelligence:example",
  policyVersion: 1,
  tenantId: "tenant:example",
  meshId: "mesh:example",
  policyDomainId: "policy-domain:example",
  catalogDigest: digest("catalog:v3"),
  morphogenesisPolicyDigest: digest("morphogenesis-policy"),
  admittedContextClassDigests: [digest("context-class:planning")],
  maximumAttestationTtlMs: 60_000,
});
const evidencePolicy = createPeerStrategyEvidenceExchangePolicyV1({
  schemaVersion: 1,
  policyId: "policy:strategy-evidence:example",
  policyVersion: 1,
  parentPolicyDigest: null,
  feedbackSchemaDigest: digest("morphogenesis-feedback-schema:v4"),
  minimumDistinctPeers: 3,
  minimumDistinctIndependenceGroups: 3,
  minimumConfidenceBps: 8_000,
  maximumPriorInfluenceBps: 1_000,
  limits: {
    maximumAttestations: 128, maximumAttestationsPerPeer: 8,
    maximumSourceHeads: 128, maximumCertificates: 32,
    maximumFeedbackSignalDigests: 16, maximumAttestationTtlMs: 60_000,
    maximumFutureSkewMs: 1_000, maximumReasonCodesPerDecision: 8,
    maximumCommitAttempts: 4, maximumGossipFanout: 4, maximumGossipHops: 3,
  },
});
const sync = createMorphogenesisStrategyCollectiveSyncAdapterV4({
  policy: intelligencePolicy,
});
const store = new InMemoryPeerStrategyEvidenceStoreV1(evidencePolicy);

console.log(JSON.stringify({
  intelligencePolicyDigest: intelligencePolicy.policyDigest,
  evidencePolicyDigest: evidencePolicy.policyDigest,
  syncDomain: "agentplat.peer-strategy-evidence.v1",
  localStore: store.constructor.name,
  semantics: "content-free evidence; bounded advice; local governance",
  next: "sign a V4 outcome, project it with sync.toRecord, gossip it, then admitFromMesh locally",
  adapterReady: typeof sync.toRecord === "function",
}, null, 2));
