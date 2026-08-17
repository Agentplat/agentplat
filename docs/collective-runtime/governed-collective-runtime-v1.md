# Governed collective runtime v1

`@agentplat/collective-runtime/governed-collective-runtime` is the reference facade that composes the open-core control surfaces into one mission cycle.

The pipeline is explicit and receipt-producing:

```text
observe → partition → topology → strategy → approval → inference → effect → forensics
```

The facade exposes start/run, pause, resume, safe-stop, and cycle receipts. It preserves a mission, epoch, revision, cycle, predecessor digest, and idempotency record for every operation. Phase handlers are provider-neutral ports, so applications can bind transport, storage, model, and effect implementations without replacing library-owned lifecycle gates.

`@agentplat/collective-runtime/durable-runtime-state` provides the durable CAS, epoch fence, causal receipt, and idempotency ledger ports that can back the facade. The in-memory implementation is suitable for local development and deterministic simulations; production deployments can supply durable adapters.
