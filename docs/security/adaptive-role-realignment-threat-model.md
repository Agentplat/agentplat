# Adaptive Role Realignment V1 threat model

## Scope

This model covers discovery, local admission, deterministic selection,
certificate verification and exact successor-role activation. It complements
the Continuous Role Alignment, Portable Agent, Trust, Collective Planning and
Byzantine agreement boundaries.

## Protected assets

- current objective and role lineage;
- accepted authority ceiling and logical validity;
- candidate, evaluation, selection and certification bindings;
- Portable Agent session revision and role context;
- longitudinal alignment history and event head;
- local role-catalog integrity.

## Trust boundaries

1. Proposers are untrusted and return content-free role references.
2. The role-definition catalog is application-owned trusted configuration.
3. Evaluators may be faulty; exact bindings, limits and independent evaluation
   requirements constrain their output.
4. Trust eligibility is point-in-time local policy evidence, not identity by
   itself.
5. Collective agreement validators may contain a bounded Byzantine minority.
6. Runtime and alignment repositories are separate CAS domains.
7. Observers and evidence sinks are best-effort and never enforcement inputs.

## Threats and mitigations

| Threat                              | Required mitigation                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Peer instruction injection          | Candidate records contain definition digests and reason codes, never instructions; only the trusted catalog returns role content.                            |
| Objective or session substitution   | Request, candidate, evaluation, selection, certificate and activation bind tenant, session, agent, objective and current role digest.                        |
| Role-lineage rollback               | Activation requires revision `current + 1` and the exact current role binding as predecessor.                                                                |
| Authority widening                  | Candidate capabilities, resource classes, budget and validity must be subsets of the request ceiling.                                                        |
| Assessor substitution               | Evaluation binds evaluator identity/version/digest, request, candidate, definition, logical lifetime and exact scores.                                       |
| One evaluator controls selection    | Policy requires a bounded number of distinct eligible evaluator bindings per candidate.                                                                      |
| Candidate flooding                  | Hard limits cover proposers, candidates, evaluations, references, retained events, encoded state and lifetime.                                               |
| Replay or expiry                    | Monotonic logical time, exact state revision and expiry checks fail closed.                                                                                  |
| Byzantine selection fork            | Activation requires a verified commit certificate over the exact selected value and current membership epoch.                                                |
| Stale or quarantined peer influence | Agreement semantics use an application eligibility port; non-eligible participants or sources are rejected locally.                                          |
| Certificate substitution            | Certificate binds request, selected candidate, definition, selection digest and authority-ceiling digest.                                                    |
| Partial activation                  | Runtime is updated first; alignment activation follows. A later control point can finish the exact successor transition, while all mismatches remain denied. |
| Handoff reset                       | In-flight state is digest-bound to the exact checkpoint transfer, rebound without dropping the request or certificate head, and re-resolved against the target's trusted catalog. |
| Observer failure                    | Observer exceptions are swallowed after enforcement state is durably saved.                                                                                  |

## Security invariants

- No proposal contains role instructions, constraints or action inputs.
- No unresolved or digest-mismatched definition becomes a candidate.
- No candidate wider than the current authority ceiling is admitted.
- No ineligible or expired evaluation contributes to selection.
- No selected candidate activates without a certificate accepted by the
  configured certification policy.
- No certificate grants Work or action authority.
- No role revision skips or forks the current predecessor.
- No failed Runtime role update advances the alignment controller.
- No handoff clears an adverse alignment or in-flight realignment history.
- No diagnostic failure changes a selection or activation result.

## Limitations

The core cannot infer the semantics of arbitrary instruction text. Safety
depends on the trusted catalog and application evaluators. Digest chains provide
integrity, not authentication against an attacker who can rewrite both records
and digests. Durable repositories, key custody, authenticated transports and
atomic coordination across independent stores remain deployment concerns.
