# Heterogeneous inference intervention threat model

## Assets and boundaries

Protected assets are mission/role authority, inference inputs and outputs, tool/action requests, representation intervention requests, and durable control state. Payload text is volatile; persisted records use digests and bounded reason/evidence identifiers only. Provider SDKs and sidecars are outside this package boundary.

## Threats and controls

- A provider adapter overstates its abilities: closed negotiation compares policy requirements with the adapter descriptor before invocation and rejects missing hooks.
- An old session or authority holder replays an invocation: binding digest, authority fence, monotonic step, and logical-time high-water checks reject it.
- Concurrent workers overwrite state: compare-and-set requires both revision and state digest, with a bounded retry limit.
- A store is replayed with a valid-but-old state: an independently protected monotonic anchor records the highest revision and budget counters and rejects rollback below that anchor.
- A competing caller repeats provider work: a durable prepared reservation is committed before any provider or sidecar effect; conflicting invocation identities fail closed.
- A tool/action identifier is replayed as inference (or across operation kinds): invocation digests and reservation records include a closed execution domain.
- A scorer asks to modify content without an enforceable rewrite: a trusted transformation receipt binds the source signal, assessment, input, and transformed-input digests; missing or invalid receipts block invocation.
- A tool/action caller dispatches the original payload after an advisory rewrite: operation gates never return rewritten payloads and every modify/intervention disposition returns `allowed: false`.
- A sidecar receipt is forged, substituted, delayed, or replayed: request digest, sidecar identity/version/digest, receipt digest, and timeout are verified exactly.
- A timed-out sidecar later applies work: sidecars receive cooperative cancellation and must check the signal before apply. Because local abort cannot guarantee remote cancellation, timeout and ambiguous completion remain blocked and require operator reconciliation.
- A crashed worker leaves uncertain provider effects: prepared and sidecar-ambiguous records block later steps until an authorized reconciler attests the exact invocation, resolution, and optional sidecar request digest. Reconciliation never invokes the adapter.
- A provider exhausts memory through output: fixed limits bound buffered bytes, individual token bytes, aggregate stream bytes, and token count before release.
- An intervention loop consumes resources: policy bounds interventions, representation requests, window size, cooldown, and recovery counters.
- A scorer accesses undeclared hidden state: reference assessors only receive supplied bounded signals and their content digests.

## Residual risk

The SDK cannot prove model behavior, provider implementation integrity, scorer quality, or the correctness of an external action executor. A declared capability is an integration contract, not a universal safety guarantee. Production deployments should authenticate sidecar transport, isolate provider credentials, and enforce equivalent authorization at downstream tool and action boundaries.
