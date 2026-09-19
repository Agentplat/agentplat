# Claim–evidence matrix

Draft v0.1, 2026-09-13. This matrix records what was inspected while writing; it does not certify the implementation. Repository source inspection was against `12fd870bb858476fc0f221d13b6ee1f6b1ab3e39` before adding this draft.

| ID | Claim or question | Inspected basis | Current status | Required next evidence |
| --- | --- | --- | --- | --- |
| C1 | Morphology is a bounded projection; subsystem owners retain authority | [ADR 0046](../../adr/0046-agent-morphogenesis.md), [architecture](../../architecture.md) | Specified architecture | Trace every effectful integration to its owner and verify complete mediation |
| C2 | Governed V2 admission binds decision, proposal, policy, epoch, plan and execution authorization | [Governed entry point](../../../packages/collective-runtime/src/morphogenesis-governed-operator.ts) | Source inspected | Negative tests and service-backed stale/substituted-binding experiments tied to the publication commit |
| C3 | Prepared effects are reconciled under stable identities | [V1 execution](../../../packages/collective-runtime/src/morphogenesis-execution.ts), [V2 specification](../../specification/agent-morphogenesis-v2.md) | Source and contract evidence | Independent sink observations under crash, response loss and delayed-request races |
| C4 | Head CAS selects at most one successor for an expected revision/digest | [ADR 0046](../../adr/0046-agent-morphogenesis.md) | Contract plus conditional argument | Review store/witness implementation and concurrent cross-owner traces; CAS does not imply no losing effects |
| C5 | Team activation and morphology commitment are distinct | `activateTeam` and `commitMorphology` in [V1 execution](../../../packages/collective-runtime/src/morphogenesis-execution.ts) | Source inspected | Fault injection in the intervening window; reconcile active Team with uncommitted morphology |
| C6 | Compensation can stop as indeterminate | [Compensation runtime](../../../packages/collective-runtime/src/morphogenesis-operator-compensation.ts) | Source inspected | Lost compensation acknowledgement and irreversible-effect recovery experiments |
| C7 | Removal follows checkpoint and fencing | [V1 specification](../../specification/agent-morphogenesis-v1.md), [V1 execution](../../../packages/collective-runtime/src/morphogenesis-execution.ts) | Contract and source structure | Owner admission traces, including in-flight actions and drain semantics |
| E1 | Beta 1 report lists 18 mixed-class scenarios | [Historical report](../agent-morphogenesis-beta1-release-v1/operational-validation-report.md) | Report inspected; no fresh bundle verification | Reverify receipts, signature/source binding and class labels before publication |
| E2 | Local account reports 76 tests and 1,000 in-memory runs | [September 9 account](../agent-morphogenesis-local-validation-2026-09-09.md) | Narrative inspected; underlying full log set not independently reverified | Publish/reverify exact input, environment and source manifests; retain mixed-binding qualification |
| E3 | Follow-up verification reports 174 ms resume and 144,676 ms duration | Local `verification.json` identified below | Existing verifier output inspected; no fresh hash recomputation | Recompute receipt and event chain; package portable evidence; do not infer a distribution from one run |
| E4 | V1–V8 staging is preregistered with execution disabled | [Registration](../agent-morphogenesis-v1-v8-staging-preregistration-v1.md) | Design only | Separately executed and verified campaign before any result claim |
| H1 | Controls prevent declared violations under the proposed fault model | Manuscript Section 8 | Unexecuted hypothesis | Matched protocol/ablation experiments and independent effect oracle |
| H2 | Adaptation improves mission outcomes under some conditions | Manuscript Section 8 | Unexecuted hypothesis | Budget-matched fixed/adaptive/governed comparison with task oracle |
| H3 | Continuity across many generations prevents cumulative drift | [V8 specification](../../specification/agent-morphogenesis-v8.md) | Extension; outside core paper claim | Longitudinal model, bounded verification and empirical evaluation |

## Historical provenance

- Beta 1 report: source `763b0429bfdb4d931db1ddd605f6ea89ff271767`, bundle digest `sha256:74013cf6cc47de4581999b83f9a8971a14043fd46d0bad89cb2aff308efe92fc`. These values were read from the report, not freshly recomputed.
- Initial September 9 diagnostics: the account records `c207f6288a77230e180e7b1569a759a48e5a342e` plus tracked changes; not one clean experiment revision.
- Supervisor follow-up: account binds snapshot `51529cfa8d4b9b482af366cdbd75e9ddcca3bf77`. Inspected local verifier output: `/Users/douglasrodriguez/Dev/agentplat-local-validation/2026-09-09-supervisor/attempt-2/verification.json`.
- That verifier output records receipt digest `sha256:3f09bb9f4facf913ffd772db372a813f5d9ea65504fc658c7bbccb4d49dc44d5`, 71 events, `eventHashChainVerified: true`, `differentSupervisorProcesses: true`, and `everyOperationAttemptedOnce: true`. These are recorded assertions by the prior verifier.
- The local evidence directory is not a portable public artifact. The manuscript links the repository narrative; publication must package admissible evidence or remove unsupported granular claims.

## Literature review boundary

Primary publication records, abstracts and project documentation were checked for the initial positioning. The bibliography is selective, not a systematic review. Absence of a mechanism in a short description is not evidence of absence in a paper or implementation. Full-text comparison, citation expansion and version pinning remain required; no novelty-superiority table has been fabricated.
