# Release channels

AgentPlat uses one fixed version per coordinated release cohort. **1.4.0** is
published under npm `latest` for all 70 coordinated packages; see the
[verified distribution record](releases/1.4.0-distribution.md) and the
[adoption notes](getting-started/README.md).

Version 1.4 adds the opt-in Agent Room Planner, persistent memory and reviewed
definitions, and optional versioned artifacts. Applications select a consistent
set of packages at the same exact version; installing a package does not activate
its optional capability. Source availability, distribution and operational
maturity remain separate evidence boundaries.

Stable 1.x releases follow the [stability contract](stability.md). Prereleases
use `next` and must never promote `latest`. Stable promotion requires successful
public checks, exact artifact verification, reference integration validation,
and clean registry consumers for the entire coordinated release.

Install exact coordinated versions:

```sh
npm install --save-exact @agentplat/framework@1.4.0 @agentplat/rooms@1.4.0 @agentplat/rooms-postgres@1.4.0
```

See the [production and migration guide](production.md). Historical observations
below describe previews; they do not override the stable 1.x policy.

`0.3.0-alpha.4` was the coordinated Evidence and Trust preview.
This paragraph describes that historical release, not the current npm tag.
Consult the [component maturity matrix](component-maturity.md) for dated
distribution observations and verify tags before installing. That release added scoped
Evidence lifecycle, deterministic multidimensional Trust Profiles,
policy-exact eligibility, contradiction, quarantine and recovery, while
retaining Alpha 1/2 Mesh and Alpha 3 Inference Control defaults and contracts.
Source examples use local package links and can be ahead of the registry.
Outside the repository, verify availability and select the coordinated `next`
channel explicitly.

```sh
pnpm add @agentplat/trust@next
```

Trust exposes a browser-safe root and pure `mesh-records` normalizers. Explicit
server-only adapters live at `@agentplat/mesh/trust` and
`@agentplat/inference-control/trust`. Only calls routed through those opt-in
adapters receive Trust filtering or restriction; direct Mesh, provider,
handler and dispatcher calls keep their existing behavior.

Historically, session/browser APIs remained on `next` until the reference Next.js controls,
public contract tests, package smoke test, downstream validation and a stable
API review are all green for a promotion candidate. `latest` is intentionally
not advanced merely because a preview release is published.

New scoped packages can receive `latest` from npm on their first publication
even when published with `next`; npm does not permit removing the only
version's `latest` tag. This caveat applies to the first publication of
`@agentplat/trust`, as it did when the four Agent Mesh packages were introduced
in Alpha 1. Consumers should still install the coordinated channel explicitly
while the framework is in preview.


The owner-authorized [release-level OIDC profile](security/npm-direct-release.md)
prepares one verified cohort for one protected deployment approval. Its setup is
in progress; enablement follows verification of every npm publisher relationship.
The existing staged workflow remains available for historical cohorts.
