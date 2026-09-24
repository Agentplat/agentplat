# ADR 0055: Keep Jev behind an optional AgentPlat assessor adapter

- Status: accepted
- Date: 2026-09-23

## Context

AgentPlat applications may use provider-neutral rules, their own model, Jev or
multiple evaluation methods. The current TypeSafe JavaScript SDK provides typed
Choice, Score and Noul questions over text or structured state. Its reported
confidence is derived from its output distribution and is not by itself an
AgentPlat accuracy guarantee.

## Decision

- Offer Jev through the separate `@agentplat/assessor-typesafe` adapter that
  implements the existing `ControlledAgentAssessorV1` port.
- Keep the model SDK, credentials and transport out of portable AgentPlat
  packages. The integration requires an explicit API key when constructing the
  adapter; it does not read environment variables implicitly.
- Let application code construct the state projection and typed questions and
  map answers to an existing assessment disposition. Do not impose a shared
  business rubric.
- Treat provider output as an assessment input. AgentPlat policies, capabilities,
  action owners and human Room approvals retain authority.
- Propagate provider and mapping failures. They never become an `allow` result.
  Applications select their existing observation or fail-closed behavior.
- Allow applications to configure a conservative USD spend cap from the Jev
  input-token limit, current rate and retry budget. Reserve worst-case cost
  before each request and do not refund failed attempts; the application must
  verify the provider's changing model limits and price.
- Bind assessor id, version and digest to the application configuration that
  selects model, questions and mapping. Prefer explicit model versions for
  reproducibility; moving aliases remain the application's choice.
- Offer an optional content-free evidence sink for success and failure, with
  resolved model/usage when available, target digest, duration and mapped
  disposition or safe failure code. Evidence persistence is application-owned;
  a configured sink failure rejects the assessment.

## Consequences

Developers can use the same control port with deterministic rules, another
provider or Jev. Installing the portable framework creates no TypeSafe
dependency or network activity. Package availability and passing tests do not
establish model calibration, lower review effort, or production service levels.

The first integration is an assessor adapter. A generalized artifact-review
experience and empirical comparison are separate work with their own evidence.

## References

- [AgentPlat adapter admission boundary](0045-platform-adapter-admission-boundary.md)
- [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)
- [TypeSafe confidence semantics](https://docs.typesafe.ai/confidence)
