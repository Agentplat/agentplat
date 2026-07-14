# @agentplat/memory

Memory and retrieval contracts for scoped agent context.

This package defines sessions, messages, knowledge sources, vector-store references, retrieval results and retriever interfaces. It is designed for tenant-aware memory systems where context boundaries are explicit.

`InMemoryMemoryStore` provides an isolated local adapter and rejects cross-tenant session access.
