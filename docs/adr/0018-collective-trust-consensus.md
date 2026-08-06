# ADR 0018: Collective trust consensus

- Status: accepted
- Date: 2026-08-05

## Context

`@agentplat/trust` derives scoped profiles, eligibility and quarantine from an
exact local evidence graph. That local boundary intentionally provides no
global reputation or network authority. `@agentplat/collective-quorum` can
certify canonical application values despite up to `f` Byzantine validators,
but it does not define the semantic meaning or safe consumption of a collective
trust decision.

Planning, Mesh allocation, role selection and inference-control integrations
need an optional way to learn that a current validator quorum accepted the same
bounded trust decision. A signature count alone is insufficient: the result
must bind the subject, scope, policy, evidence projection, local eligibility
decision, membership epoch, predecessor, validity window and exact agreement
certificate. It must not turn consensus into truth, reputation into authority,
or remote acceptance into an override of stricter local Trust state.

## Decision

Add an opt-in `@agentplat/collective-quorum/trust-consensus` entry point.

### Candidate

A `CollectiveTrustCandidateV1` is a content-free projection of one locally
resolved Trust result. It binds:

- tenant, subject and scope digests;
- Trust policy ID, version and digest;
- profile and fusion-decision digests;
- local eligibility-decision and evidence-set digests;
- one closed disposition;
- the prior certified-decision digest, if any;
- observation and expiry logical times; and
- its own canonical digest-derived identifier.

The candidate carries no evidence content, model context, prompts, instructions,
raw scores or action parameters.

### Agreement

Add the canonical agreement value kind `trust_decision`. Each validator installs
an explicit semantic port that resolves the candidate from local trusted state
and checks every digest, validity bound, predecessor and disposition before
prevoting. Validators without the adapter abstain.

Agreement establishes that at least `2f + 1` validators accepted the exact
candidate under one `3f + 1` membership. It does not establish that the
candidate is universally true or optimal.

### Certified decision

A verified commit is projected deterministically into a
`CertifiedCollectiveTrustDecisionV1`. The projection retains the candidate
bindings, sorted precommit witness identities, membership epoch and
configuration digest, source commit digest, certification time, expiry and a
canonical decision digest.

Consecutive decisions form two chains:

1. the agreement value binds the previous commit digest; and
2. the candidate binds the previous certified-decision digest.

A missing, stale or substituted predecessor fails closed. Membership changes
continue to use Collective Agreement's joint reconfiguration certificate.

### Effective eligibility

Collective trust is a narrowing input. The effective result is the stricter of
the current local Trust decision and the current certified collective decision.

`quarantined` dominates `restricted`, which dominates `eligible`. `unavailable`
fails closed when the integration requires a certificate. A
`recovery_candidate` never restores eligibility by itself; it only permits a
separate local recovery policy to consider recovery.

The reusable eligibility filter returns the original local Trust decision only
when both boundaries admit the subject. It otherwise returns no eligible
decision. This makes the adapter compatible with existing candidate-filtering
ports without fabricating or mutating local Trust records.

### Durability and replay

The derived repository is revision checked and idempotent. A caller can rebuild
the same certified decision from a durable Collective Agreement commit and the
same candidate, so the commit remains the cryptographic source of truth.
Repository heads are convenience indexes, not independent authority.

## Consequences

- Existing Trust, Mesh, planning and inference-control defaults are unchanged.
- Applications gain a portable Byzantine-certified restriction signal.
- Coordination data remains content-free and bounded.
- An `eligible` certificate cannot widen a stricter local result.
- Progress may stop when healthy validators cannot resolve sufficiently
  compatible local evidence; safety takes precedence over forced convergence.
- Applications must retain or resolve the candidate artifact corresponding to a
  commit before applying the derived decision.

## Alternatives considered

### Replicate one global Trust database

Rejected because it introduces a centralized oracle, erases local evidence
boundaries and creates a high-value compromise point.

### Average peer scores

Rejected because correlated sources, Sybil identities and policy differences
make an arithmetic average neither independent nor authoritative.

### Treat any quorum certificate as permission

Rejected because collective agreement proves agreement, not action authority.
Certified trust remains an eligibility restriction and never replaces mandates,
assignments, grants, leases or fences.

### Copy raw evidence into the agreement value

Rejected because it expands disclosure, payload size and prompt-injection
surface. Validators resolve exact content locally and coordinate only digests.
