# Morphogenesis paper: local boundary pilot v0.2

Design recorded before the first execution of this harness, 2026-09-19.
This is an engineering pilot, not a confirmatory preregistration or a utility benchmark.

## Scope

Run existing AgentPlat V1 execution and morphology-head code with synthetic
effect owners. A single-writer JSONL adapter replays validated writes through
the reference in-memory stores. Every write is flushed before acknowledgement.
The adapter is a test instrument, not a supported storage implementation;
concurrent processes, torn writes, host loss and rollback are outside its model.
Use no network, model calls, external effects or paid services.

## Prespecified observations

1. Nominal and lost Team acknowledgement: compare the actual V1 runtime,
   a fresh-identity retry ablation of that runtime, and a small durable-pattern
   controller with write-ahead intent and stable-ID reconciliation. The latter
   is a comparator for this one boundary, not a complete saga framework.
2. Kill the worker with SIGKILL only after the synthetic owner's receipt has
   been flushed and before the caller receives it. Resume in a distinct process.
   Count actual sink effects for the same semantic Team target. The expected
   counts are one for stable-ID recovery and two for fresh-identity retry.
3. With reconciliation unavailable, expect the real runtime to remain before
   morphology commitment. Restore the owner and observe continuation.
4. Simulate current owner denial after organizational approval; an earlier
   organizational approval must not make the test owner accept the effect.
   This probes composition, not independent correctness of the owner policy or
   a real mandate-expiry/revocation race. The fixture owner returns a fixed denial.
5. Apply two owner effects before competing head updates; expect one accepted
   head and a retained effect from the losing proposal. This deliberately
   demonstrates the limitation of head CAS. It is not a complete concurrent
   proposal-admission experiment and does not claim automatic compensation.
6. Attempt detachment before the fence; expect rejection before owner invocation.
7. Store a completed runtime receipt in a real in-memory Agent Room repository
   and retrieve it with an earlier work artifact. This tests addressability and
   receipt projection, not semantic artifact validity or database durability.

## Reporting

One execution per prescribed schedule and condition; no inferential statistics,
failure-rate estimates or performance comparisons. Preserve raw worker stdout,
stderr, exit status, journals and receipts. Unexpected exceptions fail the run.
Keep failed output directories. Bind source commit, tracked diff, protocol,
harness, lockfile, compiled modules and environment through a manifest.
The verifier must independently count sink events, check bindings and reject
tampered evidence. Historical release bundles remain separate and unchanged.

## Reproduction

From repository root, build the dependencies as described in README.md, then:

```sh
node experiments/morphogenesis-paper/run.mjs --output /tmp/morphogenesis-pilot
node experiments/morphogenesis-paper/verify.mjs /tmp/morphogenesis-pilot
```

The output directory must not exist. The confirmatory four-condition mission
study described in the paper remains separate and unexecuted.
