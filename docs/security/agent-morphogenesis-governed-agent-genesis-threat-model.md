# Agent Morphogenesis Governed Agent Genesis V6 threat model

Status: source implementation threat model.

| Threat | Control |
| --- | --- |
| Prompt injection installs instructions/code | Only content-addressed V2 artifact references enter the draft; no free-form code/prompt field. |
| Tool escalation | Authority attenuation, policy ceilings, adversarial assessment and Inference Control. |
| Memory/data exfiltration | Scoped memory digest plus mandatory separate memory/data assessments and Trust evidence. |
| Identity spoofing | Governed factory/Membership identity, key and runtime attestation boundaries remain mandatory. |
| Recursive spawning | Explicit maximum depth and V2 population/resource policies. |
| Resource exhaustion | Resource, interaction, action, sandbox and probation ceilings. |
| Generator self-certifies | Existing V2 synthesis certification requires a different certifier identity. |
| Sandbox becomes a member | Sandbox receipt must explicitly deny Membership, Work and Action Authority. |
| Crash duplicates sandbox/factory effect | Intent is persisted first; exact operation ID is reused and divergent replay fails. |
| Probation replay inflates success | Observation IDs and evidence-bound receipts are idempotent. |
| Review directly grants authority | Review changes Genesis lifecycle only; Membership, attestation, Work and Action remain separate. |
| Remote Mesh projection enrolls an agent | Projection is unsigned and explicitly authority-neutral. |
| Rollback leaves created resource active | External admission blocks rollback; reviewed retirement and a terminal compensation receipt are required. |
| Work handoff bypasses Work owner | Handoff declares Work/Action false and cannot construct a contract, lease, fence or grant. |
| Database rollback reopens lifecycle | Semantic validation, revision/digest CAS and external rollback witness. |

Residual risks include compromised artifact registries, colluding generator and
certifier identities, correlated assessors, malicious factories and deployment
misconfiguration. Operational controls and empirical evidence remain required.
