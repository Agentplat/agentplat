# Release integration matrix v1

This matrix is the release gate for the governed collective runtime. It maps the
public capability surfaces to the runtime phase that invokes them, the required
decision gate, the receipt that proves the transition, and the normative
documentation that defines the contract.

| Capability | Public API surface | Runtime gate | Required receipt evidence | Contract document |
| --- | --- | --- | --- | --- |
| Observation and mission intent | `GovernedCollectiveRuntimePortV1.run` + `observe` phase | Intent is bound to `missionId`, `operationId`, cycle and predecessor digest | Causal receipt with operation digest and cycle | [governed runtime](./governed-collective-runtime-v1.md) |
| Partition posture and degraded effects | `partition-operation`, `degraded-effect-budget`, `partition-reconciliation` | Partition policy decides whether the cycle may continue or must safe-stop | Phase evidence digest and reason code (`deferred`/`failed`) | [partition operation](./partition-operation-v1.md) |
| Team allocation and formation | `mechanism-allocation`, `team-formation`, strategy registries | Strategy is selected before approval and contributes a digest | Strategy/evidence digest in the phase receipt | [pluggable strategies](./pluggable-strategies-v1.md) |
| Dynamic topology | `team-topology-transformation`, `topology-governance` | Epoch, quorum and activation policy gate topology changes | Topology digest, epoch and lineage metadata | [dynamic topology](./dynamic-organizational-topology-v1.md) |
| Approval and human control | `approval-checkpoints` | Approval phase must certify or explicitly defer the intended effect | Approval evidence digest and deterministic reason code | [control plane](./controlled-emergence-control-plane-v1.md) |
| Inference authority | `inference-policy-projection` | Inference policy is projected only after approval and before effects | Policy projection digest in the receipt | [control plane](./controlled-emergence-control-plane-v1.md) |
| Effect execution | `effect` phase handler | Consumer-owned effect handler runs only in the ordered phase; failures obey policy | Effect digest, phase status and causal predecessor | [governed runtime](./governed-collective-runtime-v1.md) |
| Continuity, branching and rollback | `mission-continuity` and `mission-continuity-disposition` | Checkpoint, branch and abandonment policy gate long-running transitions | Checkpoint/branch digest and disposition receipt | [mission continuity](./mission-continuity-v1.md) |
| Compromise response | `compromise-lifecycle`, `compromise-authority-lifecycle` | Restriction, isolation, recovery or expulsion gates authority and effects | Incident/forensic digest and revocation receipt | [unified lifecycle](./unified-compromise-lifecycle-v1.md) |
| Forensic preservation | `forensic-preservation` | Forensics is the final phase and receives all preceding digests | Content-addressed bundle, custody links and retention metadata | [unified lifecycle](./unified-compromise-lifecycle-v1.md) |
| Durable state and replay protection | `durable-runtime-state` | CAS, idempotency ledger and epoch fence guard every persisted run | Causal receipt with state revision and epoch | [governed runtime](./governed-collective-runtime-v1.md) |

## Release assertions

The `reference-integrated` profile is considered release-ready only when:

1. every critical phase has a handler (observation, partition, strategy,
   approval, inference, effect and forensics);
2. every externally visible operation has a stable operation digest and causal
   receipt;
3. restart restores the last durable state and a repeated operation is
   idempotent;
4. stale revisions and epoch regressions are rejected; and
5. a failed critical phase follows the configured safe-stop policy.

The local verifier `pnpm run verify:governed-runtime-release` checks the durable
and replay-sensitive assertions without cloud services, external credentials or
paid model providers.
