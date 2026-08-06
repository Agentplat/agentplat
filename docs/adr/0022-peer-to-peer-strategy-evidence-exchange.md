# ADR 0022: Peer strategy evidence informs but never controls local adaptation

- Status: accepted
- Date: 2026-08-06

## Context

Local strategy adaptation permits a peer to learn among its immutable,
catalog-bound implementations from causal and source-bound outcomes. That
learning remains intentionally peer-local. A useful outcome observed by one
peer therefore cannot improve another peer's local prior without an
application-specific integration.

Sharing raw prompts, model outputs, implementation code, model weights or
caller-selected rewards would create confidentiality, compatibility and
authority risks. Letting remote evidence directly select a local strategy
would also bypass the local catalog, safety disposition, baseline and
control-plane vetoes. A global learner or coordinator would add a shared
failure domain and erase differences between peer-local conditions.

## Decision

Add the opt-in, provider-neutral
`@agentplat/collective-runtime/strategy-evidence-exchange` entry point.

Peers publish only content-free, authenticated strategy-outcome attestations.
Each record binds the complete scope, operation, local strategy catalog and
policy, strategy implementation digest, membership epoch, producer identity,
source sequence, causal predecessor and bounded outcome metrics. A receiver
requires current membership and Trust eligibility, exact scope compatibility,
source independence and monotonic causal sequence before it can use an
attestation. Same-sequence equivocation quarantines the issuer's active
incarnation and removes its retained contribution.

Propagation uses bounded sparse-overlay gossip with deterministic duplicate
suppression, hop and fanout limits. The exchange reducer derives a collective
strategy prior with a policy-defined robust aggregation rule and a minimum
independent-source threshold. Stale, future-dated, replayed, equivocating or
insufficient evidence cannot produce usable positive influence. Conservative
aggregate outcomes remain visible as evidence; only favorable certified
outcomes may affect the bounded local probability mix.

The resulting prior is advisory input for the local strategy adaptation
controller. It cannot change the local catalog or policy, execute an
implementation, select a strategy, grant authority, widen a safety
disposition, remove a quarantine or override a safe baseline. Local safety
and authority controls remain the final decision boundary.

State is bounded and persisted through compare-and-swap. Snapshots and
handoffs bind exact predecessor state digests, logical-time high-water marks,
membership epoch heads and retained attestation identities.

## Consequences

- Peers can make independent local adaptation decisions using evidence from
  other peers without requiring a global state service or coordinator.
- Healthy, independent evidence can improve a peer's initial local prior,
  while its own catalog, policy and safety boundaries remain sovereign.
- Partitions, missing membership state, unavailable Trust input, equivocation
  or insufficient independent evidence reduce availability to no prior rather
  than widening selection. Other conflicting outcomes are summarized by the
  conservative aggregation rule.
- Deployments must protect producer signing keys, membership and Trust
  adapters, the CAS store and sparse-overlay transport.
- Existing peers and adaptation behavior remain unchanged until an application
  constructs the exchange runtime and explicitly supplies its prior to local
  adaptation.

## Alternatives considered

### Replicate local adaptation weights between peers

Rejected because weights alone omit scope, implementation, source and causal
meaning, and would permit remote state to distort a peer's local policy.

### Use a central strategy service

Rejected because it creates a coordinator dependency and a shared failure
domain that is not required for evidence dissemination.

### Let remote peers invoke a local strategy dispatcher

Rejected because it turns evidence transport into a new authority path and
could bypass local safety, catalog and baseline controls.
