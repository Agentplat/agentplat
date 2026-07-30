# `@agentplat/mesh-sim`

Deterministic simulation contracts for AgentPlat Mesh peer state machines.

The simulator interprets the same inputs and effects as a production peer
driver while replacing clocks, transports and external effects with virtual
adapters. It begins at the accepted-message boundary and does not claim to test
cryptographic verification; signed delivery is covered separately by the
loopback integration.

The initial scenario uses three preadmitted peers and validates bounded event
processing, membership convergence and repeatable traces.
