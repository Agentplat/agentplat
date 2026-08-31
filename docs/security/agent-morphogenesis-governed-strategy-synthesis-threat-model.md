# Agent Morphogenesis Governed Strategy Synthesis V5 threat model

Status: source implementation threat model.

| Threat | Control |
| --- | --- |
| Prompt injection enters control state | Candidate schema admits only IDs, digests, enums and bounded integers; unknown fields fail. |
| Synthesizer installs arbitrary code | Candidate is inert; implementation is only a content digest and catalog materialization grants no execution authority. |
| Tool escalation | Manifest ceiling, adversarial assessment, Blueprint Registry and Inference Control gate. |
| Memory leakage or scope widening | Memory-scope digest, mandatory leakage assessment and local Trust/Blueprint checks. |
| Recursive spawn | Explicit maximum depth; zero is supported and policy caps every candidate. |
| Resource exhaustion | Token/tool/interaction/canary ceilings are checked before admission. |
| Colluding generator and certifier | Synthesizer/certifier identity independence; residual multi-identity collusion remains. |
| Fabricated favorable evaluation | Scenario binds simulator implementation, environment, seed and budget; report is immutable and replayable. |
| Missing threat silently passes | All six canonical threats are mandatory and exact. |
| Certification becomes authority | Certification and eligibility records declare no authority; governance and execution remain separate. |
| Human-only bottleneck or unreviewed automation | Policy selects agent, person or quorum route; exact mandate/proof and optional independence apply equally. |
| Canary replay inflates success | Observation IDs and evidence-bound receipts are idempotent; divergent reuse fails. |
| Draft enters normal strategy selection | Draft is absent from successor catalog; experimental availability requires explicit canary selection. |
| Catalog substitution | Parent catalog, strategy implementation, policy, blueprint catalog and generator digests are exact. |
| Remote Mesh recommendation controls local node | Projection is unsigned/authority-neutral and local Blueprint/Trust/Inference/governance gates remain mandatory. |
| Database rollback reopens state | Revision/digest CAS plus external rollback witness. |

Residual risk includes compromised assessors, independence classification,
correlated simulators, malicious content behind an incorrectly trusted digest
and sufficiently broad collusion. Deployment and empirical controls are still
required.
