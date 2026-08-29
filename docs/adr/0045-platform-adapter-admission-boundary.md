# ADR 0045: Provider adapters enter through portable authority boundaries

- Status: accepted
- Date: 2026-08-28

## Context

AgentPlat needs concrete PostgreSQL, Temporal, work-management and other
provider integrations. Keeping every provider outside the monorepo would make
the portable ports difficult to validate, while admitting application-domain
connectors would gradually turn the platform into a collection of vertical
business semantics.

The distinction cannot depend on package names or reviewer memory. It must be
stated and machine checked.

## Decision

A provider adapter may be a public `@agentplat/*` package only when all of the
following hold:

1. It implements or composes a declared provider-neutral AgentPlat port.
2. AgentPlat state, revisions, authority and terminal decisions remain
   authoritative; provider state is transport, persistence or projection.
3. The adapter contains no application-domain entity model, default outcome
   taxonomy or business policy.
4. Vendor dependencies and credentials remain isolated from portable entry
   points.
5. The adapter is replay-safe where delivery can repeat and passes the relevant
   compatibility or conformance tests.
6. Its catalog layer is `adapter` and its admission record names the portable
   port package.

`@agentplat/work-management-asana` is admitted because it projects generic
human contributions through the `@agentplat/rooms` port and cannot complete an
AgentPlat contribution from Asana state. `@agentplat/workflows-temporal` is
admitted because Temporal wakes the authoritative workflow runner and cannot
derive process state or authority from history.

A CRM entity model, sales sequence, domain-specific outcome reason set or
application workflow does not meet this rule and belongs in an application or
separate integration repository.

`config/platform-boundaries.json` records portable import boundaries, scoped
terminology and admitted adapters. `scripts/verify-platform-boundaries.mjs`
enforces the record in CI. Deployments may add their own private terminology
denylist through the existing public audit without committing customer
vocabulary to AgentPlat.

## Consequences

- Concrete adapters can provide executable interoperability evidence without
  changing ownership of domain state.
- Portable packages cannot import PostgreSQL, Temporal, Rooms or vendor SDKs
  outside their explicit composition entry points.
- A new connector requires a written admission record and a portable port; it
  cannot enter merely because one application needs it.
- Passing the boundary verifier proves configured dependency and vocabulary
  constraints only. It does not prove that an adapter or deployment is secure.
