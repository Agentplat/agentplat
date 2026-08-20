# AgentPlat Specification v1

**Defines:** the normative vocabulary and compatibility levels for AgentPlat-compatible runtimes. **Status:** specified; individual capabilities may be implemented, experimental or research-only.

## Normative concepts

An AgentPlat Agent Room is a scoped collaboration workspace. An AgentPlat Handoff is a bounded, typed transfer of execution context and ownership. An artifact is a durable, addressable work product with provenance. A memory scope limits retrieval and writes to an authority boundary. The AgentPlat Evidence Boundary separates implementation claims from empirical validation.

## Compatibility levels

Level 1 covers Agent Rooms. Level 2 covers artifacts, handoffs and scoped memory. Level 3 covers Collective Runtime lifecycle coordination. Level 4 covers Agent Mesh distributed coordination. A runtime may claim only levels whose conformance tests pass.

Machine-readable metadata is in `spec/agentplat-spec-v1.json`; protocol-specific documents are in this directory.

