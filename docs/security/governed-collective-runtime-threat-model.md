# Governed Collective Runtime threat model

Status: Beta 2 design candidate.

This document extends the existing Mesh, adapter, Inference Control, Trust and
compatibility threat models for locally governed delegation, budgeted effects,
revocation, collective evaluation and release evidence.

## Assets

- local mandate issuer/verifier configuration;
- mandate documents, proofs, canonical digests and revision lineage;
- revocation and revision high-water marks;
- accepted Objective documents and immutable policy snapshots;
- Work Contracts and current assignment/lease/fencing bindings;
- Trust decisions, inference assessments and Action Grants;
- governed permits, budget reservations and effect outcomes;
- downstream idempotency and fencing records;
- redacted decision records and evidence chain anchors;
- evaluation registration, seed ledger, fixtures, traces and reports;
- PostgreSQL migration history, checksums and repository generations;
- release commit, tarball/registry integrity ledger and annotated tag.

## Trust boundaries

```text
Room decision ---> mandate proposal --+
remote reference ---------------------+--> local issuer/verifier/repository
                                      |                |
                                      |                v
signed Mesh Objective -> existing crypto/admission/reducer -> candidate state
                                                              |
                               local mandate check -> publish/replay-only reject
                                                              |
Trust evidence --> local policy --------------------------------+
inference assessment + Action Grant ----------------------------+
                                                              |
                                                              v
current mandate + Work Contract + budget -> governed permit reservation
                                                              |
                                                              v
existing Action Gateway -> downstream atomic fence -> external effect
                                                              |
                                                              v
                                                redacted evidence/reconcile

mission + registration + seeds -> isolated runners -> validated report
```

Crossing one boundary never satisfies the next. A Room proposal is not an
accepted mandate. A valid proof is not installation. A signed Objective is not
local authorization. A current assignment is not an Action Grant. A positive
Trust or inference decision is not assignment authority. A permit reservation
is not proof that an external effect committed. An evaluation report is not
deployment authorization.

## Adversaries and failures

- remote peer referencing an unknown, forged, cross-tenant or revoked mandate;
- authorized issuer attempting capability, budget, validity or subject
  expansion in a revision;
- replay or restore lowering mandate revision/revocation high-water;
- conflicting same-revision mandates or revocations;
- stale caches and process crashes between revocation acceptance and dispatch;
- Room participant or application treating a role/approval as authority;
- Trust evidence collusion, contradiction, quarantine bypass or scope reuse;
- untrusted context manipulating objective, role, constraints or recipient;
- Action Grant, permit, input, handler, scope or assessment substitution;
- work reassignment racing with permit reservation or external dispatch;
- budget oversubscription by concurrent workers or idempotency aliasing;
- crash before effect, after effect but before acknowledgement, or during
  evidence commit;
- downstream handler ignoring fencing or misreporting idempotency outcome;
- repository/migration corruption, partial upgrade or lock loss;
- raw prompt, secret or sensitive tool input leaking through evidence;
- experiment runner reading hidden global state or future fault schedules;
- unfair baseline receiving free observations or uncounted directives;
- failed seed omission, endpoint change, optional stopping or interval error;
- deterministic trace or report mutation after execution;
- package/release process mixing source, tarball, registry, tag and evidence
  commits.

## Required mitigations

| Threat                              | Mitigation                                                                                                        | Verification                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Reference becomes ambient authority | exact locally accepted digest, issuer, scope and trusted-time validation before Mesh processing                   | unknown, forged, wrong-tenant/domain/issuer and reference-only cases |
| Revision fork or rollback           | linear predecessor digest, same-revision conflict, durable revision high-water                                    | fork, reorder, snapshot rollback and concurrent install tests        |
| Revocation bypass                   | durable monotonic generation; check at admission, contract refresh, permit issue/reserve and dispatch             | stale cache, restart and revocation/dispatch race matrix             |
| Revocation blocks cleanup           | authenticated cancellation and terminal transitions may only reduce authority under the retained binding          | revoke-then-cancel/expire/release cases                              |
| Scope widening                      | Work Contract and permit are intersections of current inputs                                                      | capability, action, budget, validity and role inflation cases        |
| Room/Trust confused deputy          | proposal/evidence only; construction-bound issuer is sole installation authority                                  | malicious role/approval and high-Trust-without-mandate tests         |
| Stale assignment effect             | exact peer instance, authority ID, epoch, fence, lease and generation checks; downstream atomic fencing           | reassign before/after reservation and stale handler cases            |
| Grant/handler/input substitution    | canonical digests bind exact existing grant, scope, handler and input                                             | substitution corpus for every binding                                |
| Budget oversubscription             | transactional reservation, hard ceilings, idempotency digest conflict, indeterminate units retained               | high-contention and crash-boundary tests                             |
| Permit replay                       | single-use generation-fenced reservation and terminal outcomes                                                    | duplicate, concurrent, restore and cross-gateway replay tests        |
| Unknown external outcome            | explicit indeterminate terminal state; reconcile from downstream proof; no blind retry/release                    | commit/ack crash injection and contradictory proof tests             |
| Evidence as availability bypass     | sink failure never turns denial into approval; policy can require pre-dispatch durability                         | unavailable/slow sink before and after reservation                   |
| Sensitive evidence                  | allowlisted fields/digests, size limits, redaction before sink, canary scanning                                   | prompt/token/tool-input canary corpus                                |
| Repository tampering                | tenant/domain keys, row generations, canonical digests, checksums and transaction fences                          | mutate/delete/reorder/cross-tenant tests                             |
| Partial migration                   | explicit advisory lock, checksum history, additive idempotent steps, no import-time migration                     | concurrent migration and statement-boundary faults                   |
| Hidden simulator oracle             | runner decisions receive declared local observations only; global state restricted to invariants/terminal scoring | instrumented forbidden-access negative runner                        |
| Unfair interaction accounting       | shared accounting contract and exact per-kind ledger                                                              | free-broadcast/free-directive broken baselines                       |
| Statistical cherry-picking          | pre-registration, fixed seeds/stopping, complete raw sample ledger, validator                                     | omitted/extra/changed/optional-stop negative reports                 |
| Report mutation                     | source/config/trace/evidence digests and exact replay                                                             | byte mutation and mismatched-commit tests                            |
| Release identity drift              | one release commit; exact registry integrity ledger; annotated tag; evidence follow-up                            | tarball/registry consumer and tag verification                       |

## Fail-closed ordering

Governed objective processing first evaluates the complete existing Mesh
inbound processor into an immutable candidate. Only a cryptographically verified
and otherwise accepted envelope reaches the local mandate lookup. The governed
adapter publishes the candidate domain state only after the mandate check. On
mandate rejection it returns the original domain state plus the candidate's
advanced replay state, preventing both unauthorized mutation and free replay.

Protected action processing orders checks to avoid reserving budget for malformed
or already stale work. A composed resolver and dispatcher run inside the
existing Action Gateway so all mutable governed inputs are rechecked at its
final authority and downstream dispatch checkpoints. If the repository or
trusted time is unavailable at a required check, the action is denied or
remains reserved for explicit reconciliation.

## Crash and concurrency matrix

| Boundary                                        | Required outcome                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| before mandate commit                           | no accepted mandate or high-water change                                  |
| after mandate commit, before response           | idempotent retry returns the exact accepted record                        |
| revocation accepted during objective processing | objective cannot be accepted after the durable effective check            |
| reassignment before permit reservation          | stale permit is rejected without dispatch                                 |
| reassignment after reservation, before dispatch | dispatch recheck rejects and releases/terminates per policy               |
| budget reservation commit before response       | retry returns same reservation or digest conflict                         |
| handler fails before effect                     | terminal failed; reservation reconciles exactly once                      |
| handler commits before acknowledgement          | terminal indeterminate until authoritative downstream proof               |
| evidence commit fails before required dispatch  | no dispatch when policy requires durable evidence                         |
| evidence commit fails after effect              | effect remains dispatched/indeterminate; evidence repair cannot repeat it |
| worker loses database claim                     | stale generation cannot commit any later transition                       |

## Residual risks

- A malicious locally trusted mandate issuer can intentionally authorize harmful
  work. The core provides scope, evidence and revocation mechanics, not issuer
  correctness.
- A compromised process with access to signing keys, repositories and effect
  handlers can bypass library APIs. Deployment isolation and key management are
  operator responsibilities.
- Downstream systems that cannot atomically enforce fencing/idempotency cannot
  support strong coordinated-effect policy and must be rejected for those
  actions.
- Black-box providers cannot support controls that require unavailable internal
  representations or provider-native tool interception.
- Statistical results are limited to the registered mission, agent policy,
  seed distribution, topology and runner environment.
- Redacted digests can still reveal equality/frequency patterns; deployments
  requiring stronger confidentiality need a separate keyed/encrypted evidence
  design.

## Release security gates

- zero open P0/P1/P2 findings;
- zero authorization or fencing safety violations;
- complete adversary and crash-boundary matrix;
- conformance negative corpus detects every listed broken implementation;
- Beta 1 compatibility and byte fixtures unchanged;
- secret-canary scans pass in logs, traces, reports and packed artifacts;
- runtime dependency audit has zero unaccepted critical/high findings;
- migrations and repositories pass cross-tenant/concurrency tests;
- exact release/source/registry/tag/evidence identity is reproducible.
