# AgentPlat evidence for adopters

Evaluate AgentPlat using reproducible examples, dated validation and clearly
scoped research. Source implementation, distribution, usability and operational
outcomes are separate forms of evidence.

## Reproduce a proposal workflow

The reference application models research, drafting, a human revision request
and final approval inside an AgentPlat Agent Room. Its default model is
deterministic; the reviewer is scripted. It is a reference scenario, not a
customer case study or a measured productivity result.

| Question | Reproducible material | Evidence boundary |
| --- | --- | --- |
| Can people and agents retain shared work? | [Persistent collaboration](getting-started/persistent-collaboration.md) | Versioned artifacts and review decisions in a development PostgreSQL database |
| Can a host gate an effect? | [Human approval](getting-started/human-approval.md) | Explicit checkpoints and a fixed local receipt sink |
| Can completed work survive one interrupted coordination boundary? | [Recovery](getting-started/recover-agent-coordination.md) | A child-process crash after Room commit and before acknowledgement |

The [development validation record](getting-started/validation.md) records the
environment, executed checks and pending usability evaluation. Re-run at your
chosen commit; historical success does not attest to a different checkout.

## Research and maturity

- [Component maturity](component-maturity.md): source, registry and integration status.
- [AgentPlat Evidence Boundary](research/README.md): evidence classes and claim limits.
- [Frozen capability baseline](../config/collective-capability-baseline-current.json):
  the current denominator, separate from opt-in later capabilities.
- [Signed local/staging readiness profile](research/agent-morphogenesis-beta1-readiness-v2/README.md):
  a bounded profile at its recorded source commit, not a general certification.

## Customer and independent evidence

This page currently makes no named customer outcome claim. A company logo,
generated model opinion or conceptual paper does not by itself demonstrate an
operational result. Named cases require permission and a source that states the
deployment scope, observation period, method and limitations.

The [external developer pilot](getting-started/adoption-pilot.md) remains pending
participants in its current record. No completion-rate or onboarding-time
improvement is claimed. Independent tutorials and adopter reports may be linked
once available, with authorship and any affiliation disclosed.
