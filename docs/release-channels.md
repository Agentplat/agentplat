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

New scoped packages can receive `latest` from npm on their first publication
even when published with `next`; npm does not permit removing the only version's
`latest` tag. Consumers should still install the coordinated channel explicitly
while the framework is in preview.
