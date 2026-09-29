# ADR 0056 — Instruction and purpose interaction with owner governance

Status: design specified; 2026-09-28. Objectives 2–7 configuration, persisted
owner governance, inert inceptions, bounded signal wakeups and opt-in instruction execution controls are implemented in source. Governed
purpose execution is available only through the qualified Room mission profile.

## Decision

Add an explicit interaction binding to the existing Agent Room Agent Definition
Registry. Absence preserves legacy instruction behavior. Purpose mode requires
a validated, tenant-scoped governance binding before activation.

Use the existing stable agent identity, immutable definition revisions and CAS
lifecycle. Add a separate revisioned governance head and immutable configuration
records within the Rooms domain. The shared Agent Registry remains a discovery
index, not a second owner of definitions or authority. Runtime consumes neutral
execution guards; it must not import Rooms or implement a second governance store.

Ordinary input, including input from the owner, cannot mutate governance.
Purpose-mode input is an inception evaluated on its merits. Authenticated
configuration, suspension and revocation operations are enforced independently
of the cognitive adapter's agreement. Mission authority is explicitly delegated
and narrower than purpose authority.

Reuse Action Gateway, governed action guards, workflow durability, autonomy
supervision and existing collective owners. Adding these contracts must not
create a parallel permission system or imply that semantic alignment can be
proved by a hash or a language-model assessment.

## Consequences

Existing instruction agents and immutable digests remain valid. Purpose-mode
activation fails closed if identity, durable governance or required enforcement
is unavailable. Mixed Rooms are supported, with mode selected by the governed
agent binding rather than by a message or caller override.

Mode transitions use a fenced, resumable activation procedure; publishing a
definition alone cannot change the live mode. Signals trigger evaluation and
human reference values remain distinct from mandatory limits.

The owner may be an authenticated organizational principal represented through
the application's identity system. Ordinary tenant administration is not proof
of agent ownership. V1 ownership transfer requires both parties and leaves the
agent suspended for explicit resumption. Lost-owner recovery is outside V1.

## Alternatives considered

- Prompt-only configuration cannot protect ownership, versions or revocation.
- A new universal agent registry would duplicate the existing definition owner.
- Treating every message as an inception would change legacy application behavior.
- Requiring human approval for every inception would remove the intended
  operational discretion; existing permission and supervision controls suffice.

See the [specification](../specification/agent-purpose-governance-v1.md) for
normative design rules and the [plan](../agent-governance/implementation-plan.md)
for implementation evidence required before claiming support.
