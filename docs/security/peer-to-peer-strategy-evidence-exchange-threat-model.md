# Peer-to-peer strategy evidence exchange V1 threat model

## Protected assets

- immutable local strategy catalog, adaptation policy and safe baseline;
- exact scope, operation, strategy implementation, membership epoch and
  producer identity bindings;
- confidentiality of prompts, model outputs, credentials and raw control
  evidence;
- Trust and membership eligibility, source independence and source revisions;
- causal continuity, logical-time high-water marks and duplicate suppression;
- bounded gossip resources, aggregate-prior integrity and local sovereignty;
- persisted state and predecessor-bound handoff continuity.

## Trust boundaries

The runtime trusts its configured exchange policy, identity verifier,
membership and Trust adapters, sparse-overlay transport boundary and atomic
state store. Producers are not trusted merely because they publish an
attestation. An attestation becomes usable only after the receiving peer
independently validates its configured bindings and eligibility.

The evidence exchange does not trust remote peers to choose a local strategy,
interpret a local safety disposition or create planning, assignment, recovery,
action or effect authority. The local strategy adaptation controller and its
existing safety inputs remain separate required boundaries.

## Threats and controls

| Threat | Control | Failure behavior |
| --- | --- | --- |
| Sensitive payload disclosure | Closed content-free attestation schema and exact-key validation | Reject attestation |
| Producer impersonation | Authentication binding, identity verification and current membership epoch | Reject attestation |
| Cross-scope or cross-catalog replay | Exact scope, operation, catalog, policy and implementation bindings | Reject attestation |
| Stale or future evidence | Logical-time freshness window and high-water marks | Reject attestation |
| Duplicate or reordered propagation | Digest-bound idempotence plus bounded pending chains drained after predecessor admission | Retain once and converge |
| Source sequence rollback | Durable per-instance source heads | Reject attestation |
| Same-sequence equivocation | Durable active-incarnation quarantine and retained-source exclusion | No contribution until membership-mediated rotation |
| Sybil concentration | Membership eligibility, Trust gate and policy-bound source independence | Keep prior unavailable |
| Metric poisoning | Closed clipped metrics, confidence floor and deterministic robust reduction | Narrow or reject prior |
| Gossip amplification | Policy-bounded fanout, hop, age, retention and commit attempts | Drop envelope |
| State exhaustion | Bounded retained heads, suppression records and aggregate groups | Reject oversized input |
| Instance churn exhaustion | One durable head per peer; only a newer membership epoch may rotate instance/stream in place | Preserve head capacity |
| Restart rollback | CAS persistence, predecessor digest and logical-time high-water | Reject older state/input |
| Handoff fork | Empty-target CAS import and exact predecessor binding | Idempotent import or conflict |
| Remote control escalation | Advisory-only adapter; local catalog, baseline and safety controls remain final | Existing local control vetoes |

## Safety properties

1. A remote record cannot create or execute a local strategy implementation.
2. A collective prior cannot widen a local safety disposition or grant
   planning, assignment, recovery, action or effect authority.
3. A usable prior binds one exact scope, operation, catalog, policy and
   strategy implementation.
4. No prior is emitted without the policy-required number of independent,
   eligible and current sources.
5. Duplicate, stale, replayed, equivocal or out-of-scope evidence cannot
   increase a strategy's influence.
6. Propagation and retained state are bounded by policy rather than network
   size or sender behavior.
7. Local safe baselines, quarantine, pause and required safety vetoes remain
   effective regardless of remote evidence.
8. State and handoffs retain no prompt, model output, credential, raw Trust
   evidence or hidden model reasoning.

## Residual risks and non-goals

- A sufficiently large cohort of independent but compromised eligible sources
  can produce structurally valid misleading evidence. Deployments should use
  independent source authorities and protect identity and Trust inputs.
- The exchange provides bounded dissemination and robust aggregation, not a
  proof that all peers reach the same strategy distribution or an optimal
  global strategy.
- Partitions and incomplete membership state can prevent a prior from being
  available; the intended result is local-only adaptation or abstention, not
  relaxed validation.
- V1 does not distribute a trained model, build a universal reputation score,
  execute a remote strategy or impose a global scheduler.

## Required verification

- strict attestation, policy, envelope, prior, state and handoff tamper
  rejection;
- identity, epoch, scope, catalog, policy, implementation, causal, expiry and
  sequence admission checks;
- duplicate, reordering, replay, source rollback and equivocation cases;
- fanout, hop, age, retention and state-bound enforcement;
- source independence, Trust gating, robust reduction and poisoned-source
  resistance;
- advisory adapter narrowing and local baseline, quarantine, pause and
  authority-veto preservation;
- CAS retry, restart and predecessor-bound handoff behavior; and
- public type, browser traversal, audit and packed-consumer checks.
