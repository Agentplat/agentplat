# `@agentplat/collective-quorum`

Signed, provider-neutral peer quorum protocols for `CollectivePeerNodeRuntimeV1`.
The package supplies the two production ports that the peer node deliberately
leaves open:

- assignment confirmation requires a semantic attestation from the owner and
  a strict majority of configured witnesses over the same acceptance, lease,
  assignment epoch and fencing token;
- recovery election uses durable `prepare`/`promise` and `accept`/`accepted`
  phases. Every acceptor promises and votes atomically, so a restart cannot
  erase the information that prevents a conflicting decision.

Every request and response is an Ed25519-signed canonical JSON document bound
to tenant, mesh, peer, process instance, audience and expiry. The package
reuses the Mesh key resolver, but has an independent protocol envelope and does
not change the closed Mesh wire-version contract.

## Composition

Create one repository, client and acceptor endpoint per peer. The client is a
per-operation proposer, not a permanent leader.

```ts
import {
  CollectivePeerQuorumHostV1,
  CollectiveQuorumHttpTransportV1,
} from "@agentplat/collective-quorum";

const transport = new CollectiveQuorumHttpTransportV1({
  endpointForPeer: (peerId) => peerEndpoints.get(peerId),
});

const host = CollectivePeerQuorumHostV1.create({
  client: { scope, signing, resolver, repository, transport, clock },
  peer: { scope, signing, resolver, repository, clock },
  createNode: ({ assignmentConfirmation, recoveryElection }) =>
    new CollectivePeerNodeRuntimeV1({
      ...nodeOptions,
      assignmentConfirmation,
      recoveryElection,
    }),
});
```

Expose `host.quorumPeer` with `handleCollectiveQuorumHttpRequestV1`, or provide
another implementation of `CollectiveQuorumTransportV1`. The WHATWG Fetch
adapter is usable in Node and edge runtimes. Authentication of the transport
channel may be added by the host, but it never replaces document signature
verification.

For a durable deployment, use
`PostgresCollectiveQuorumRepositoryV1` from
`@agentplat/collective-quorum-postgres`. The in-memory repository has identical
atomic semantics but loses promises and votes when the process exits.

## Byzantine-resilient agreement (opt in)

Deployments whose admitted-validator fault model includes arbitrary or
malicious behavior can use the separate
`@agentplat/collective-quorum/agreement` entry point. It adds `3f + 1`
membership bindings, `2f + 1` prevote/precommit certificates, durable locks,
equivocation evidence, joint reconfiguration and certified catch-up. Importing
or using the root entry point does not enable or alter this protocol.

See
[Byzantine-resilient collective agreement V1](../../docs/agent-mesh/byzantine-resilient-collective-agreement-v1.md)
for integration and operations guidance.

The `@agentplat/collective-quorum/role-realignment` entry point maps a
content-free role selection to the same agreement protocol. Its certificate
binds membership epoch and configuration, and only Trust-eligible precommit
signers count as role-certification witnesses. Agreement never transports role
instructions or grants action authority. See [Adaptive Role Realignment
V1](../../docs/inference-control/adaptive-role-realignment-v1.md).

The `@agentplat/collective-quorum/collective-decision` entry point adapts a
cryptographically verified agreement commit to the generic certified-decision
port in `@agentplat/collective-runtime`. It requires an exact current membership
match, derives the decision slot from scope, kind and epoch, and retains the
agreement certificate digest plus sorted precommit attesters. The adapter never
loads the external decision payload and does not grant effect authority. Its
required agreement repository re-resolves the exact persisted commit whenever a
decision is committed or restored, so a caller-supplied proof digest cannot
bypass cryptographic verification.

## Collective trust consensus (opt in)

`@agentplat/collective-quorum/trust-consensus` certifies one scoped Trust
decision through the Byzantine agreement protocol. A candidate binds exact
subject, scope, policy, profile, fusion input, local eligibility, predecessor
and validity digests. It contains no evidence content, prompts, instructions or
action parameters.

Every validator resolves the candidate against its own trusted local state
before voting. A successful commit is projected into a
`CertifiedCollectiveTrustDecisionV1` bound to the exact membership epoch,
configuration and sorted precommit witnesses. Agreement proves that a quorum
accepted the same bounded projection; it does not prove universal truth.

```ts
import {
  InMemoryCollectiveTrustDecisionRepositoryV1,
  createCollectiveTrustAgreementSemanticPortV1,
  createCollectiveTrustCandidateV1,
  createCollectiveTrustCertificationPortV1,
} from "@agentplat/collective-quorum/trust-consensus";

const decisions = new InMemoryCollectiveTrustDecisionRepositoryV1();
const candidate = await createCollectiveTrustCandidateV1({
  tenantId,
  profile,
  fusionDecision,
  eligibilityDecision,
  previousCertifiedDecisionDigest: null,
  validUntilLogicalMs,
});

const semantics = createCollectiveTrustAgreementSemanticPortV1({
  policyDomainId,
  heads: decisions,
  candidates: {
    validate: ({ candidate }) => localCandidateResolver.validate(candidate),
  },
  fallback: otherAgreementSemantics,
});

const certification = createCollectiveTrustCertificationPortV1({
  policyDomainId,
  agreement,
  membership,
  coordinates,
  repository: decisions,
  resolver: keyResolver,
  clock,
});

const certified = await certification.certify({
  candidate,
  logicalTimeMs,
});
```

Each independently hosted validator installs `semantics` and calls
`applyCollectiveTrustCommitV1` for observed commits. The latter verifies the
complete certificate and reconstructs the same derived head after restart.

Existing eligibility consumers can be wrapped without changing their input or
return type:

```ts
import { createCollectiveTrustEligibilityFilterV1 } from "@agentplat/collective-quorum/trust-consensus";

const filteredEligibility = createCollectiveTrustEligibilityFilterV1({
  tenantId: (request) => request.tenantId,
  logicalTimeMs: (request) => request.logicalTimeMs,
  local: existingEligibilityPort,
  collective: currentCertifiedDecisionResolver,
  policy: { schemaVersion: 1, requireCertificate: true },
});
```

The filter returns the original local decision only when both boundaries admit
it. A collective decision may restrict or quarantine but can never promote a
locally unavailable, restricted or quarantined subject. A
`recovery_candidate` remains restricted until a separate local recovery policy
succeeds.

Mesh allocation and Inference Control perform their last eligibility lookup
synchronously. Use `createCollectiveTrustMeshEligibilityResolverV1` and
`createCollectiveTrustInferenceEligibilityResolverV1` with a locally refreshed
cache of verified gate decisions. Neither adapter performs I/O in the final
selection or pre-delegation checkpoint, and both preserve a stricter local
result.

See the [implementation
plan](../../docs/trust/collective-trust-consensus-v1-implementation-plan.md),
[acceptance
checklist](../../docs/trust/collective-trust-consensus-v1-acceptance-checklist.md),
[architecture decision](../../docs/adr/0018-collective-trust-consensus.md) and
[threat model](../../docs/security/collective-trust-consensus-threat-model.md).

Run the complete four-validator reference path locally with:

```sh
pnpm example:collective-trust-consensus
```

## Safety and availability

- Witness thresholds must be strict majorities. Duplicate witnesses, owners or
  assignees in the witness set are rejected.
- An acceptor signs at most one value for a ballot and never accepts a ballot
  below its durable promise.
- A new proposer carries forward the value with the highest previously
  accepted ballot returned by its promise quorum.
- Assignment attestations are non-equivocating per lease version.
- Invalid signatures, wrong audiences, expired envelopes, missing semantic
  evidence and minority partitions fail closed.
- When the optional readiness port is configured, an acceptor refuses
  assignment attestations, recovery promises, and recovery acceptances until
  its local causal frontier has a current membership-bound catch-up
  certificate.
- Independent peers may assemble different proof sets for the same selected
  value. The node treats those certificates as semantically equivalent while
  each port validates its own threshold evidence.

The root protocol tolerates crashes, restarts, message loss, reordering and
minority partitions under an authenticated non-Byzantine acceptor model. It is
not itself a Byzantine-fault-tolerant consensus protocol; use the opt-in
agreement entry point for that fault model. Neither protocol discovers peer
endpoints or makes external actions exactly once. Certified dynamic
membership and overlapping key rotation are available through the optional
membership port implemented by `@agentplat/collective-membership`.

See [Distributed Peer Quorum V1](../../docs/agent-mesh/distributed-peer-quorum-v1.md)
for the state machines and operational invariants.
