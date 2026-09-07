# `@agentplat/autonomy`

Evidence-gated progressive supervision for governed AgentPlat actions.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/autonomy@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

Levels are `blocked`, `propose_only`, `approve_all`, `approve_sample` and
`autonomous`. Promotion is one level at a time and requires current coverage,
minimum evidence, consecutive healthy windows and cooldown. Degradation is
immediate; exact caller-configured critical reason codes can drop directly to a
configured floor.

The controller decides supervision only. It never creates a Room approval,
Action Grant, authority, budget or external effect. `./actions` composes a
decision as a narrowing guard around the existing governed Action Gateway.
`./workflows` derives bounded evidence windows from exact delayed workflow
outcomes.

An unavailable store denies. Missing or stale outcomes cannot promote a
segment. Segment keys, action types, reasons and outcome types are opaque caller
vocabulary.
