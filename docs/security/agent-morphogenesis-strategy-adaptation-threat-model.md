# Agent Morphogenesis Strategy Adaptation V3 threat model

Status: source implementation threat model; operational effectiveness is not
established.

## Assets and boundaries

Protected assets include strategy/catalog/policy identities, Morphogenesis
scope and epoch, selection and generator bindings, observed outcomes,
measurement provenance, learned state, recommendation/review histories,
counterfactual inputs, governance transitions and rollback-resistant heads.

Raw prompts, hidden reasoning, credentials, private keys, strategy code and
unbounded model output are excluded.

## Threats and controls

| Threat | Control |
| --- | --- |
| Feedback rewrites strategy code or policy | Learner selects only immutable implementation-bound catalog entries. |
| Caller injects a scalar reward | Feedback requires five bounded metrics, source identity/revision, confidence, provenance and exact outcome binding. |
| Outcome from another plan trains the selected strategy | Selection → generator receipt → proposal/plan → outcome binding is exact. |
| Partial or unsafe outcome is presented as success | Mapping is conservative; successor recovery is unsafe and partial success is failure. |
| Simulated estimate masquerades as observed feedback | Counterfactual types and stores are separate and have no feedback conversion path. |
| Favorable simulation automatically promotes a strategy | Reports are advisory and governance still requires an independent review. |
| Agent/person approves its own recommendation | Policy-enforced reviewer independence rejects identical proposer/reviewer identity. |
| Quorum evidence directly executes Morphogenesis | Review changes only strategy governance state; ordinary Morphogenesis decision and execution authority remain mandatory. |
| Remote Mesh recommendation controls local choice | Projection is unsigned advisory data; authenticated transport does not bypass local catalog, Trust or review. |
| Memory record becomes authority | Memory is a content-free recall projection; governance CAS state remains authoritative. |
| Strategy oscillates between apparently favorable arms | Existing learner bounds exploration/quarantine; governance adds cooldown and transition-window limits. |
| Regression or damage remains hidden | Actual outcomes are compared conservatively with baseline estimates; unsafe evidence classifies damage and recommends rollback. |
| Recommendation replay after history compaction | Terminal recommendation IDs remain retained for the state generation; capacity fails closed. |
| PostgreSQL rollback reopens learning/governance | State digest, revision/logical-time CAS and external rollback witness are checked on reopen. |
| Catalog substitution changes an implementation under the same ID | V3 catalog binds local strategy digest, generator, blueprint catalog, policy and parent version. |

## Residual risk

- Biased but authenticated measurements can still bias learning.
- Counterfactual model error can produce poor advisory rankings.
- Colluding reviewers or compromised source infrastructure remain deployment
  risks.
- Partitions reduce evidence and may force baseline or abstention.
- Real-world improvement, cost and safety require separate evidence.

## Required adversarial scenarios

- plan/outcome/selection substitution;
- low-confidence and insufficient-source feedback;
- unsafe baseline and non-baseline outcomes;
- self-review and forged person/quorum proof;
- recommendation expiry, CAS races and terminal ID replay;
- cooldown and oscillation-window exhaustion;
- simulated/observed evidence type confusion;
- counterfactual seed, model, environment and budget substitution;
- Memory/Room/Mesh authority escalation attempts; and
- database and witness rollback.
