# Claim/evidence matrix - v0.3

The v0.2 matrix still governs its eleven-case boundary pilot. The following
additional rows are bound to `integration/environment.json` and its manifest.
The library source commit is unchanged; harness files are separately hashed.

| Claim | Authoritative retained evidence | What was executed | Remaining limit |
| --- | --- | --- | --- |
| Two exact proposals were approved | `events.json`, signed-approval and approved-transition events | Real proposal/decision constructors and DecisionRuntime; Ed25519 verification | Self-generated local identities; no external identity attestation |
| The approved target binds the Team position mapping | Target invariant digest and exported Team position | Application validates the mapping before initializing execution | Mapping is an explicit integration contract, not an automatic core compiler guarantee |
| Owner effects can precede a losing morphology CAS | `race.json`, before/after Team, Work and head states | Real TeamFormation adapter/runtime, Work registration reducer, PostgreSQL state | Fixture membership and discovery; two local grants, not a full Mesh assignment race |
| One morphology successor is accepted | `race.json`, commits and accepted head | Production PostgreSQL morphology store with concurrent commit attempts | One controlled schedule; no frequency estimate |
| Owner cleanup does not terminate losing V1 execution | `race.json`, cleanup | Work release and Team cancel via owner APIs; pending `committing_morphology` record retained | No terminal supersession/cancellation implementation added |
| A valid organization decision does not override expired Work mandate | `expiry.json`, owner-admission event | Real authority reducer at controlled time 380; decision valid until 470, mandate expires at 350 | Controlled clock; no arbitrary race across time sources |
| Fence does not erase already-admitted work | `drain.json` and ordered events | Production Work revocation/fence bridge, held application promise, adapter-enforced draining | Application drain contract, not external ActionGateway/provider semantics |
| Winner completes and releases budget | `drain.json`, terminal runtime record | Reconciled original detach operation; budget release and completed receipt | No claim that loser reached terminal completion |
| Durable state reopens | Assertions in runner and `race.newPoolReopenVerified` summary | New PostgreSQL pool reads same head and Work digests | Database stayed running; no database restart, host loss or rollback experiment |

## Verification and attempts

`integration/verify.mjs` rechecks manifests, validates runtime/Team/Work/mandate
records, checks Ed25519 approvals, compares predecessor/decision bindings and
reconstructs admission-fence-block-completion-detachment order. Its four tests
cover valid evidence, altered signatures, rehashed mandate tampering and missing
job-completion evidence. This verifier is a separate check, not an independent
organization's replication or a formal implementation proof.

Fifty existing Morphogenesis/Collective Control tests passed. Four integration
verifier tests passed. Neither count is a sample size for a mission utility claim.

Attempt 1 failed in the harness: a late Team bid had an expected completion time
before its activation, so the Team constructor rejected the window before the
intended mandate check. Attempt 2 corrected that fixture and completed race/expiry.
Attempt 3 added the declared drain extension. Attempt 4 added environment and
verification artifacts. The final retained run used the automatic local container
launcher and the strengthened mandate verifier. All are retained separately;
earlier output is not relabeled with the final source hash.

## Interpretation

The losing execution remaining pending is a result, not an experimental setup
failure. It strengthens the paper's distinction among accepted lineage, material
owner state, and coordinator termination. A deployable recovery policy must cover
all three; P2 alone does not do so. No evidence catalog or historical release
bundle was changed to promote this pilot into qualification.
