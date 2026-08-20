# AgentPlat Collaboration Protocol v1

**Defines:** typed collaboration messages, artifacts and planner-mediated work exchange. **Status:** specified; implementations are distributed across current runtime packages.

Messages and artifacts carry stable identifiers, scope and provenance. Handoffs must identify sender, recipient/owner, source work, bounded context and lifecycle state. Implementations must reject malformed or out-of-scope records.

