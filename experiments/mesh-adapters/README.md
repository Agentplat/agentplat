# Agent Mesh adapter benchmarks

Status: historical Beta 1 run recorded. Evidence class: local performance diagnostic.

## Question and method

Measure protocol parsing/canonicalization, cryptography, negotiation, HTTP retry,
PostgreSQL receipt/transition paths, snapshot restore and conformance overhead.
The report describes ten workloads with workload-specific sample counts; it is
not a comparison of agent task quality or a distributed scaling study.

## Reproduction and artifacts

- [Runner](../../scripts/mesh-adapters-benchmark.mjs)
- [Workload configuration](../../config/mesh-beta1-benchmarks.json)
- [Historical report](../../docs/agent-mesh/beta-1-benchmark-report.json)
- [Beta 1 operations](../../docs/agent-mesh/beta-1-operations.md)

The root `pnpm benchmark:mesh-adapters` command builds the relevant packages and
runs the benchmark. Consult the runner and operations guide for database setup
and arguments before running it; a new run is distinct from the historical report.

## Recorded result and limits

The report binds commit `b38c25098599499813fe2caea605b5d61f939222`, Node 20.19.5,
PostgreSQL 16.11 and Darwin arm64. It records ten workloads, zero errors and zero
correctness violations, with per-workload latency and throughput.

The report is explicitly diagnostic-only. These measurements do not establish
universal SLOs, cross-host performance or production capacity. This entry indexes
the existing result without rerunning the benchmark.

[Back to experiments](../README.md)
