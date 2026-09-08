# A2A and Agent Registry example

Run `pnpm example:a2a` from the repository root. No credentials, model calls,
external effects, database or open TCP port are needed.

The example registers an individual published agent and a Room team service,
uses the official SDK over in-process HTTPS Request/Response routing, delegates
through a deterministic Mesh authority fixture and imports results as Room
drafts. It then evaluates candidates through Capability State Fusion and creates
a canonical advisory recruitment proposal. It prints an active Room, three
drafts, two registry candidates and `grantsAuthority: false`.

The Mesh and trust projections are deterministic fixtures. They demonstrate
integration boundaries, not distributed admission or empirical trust. Production
hosts supply verified identity, real execution owners and network policy. See
`docs/interop/a2a-agent-registry.md` for PostgreSQL and deployment integration.
