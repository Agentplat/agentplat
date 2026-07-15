# @agentplat/audit

Audit contracts and redaction helpers for AgentPlat.

This package defines audit records, sinks and utility helpers for redacting sensitive details before records are stored, emitted or shared with operational systems.

`InMemoryAuditSink` recursively redacts credential-like fields before retaining records.

`createSessionAuditSink` adapts public `SessionEventRecord` values into
redacted append-only audit records. It is appropriate for observable ephemeral
sessions; use Agent Rooms when approvals and durable work lifecycle are needed.
