# Governance contract evaluation (v0.5)

This extension evaluates the contract, not organizational intelligence. Historical
v0.4 mission inputs, controllers, observations and artifacts remain immutable.

## Questions and conditions

Q1: Does the protected effect owner admit only the exact approved plan and scope,
under a current issuer-granted mandate, at effect time?
Q2: Can an independent verifier reconstruct proposal, decision, admitted effect,
accepted successor and cleanup from exported records?
Q3: Can a losing transition become terminal without changing the accepted head,
repeating owner effects, or removing an agent with admitted work outstanding?

Compare fixed, minimal adaptation, durable workflow and Morphogenesis with the
same owner enforcement and authenticated approval envelope. A durable workflow
with equivalent controls is the primary comparator. Fixed has no organizational
successor and is N/A for transition-lineage metrics, not a failed transition.
Minimal is an explicitly labeled retry ablation. Neither baseline is deliberately
stripped of security controls to manufacture a safety advantage.

Authority cells: nominal, decision expired, mandate expired after approval,
substituted approved plan, escalated scope, self-issued mandate, and owner denial.
Recovery cells: lost acknowledgement and reconciliation unavailable after a lost
acknowledgement. Lifecycle cells: competing successors and retirement while work
is in flight. Distinguish these mechanisms instead of multiplying unrelated
workload shapes and seeds to inflate a denominator.

Use deterministic adversarial proposals, no LLM. Each cell is a prescribed case,
not a population sample. Report each condition/cell, attempted/admitted effects,
unauthorized effects, duplicate effects, terminal state, pending obligation,
accepted heads and externally reconstructible chains. Record expected denials
separately from liveness and useful task completion. Do not reward rejecting all
work: the nominal positive control must admit and finish.

## Independent verification

Export raw approval/mandate, effect and lifecycle records, not only summaries.
A separate verifier must recompute digests, check exact binding and validity at
effect admission, verify unique successor selection, and require cleanup
receipts in causal order before terminal supersession. Publish mutation controls:
removed evidence, swapped proposal/scope, changed admission time, forged issuer,
missing fence and premature terminal state must fail verification.

P5 denominator: all transitions that actually reach an owner effect (including
losers); numerator: those with a complete, valid exported chain and an explicit
accepted, superseded, or pending disposition. Also report terminal-chain coverage
separately. Fixed protected effects get an admission-chain metric; they have no
organizational transition denominator. A missing artifact is incomplete evidence,
not proof an unsafe effect occurred.

## Time and trust

A fixture-controlled monotonic millisecond clock has an explicit UTC origin.
Wall timestamps in mandates are origin plus those milliseconds. This is one
clock domain; it does not test clock skew. Real hosts must enforce expiry using
the owner's trusted clock and a declared skew policy, not proposer timestamps.
Signatures authenticate a configured issuer; hashing alone proves neither
identity nor truth of an owner's statement. Catalog/membership fixtures and
process-local rollback witnesses must be labeled.

## Freeze and interpretation

Keep development failures. Freeze runnable source and oracle hashes before a
final run; report source changes after a pilot explicitly. No numerical advantage
is preregistered. Equal safety outcomes are valid. Timings are local diagnostics;
no general 24% overhead or production reliability claim follows. Model checking
must publish the finite state bounds, fairness assumptions and explored counts;
a passing bounded model is not a proof of the full TypeScript implementation.
