import {
  InMemoryPeerStrategyEvidenceStoreV1,
  PEER_STRATEGY_EVIDENCE_GOSSIP_TOPIC_V1,
  PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
  PeerStrategyEvidenceExchangeRuntimeV1,
  createPeerStrategyEvidenceAdvisoryPriorSourceV1,
  createPeerStrategyEvidenceBindingV1,
  createPeerStrategyEvidenceCohortV1,
  createPeerStrategyEvidenceExchangePolicyV1,
  createPeerStrategyEvidenceStateV1,
  createPeerStrategyEvidenceCollectiveSyncAdapterV1,
  fromMeshSparseDigestV2,
  publishPeerStrategyEvidenceGossipV1,
  receivePeerStrategyEvidenceGossipV1,
  toMeshSparseDigestV2,
  validatePeerStrategyEvidenceCertificateV1,
  validatePeerStrategyEvidenceHandoffV1,
  type PeerStrategyEvidenceAdvisoryPriorV1,
  type PeerStrategyEvidenceCertificateDecisionV1,
  type PeerStrategyEvidenceExchangePortV1,
  type PeerStrategyEvidencePolicyRecordV1,
  type PeerStrategyEvidenceRuntimeOptionsV1,
  type PeerStrategyEvidenceStateV1,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";
import type {
  CollectiveSyncDomainAdapterV1,
  CollectiveSyncRecordV1,
} from "@agentplat/collective-sync";
import type {
  PeerStrategyEvidenceCollectiveSyncDomainAdapterV1,
  PeerStrategyEvidenceSyncRecordV1,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";

void InMemoryPeerStrategyEvidenceStoreV1;
void PEER_STRATEGY_EVIDENCE_GOSSIP_TOPIC_V1;
void PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1;
void PeerStrategyEvidenceExchangeRuntimeV1;
void createPeerStrategyEvidenceAdvisoryPriorSourceV1;
void createPeerStrategyEvidenceBindingV1;
void createPeerStrategyEvidenceCohortV1;
void createPeerStrategyEvidenceExchangePolicyV1;
void createPeerStrategyEvidenceStateV1;
void createPeerStrategyEvidenceCollectiveSyncAdapterV1;
void fromMeshSparseDigestV2;
void publishPeerStrategyEvidenceGossipV1;
void receivePeerStrategyEvidenceGossipV1;
void toMeshSparseDigestV2;
void validatePeerStrategyEvidenceCertificateV1;
void validatePeerStrategyEvidenceHandoffV1;

declare const exchange: PeerStrategyEvidenceExchangePortV1;
declare const policy: PeerStrategyEvidencePolicyRecordV1;
declare const options: PeerStrategyEvidenceRuntimeOptionsV1;
declare const state: PeerStrategyEvidenceStateV1;
declare const prior: PeerStrategyEvidenceAdvisoryPriorV1;

const admission = exchange.admit(
  {} as Parameters<PeerStrategyEvidenceExchangePortV1["admit"]>[0],
);
const certificate: Promise<PeerStrategyEvidenceCertificateDecisionV1> =
  exchange.certify(
    {} as Parameters<PeerStrategyEvidenceExchangePortV1["certify"]>[0],
  );
const priors: Promise<readonly PeerStrategyEvidenceAdvisoryPriorV1[]> =
  exchange.resolvePriors(
    {} as Parameters<PeerStrategyEvidenceExchangePortV1["resolvePriors"]>[0],
  );

void policy;
void options;
void state;
void prior;
void admission;
void certificate;
void priors;

type AssertAssignable<T extends U, U> = true;
type EvidenceRecordIsCollectiveSyncRecord = AssertAssignable<
  PeerStrategyEvidenceSyncRecordV1,
  CollectiveSyncRecordV1
>;
type EvidenceDomainIsCollectiveSyncDomain = AssertAssignable<
  PeerStrategyEvidenceCollectiveSyncDomainAdapterV1,
  CollectiveSyncDomainAdapterV1
>;
const evidenceRecordIsCollectiveSyncRecord: EvidenceRecordIsCollectiveSyncRecord = true;
const evidenceDomainIsCollectiveSyncDomain: EvidenceDomainIsCollectiveSyncDomain = true;
void evidenceRecordIsCollectiveSyncRecord;
void evidenceDomainIsCollectiveSyncDomain;
