# AgentPlat 0.3.0-beta.4 client release

## Install

```sh
npm install @agentplat/collective-runtime@0.3.0-beta.4
```

The prerelease is published under the `next` distribution tag. Pin the exact
version in production-like evaluation environments.

## New public surfaces

- `@agentplat/collective-runtime/governed-collective-runtime`
- `@agentplat/collective-runtime/durable-runtime-state`
- `@agentplat/collective-runtime/partition-operation`
- `@agentplat/collective-runtime/degraded-effect-budget`
- `@agentplat/collective-runtime/partition-reconciliation`
- `@agentplat/collective-runtime/compromise-lifecycle`
- `@agentplat/collective-runtime/compromise-authority-lifecycle`
- `@agentplat/collective-runtime/forensic-preservation`
- `@agentplat/collective-runtime/team-topology-transformation`
- `@agentplat/collective-runtime/team-formation-strategies`
- `@agentplat/collective-membership/coordinator-election`
- `@agentplat/collective-control/mandate-continuity`
- `@agentplat/collective-planning/mission-continuity`
- `@agentplat/trust/evidence-fusion-strategy`

## Migration

Existing runtime constructors and fail-closed behavior remain unchanged. The
governed facade is opt-in. Use the `reference-integrated` profile when every
critical gate must be present, and configure `durableStore` plus
`idempotencyLedger` for restart-safe operation. Durable deployments should use
the asynchronous lifecycle methods: `pauseAsync`, `resumeAsync`,
`safeStopAsync`, `recoverAsync`, and `abandonAsync`.

## Compatibility

Node.js 20.19.3 or newer is required. The official release workflow verifies
clean registry consumers under Node.js 20 with pnpm and Node.js 22 with npm.
