# Beta 3 increment 12: campaign readiness

## Objective

Increment 12 adds a provider-neutral, fail-closed decision surface for the
complete statistical campaign. It proves that the immutable operation can be
estimated and reviewed before an operator supplies infrastructure, credentials
or execution approval. It also closes the remaining local technical evidence
that can be established without running the campaign or publishing packages.

The increment does not execute the 240-cell/960-slot campaign, authorize an
execution, deploy infrastructure, publish packages, create a release tag or
call a paid model provider.

## Decision boundary

Readiness and authorization are separate state transitions:

1. A readiness plan binds an exact clean source, the registered adapter, the
   240-cell operation plan and a deterministic capacity ceiling.
2. Verification receipts establish the pre-authorization technical controls.
3. The assessment derives either `no_go` or
   `ready_for_operator_authorization`; callers cannot choose the result.
4. Every readiness artifact keeps `executionPermitted` and
   `fullCampaignPermitted` false.
5. A later protected operation must independently bind an operator-approved
   backend, rate card, credentials, authorization and the exact readiness
   digest before any campaign shard can run.

`ready_for_operator_authorization` therefore means that the repository-owned
technical prerequisites passed. It is not execution authority and it makes no
statistical or release claim.

## Fixed campaign and capacity envelope

The assessment revalidates, rather than restates, the registered operation:

- 240 cells and 960 first/replay slots;
- 48 shards of five cells and twenty slots;
- four strata and the exact 50/100/250/500 peer scale ladder;
- at most two concurrent shards;
- 3,296,000 event-derived interactions in the complete campaign;
- 100,000 trace events and 16 MiB of artifacts per execution;
- 96,000,000 trace events and 15 GiB of execution artifacts at the absolute
  registered per-slot ceiling; and
- 8,640 shard runner-minutes plus 170 readiness runner-minutes at the
  workflow timeout ceiling.

The time, event and byte figures are conservative capacity ceilings, not
forecasts. Monetary cost remains `requires_operator_rate_card`: the public
contract records billable units and cannot invent provider prices. The
currently registered deterministic runtime declares zero paid model calls.

## Public readiness contract

`@agentplat/collective-planning/evaluation` will expose immutable V1 contracts
for:

- the capacity estimate and its digest;
- one evidence receipt bound to an exact source and readiness plan;
- the readiness plan with the closed set of required controls; and
- the derived assessment, its unmet controls and its digest.

Validation rejects unknown fields, duplicate or missing controls, reordered
closed sets, mismatched source/plan/adapter commitments, malformed digests and
caller-selected recommendations. A passing receipt must contain a bounded,
content-addressed evidence reference. Pending and failed controls cannot be
relabelled as passing by adding arbitrary metadata.

The pre-authorization control set is:

1. immutable source and registered campaign plan;
2. bounded capacity estimate;
3. closed registered runner/evaluator separation;
4. bounded durable preflight closure;
5. Node 20 portable packed consumer;
6. Node 22 portable packed consumer;
7. PostgreSQL durable packed consumer;
8. ordinary-evidence privacy and canary coverage;
9. pre-dispatch evidence failure safety;
10. retention and indeterminate-effect safety;
11. production dependency audit with no unaccepted high or critical finding;
12. integrated replanning/race evidence required before the campaign.

Campaign-produced statistical outcomes and release-produced registry/tag
outcomes are enumerated separately. They never block the readiness
recommendation and cannot appear as pre-authorization evidence.

## Verification receipts

Receipts are small public summaries. They contain only identifiers, source and
plan commitments, bounded counts, status/reason codes and digests. They exclude
raw prompts, private reasoning, credentials, hidden world values,
unrestricted observations, database contents and process environments.

Each receipt is created only after its named command succeeds. The final
assessment accepts exactly one receipt for every required control, recomputes
every digest and rejects cross-source, cross-plan, duplicate, missing or extra
receipts. Failed or absent evidence produces `no_go` while still writing a
diagnostic assessment.

## Portable consumer evidence

Prepublication portability is checked from locally packed public tarballs, not
workspace links:

- Node 20 runs the complete packed portable consumer;
- Node 22 runs the same plain-ESM npm consumer surface; and
- Node 20 plus PostgreSQL runs the durable collective-control conformance
  consumer from packed packages.

These checks establish package-content readiness. The existing exact-registry
consumer remains a post-publication release gate and stays unchecked until the
version exists in the public registry.

## Privacy, retention and dependency evidence

The readiness suite integrates the existing evidence boundary and hidden
canary validators across logs, traces, reports, snapshots and bundle-like
artifacts. It verifies that a required evidence write failure occurs before
dispatch and cannot repeat an effect.

PostgreSQL retention must refuse pruning while Work, grants, permits or
indeterminate effects remain active. A successful prune keeps the predecessor
anchor needed to verify the retained suffix. Tests cover each blocking class
rather than treating a count-only happy path as proof.

The dependency audit consumes the package manager's JSON report, records only
severity counts and advisory identifiers, applies an explicit reviewed
allowlist if one exists and fails on every unaccepted high or critical
finding. Network or malformed-report failure is `no_go`, never a pass.

## Manual readiness workflow

A dedicated workflow supports `plan` and `assess` operations. It is manual,
uses read-only repository permissions, pins actions by commit, disables
persisted checkout credentials and has no environment secrets, schedule,
deployment, publication or campaign-execution job.

`plan` produces only immutable planning and capacity artifacts. `assess`
requires an exact non-execution confirmation, runs the bounded technical
checks in Node 20, Node 22 and PostgreSQL jobs, uploads public receipts and
derives the final assessment from their exact closure. No receipt is accepted
from a different workflow attempt or source commitment.

## Acceptance criteria

- Capacity totals are derived from the validated registration, descriptor and
  operation plan and fail on any shape or ceiling drift.
- The recommendation is derived from the exact required-control closure.
- Missing, extra, corrupt, duplicate or cross-source receipts yield `no_go`.
- `executionPermitted` and `fullCampaignPermitted` are always false.
- A monetary amount is absent unless a later operator supplies a bound rate
  card; Increment 12 never accepts such an input.
- Node 20, Node 22 and PostgreSQL packed consumers pass without registry state.
- Privacy, canary, evidence-write, retention and integrated replanning gates
  have executable tests and public evidence mappings.
- High/critical dependency findings cannot be silently ignored.
- The workflow is manual, least-privilege, secret-free and contains no path to
  campaign execution, deployment or publication.
- Public audit, type checks, unit/adaptor tests, package checks and CI pass.

## Deferred boundary

After Increment 12, an operator may review the readiness bundle and decide
whether to create a separately authorized campaign operation. The following
remain deferred and fail closed:

- externally operated durable infrastructure and long-lived credentials;
- an operator-supplied rate card and monetary budget;
- execution of any of the 48 campaign shards;
- statistical eligibility or comparative performance claims;
- exact-registry consumer verification, release tagging, publication and
  distribution-tag promotion; and
- deployment or paid-provider traffic.
