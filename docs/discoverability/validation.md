# Discoverability implementation validation

Date: 2026-09-07. This record describes development checks, not measured search
visibility, customer outcomes or production readiness.

## Isolated source candidate

The candidate was prepared from source base `722f4029784b955ffc50b9542c2cda689737af05`
on `codex/discoverability-20260907`. It incorporates the existing local adoption
examples and documentation needed by the new guides, while excluding unrelated
release, dependency-audit and coordinated package-version changes.

The isolated source uses its base pnpm 8.10.0 lockfile, Node.js 24.14.0 and a
dedicated local PostgreSQL 16 database. The standalone API lockfile was updated
for its added local model adapter and verified with a frozen install.

Completed checks:

- Frozen workspace installation and standalone API installation.
- Full workspace build and workspace/public TypeScript checks.
- Adoption documentation links, commands and public export checks.
- 38 focused tests: measurement, proposal provider, Room checkpoints and Room behavior.
- Proposal HTTP scenario, including a human revision and approved second version.
- Actual child-process termination and successor recovery with retained work identity.
- Protected-action approval, checkpoint denial, incompatible provider rejection and
  retry after one local receipt commits.
- Measurement initialization creates pending observations and scores unknown rates;
  it does not invent an assistant baseline.

Docker/Compose and real model endpoints were not executed in this pass. The root
release check was not rerun; no release artifacts or npm publication were changed.
The older [adoption validation record](../getting-started/validation.md) describes
its own prior working-tree environment and does not attest this isolated candidate.

## Website and documentation source

Documentation source: `Agentplat/agentplat_docs`. The static build generated 105
pages, including framework-generated pages. Documentation links and the 17-package
public API catalog passed their existing verifiers. The sitemap enumerates 103
content routes. Canonical metadata was checked in generated HTML for the root,
selection, evidence and three practical guides.

Website source: `Agentplat/agentplat-website`. All top-level HTML pages have one
canonical URL and one primary heading. Local page links and sitemap XML passed
structural checks. The illustrative nonexistent `platform.deploy` example was
replaced by the actual deterministic collaboration command sequence.

This was build and structural verification, not browser visual testing. Public
publication, deployed-route validation, Search Console submission, customer
permission and clean-session assistant measurements remain separate steps.
