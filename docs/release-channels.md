# Release channels

AgentPlat uses one fixed version for all publishable packages. Preview work is
published under the npm `next` tag; `latest` remains the last promoted preview
until the maintainers explicitly promote a tested release.

Install the current preview deliberately:

```sh
pnpm add @agentplat/framework@next @agentplat/sessions@next
```

Preview APIs are supported for evaluation and production-preview validation,
but may change between prereleases. A preview is promoted to `latest` only after
the public checks, package smoke test, reference examples and downstream
integration validation are green.

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

Session/browser APIs remain on `next` until the reference Next.js controls,
public contract tests, package smoke test, downstream validation and a stable
API review are all green for a promotion candidate. `latest` is intentionally
not advanced merely because a preview release is published.

New scoped packages can receive `latest` from npm on their first publication
even when published with `next`; npm does not permit removing the only
version's `latest` tag. This caveat applies to the first publication of
`@agentplat/trust`, as it did when the four Agent Mesh packages were introduced
in Alpha 1. Consumers should still install the coordinated channel explicitly
while the framework is in preview.
