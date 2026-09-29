# AgentPlat 1.1.0 distribution — 2026-09-29

All **66 coordinated packages** are published at **1.1.0**, with `latest` aligned.
The release adds opt-in governed agent autonomy while preserving instruction-driven
work within the [1.x stability contract](../stability.md). Jev is an optional adapter.

The [release workflow](https://github.com/Agentplat/agentplat/actions/runs/36593675509)
completed successfully from source
[`38389ebd84291674f8046b08a4fbf460075b28d1`](https://github.com/Agentplat/agentplat/tree/38389ebd84291674f8046b08a4fbf460075b28d1).
Preparation, publication and final verification passed. Verification covered registry
artifact bytes, signatures, source provenance fields and tags, plus portable,
PostgreSQL and Node 22 npm consumers. A separate local verification also confirmed
integrity, signatures, provenance and `latest` for all 66 packages.

The first verification attempt could not see `@agentplat/audit@1.1.0` in the
registry response. After all 66 versions and tags were visible, only the failed
verification job was rerun. Publication was not repeated.

## What changes for adopters

- Existing definitions without `interaction` remain instruction-driven.
- Purpose mode adds owner-governed configuration, bounded mission work, suspension,
  budgets and evidence-based outcome review. Hosts explicitly wire and activate it.
- PostgreSQL adopters apply the coordinated migrations through 018 before enabling
  the new composition.
- `@agentplat/assessor-typesafe` is optional; the core does not install or invoke Jev.

Start with the [brief adoption guide](../getting-started/adopting-1.1.md), then the
[detailed governance guide](../agent-governance/adoption.md). See the
[release scope](1.1.0-preparation.md) for compatibility checks and included changes.

This distribution record does not establish model quality, production-scale
performance or AGI. Provenance field checks are not independent full Sigstore
certificate and transparency-log verification. Historical evidence remains intact.
