# Local empirical execution package V2

Status: implementation record. No empirical sample has been executed and no
result is claimed by this document.

## Purpose

This package turns the registered collective-control study into a locally
executable, resumable and independently inspectable workflow. It deliberately
separates five events that must not be conflated:

1. source and protocol registration;
2. adapter registration;
3. operator authorization;
4. evidence-producing execution; and
5. statistical collection and interpretation.

The first two can be completed without authority to execute. Authorization is
a separate Ed25519-signed statement bound to the exact source, plan, adapter,
shards, expiry and cell ceiling. Collection does not grant permission to make
an empirical claim; interpretation remains a human-authored paper step.

## Implemented components

| Component                   | Implementation                                                       | Scientific role                                                                                  |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Registered reference runner | `createCollectiveStatisticalCampaignRegisteredRunnerV1()`            | Executes the two registered treatments from the closed cell context.                             |
| Independent projector       | `createCollectiveStatisticalCampaignRegisteredProjectorV1()`         | Derives metrics from trace, ledger and monitor evidence rather than accepting runner scores.     |
| Local execution store       | `@agentplat/mesh-sim-local`                                          | Persists revision-CAS state, leases and immutable slot commits outside the checkout.             |
| Deadline artifact writer    | `createLocalCollectiveStatisticalCampaignDeadlineArtifactWriterV1()` | Rechecks authorization time immediately before publishing a logical artifact binding.            |
| Campaign control CLI        | `scripts/empirical-study-campaign.mjs`                               | Plans, authorizes, executes one shard, reports closure and collects results.                     |
| Durable campaign supervisor | `scripts/empirical-study-supervisor.mjs`                             | Runs authorized shards sequentially outside the starting terminal and maintains a paper report.  |
| Preregistration V2          | `scripts/empirical-study-preregistration.mjs --mode plan-v2`         | Binds the registered adapter and deterministic aggregation seed before authorization or results. |

The local adapter makes no cross-host coordination, managed-service,
production-capacity or hardware-equivalence claim.

## Fixed execution geometry

- 48 shards;
- 5 registered cells per shard;
- 240 cells in total;
- two treatments per cell;
- first and exact-replay attempts per treatment;
- 20 metric projections per shard and 960 in total; and
- deterministic aggregation seed `20260810` with 10,000 registered bootstrap
  resamples.

There is no implicit run-all command. `execute-shard` accepts one shard index
and requires the exact `RUN_LOCAL_REGISTERED_SHARD` confirmation plus an active
signed authorization that contains that shard. Operational automation may call
the command repeatedly, but each call remains independently bounded.

The [durable local campaign supervisor](./durable-local-campaign-supervisor-v1.md)
provides that automation without weakening the one-shard boundary. Pause and
stop requests take effect at shard boundaries; a failed shard stops the
supervisor rather than being silently skipped.

## Resumption and interruption semantics

Each logical execution has a deterministic `runKey`. State transitions use a
revision compare-and-swap operation and leases include fences. Execution
records and metric projections are content-addressed and committed without
overwrite. A retry therefore behaves as follows:

- an already settled execution is read and reported as resumed;
- an identical artifact publication is idempotent;
- different bytes for an existing logical identity are a conflict;
- an expired or superseded fence cannot publish evidence; and
- a completed shard receipt makes a later invocation return
  `already_completed` without executing the shard again.

A process interruption can leave content blobs that are not referenced by a
slot commit. Those blobs are not visible campaign evidence. A shard becomes
part of collection only after its immutable receipt binds all 20 verified
projection indexes.

## Artifact topology

### Before authorization

- `source-lock.json`
- `adapter-descriptor.json`
- `registration.json`
- `operation-plan.json`
- `expected-manifest.json`
- `campaign-execution-design.json`
- `scientific-registration-v2.json`
- the detached scientific-registration attestation

These artifacts retain `authorizationStatus: not_issued`,
`resultsStatus: not_collected` and `executionPermitted: false`.

### Authorization

- `authorization.json`
- `authorization-public-key.pem`
- `authorization-receipt.json`

The private key is never copied into an output directory or campaign store.
Authorization can cover any strictly increasing subset of shard indexes. Full
collection requires the exact set `0..47`; a partial authorization cannot be
upgraded by the collector.

### Per-shard evidence

`shards/shard-NN.json` records source, registration, plan, adapter,
authorization and execution identities; executed/resumed slot counts; the 20
projection indexes; their verified byte total; a projection root; and an
immutable receipt digest.

### Full-closure results

Collection writes these files only after validating 48 unique shard receipts
and 960 projection artifacts:

- `results/collection-manifest.json`: closure and provenance root;
- `results/normative-analysis.json`: registered endpoint calculations and
  decision state;
- `results/raw-rows.json`: 240 paired observational rows;
- `results/paper-dataset.csv`: rectangular, analysis-ready export; and
- `results/paper-tables.json`: endpoint values prepared for table rendering.

All files are immutable. Reusing a path with different contents fails.

## Cost and privacy boundary

The implementation requires no paid model call, cloud compute, managed
database or paid data egress. The registered maximum external spend is zero.
Actual local electricity, hardware depreciation and operator time are outside
that monetary field and must be disclosed separately if material to a paper.

Public evidence contains traces, accounting ledgers, monitor-derived metrics
and digests. It must not contain credentials, private keys, raw private
reasoning, hidden world values or application secrets.

## Paper-use rules

The collection manifest proves artifact closure, not causal interpretation.
The analysis implementation applies the preregistered estimators, but a paper
must still report:

- all registered cells, including failed or invalid samples;
- missingness or interruption before any rerun decision;
- the exact source and registration digests;
- hardware and Node.js runtime metadata;
- elapsed time and locally measured resource use;
- the hash-chained supervisor journal and generated execution report;
- any deviation under a separately identified amended registration; and
- adversarial and mixed strata as bounded safety/recovery observations, not an
  unqualified superiority claim.

## Preregistration V2 sequence

After the implementation is merged, create V2 from the exact clean `main`
commit with `evidence:empirical-preregistration:plan-v2`. Sign and verify that
registration with the existing release-attestation process. Only afterward may
an operator decide whether to issue a time-bounded shard authorization.

Creating V2 does not execute a cell, allocate cloud infrastructure or produce
an empirical result.
