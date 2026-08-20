# AgentPlat Memory

**Defines:** the role of scoped memory in AgentPlat collaboration. **Status:** implemented primitives; deployment semantics depend on the selected adapter.

Memory must remain scoped to the owning room, session, tenant or artifact contract. Retrieval is an application policy and must not silently expand authority or evidence boundaries. See `packages/memory`, `docs/agent-rooms.md` and the security documentation.

