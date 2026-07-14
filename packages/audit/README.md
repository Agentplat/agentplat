# @agentplat/audit

Audit contracts and redaction helpers for AgentPlat.

This package defines audit records, sinks and utility helpers for redacting sensitive details before records are stored, emitted or shared with operational systems.

`InMemoryAuditSink` recursively redacts credential-like fields before retaining records.
