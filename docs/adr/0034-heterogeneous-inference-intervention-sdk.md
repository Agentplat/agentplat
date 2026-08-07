# ADR 0034: Heterogeneous inference intervention SDK

## Status

Accepted.

## Decision

The public SDK defines a provider-neutral, closed capability negotiation layer for opaque API models, token-stream models, representation-capable sidecars, portable agents, and multimodal/action agents. An invocation may proceed only when every policy-required capability is declared by the bound adapter. This gives the runtime an enforceable boundary: unavailable required hooks fail before provider invocation.

Bindings include mission, agent, session, role, model-or-adapter identity, authority digest, fence, policy, input digest, and inference step. Durable state contains only content-free digests, monotonic logical-time and step high-water marks, intervention budgets, cooldown/recovery counters, and revision/digest protected compare-and-set state.

Before an adapter or representation sidecar can be called, the runtime commits a durable invocation reservation keyed by stable invocation ID, input digest, and step. A contending caller cannot cross the provider boundary; an exact replay returns the reserved terminal record or remains fail-closed while the record is prepared. Stores must provide an independently protected monotonic anchor for revision and intervention counters, so a syntactically valid but rolled-back state is rejected.

Invocation identity is domain-separated across inference, tool, and action operations. A prepared reservation is an unresolved effect after a crash: it cannot be resumed by invoking the adapter again. An authorized reconciliation port must attest the exact invocation identity and a contained/not-applied resolution before later steps are admitted.

The SDK supports pre-input/context filtering, bounded multimodal-input assessment, role reinforcement, per-token/window assessment (including the final partial window), output gating, tool/action gating, and optional representation-sidecar receipts. A modify assessment on inference input requires a trusted transformation port and a digest-bound transformation receipt; otherwise the request is blocked before adapter invocation. Tool/action gates never expose a transformed payload, so every modify/intervention outcome is blocked and the caller must not dispatch the original payload. Sidecars use transport-neutral request/receipt contracts and must return an exact request-bound, digest-verified receipt before an intervention is treated as applied.

Transformation and representation requests are issued only after their budget has been durably reserved. Transformation implementations are idempotent by request digest. A sidecar receives an abort signal and must observe it before applying work; timeout or an ambiguous result remains fail-closed. Aborting locally does not prove that a remote transport cancelled execution.

A sidecar timeout persists a `sidecar_ambiguous` unresolved effect bound to the sidecar request digest. It is not treated as an ordinary blocked terminal and requires the same explicit reconciliation path. Fixed bounds limit buffered output bytes, each streamed token, aggregate stream bytes, and token count before any output can be released.

## Consequences

The SDK can enforce the hooks an adapter actually exposes; it does not assert universal safety, inspect hidden model state, or turn descriptive adapter claims into enforcement. Deployments must select policies that only require capabilities their adapters implement and use independently protected provider/action boundaries where needed.
