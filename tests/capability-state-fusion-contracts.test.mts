import {
  CapabilityStateFusionRuntimeV1,
  InMemoryCapabilityStateStoreV1,
  createCapabilityStateCandidateV1,
  createCapabilityStateFusionRequestV1,
  createCapabilityStatePolicyV1,
  createCapabilityStateResolutionPortV1,
  type CapabilityStateFusionDecisionV1,
  type CapabilityStateFusionPortV1,
  type CapabilityStateFusionRequestV1,
  type CapabilityStateSignalSourceV1,
} from "@agentplat/collective-runtime/capability-state";
import type { CollectivePeerNodeRuntimeConfigV1 } from "@agentplat/collective-runtime/node";

const policy = createCapabilityStatePolicyV1({
  schemaVersion: 1,
  policyId: "policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  requiredDimensions: {
    offer_recipient: ["capacity", "reachability", "trust"],
    bid: ["capacity", "role", "trust"],
    award: ["capacity", "reachability", "trust"],
    assignment_acceptance: ["capacity", "role", "trust"],
    recovery: ["capacity", "reachability", "recovery", "role", "trust"],
  },
  maximumCandidates: 16,
  maximumReasonCodesPerSignal: 8,
  maximumStateHeads: 128,
  maximumDecisionTtlMs: 1_000,
  maximumCommitAttempts: 4,
});

declare const source: CapabilityStateSignalSourceV1;
declare const nodeConfig: CollectivePeerNodeRuntimeConfigV1;
declare const requestInput: CapabilityStateFusionRequestV1;

const runtime: CapabilityStateFusionPortV1 = new CapabilityStateFusionRuntimeV1(
  {
    stateKey: "state",
    fusionId: "fusion",
    fusionVersion: 1,
    implementationId: "implementation",
    policy,
    resolver: createCapabilityStateResolutionPortV1({ sources: [source] }),
    store: new InMemoryCapabilityStateStoreV1(policy),
  },
);

const candidate = createCapabilityStateCandidateV1;
const request = createCapabilityStateFusionRequestV1;
const configured: CollectivePeerNodeRuntimeConfigV1 = {
  ...nodeConfig,
  capabilityState: runtime,
};
const decision: Promise<CapabilityStateFusionDecisionV1> =
  runtime.evaluate(requestInput);

void candidate;
void configured;
void decision;
