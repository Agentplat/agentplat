# Certified Role Refinement V1 threat model

## Assets

- active mandate and authority ceiling;
- predecessor and refined role definitions;
- structured refinement patches and private instruction content;
- evidence, evaluator and Trust decisions;
- collective certificates and membership configuration;
- catalog publication lineage;
- Portable Agent session and Continuous Role Alignment state;
- rollback and quarantine records.

## Trust boundaries

- Strategy output is untrusted even when produced locally.
- Peer proposals, votes and observations are untrusted until validated.
- Exact draft content is local to a draft repository and is never carried in
  collective agreement payloads.
- A catalog publication is trusted only after local validation, an exact
  certificate and compare-and-swap against the predecessor.
- Runtime activation is trusted only when it matches the published definition
  byte-for-byte.
- Durable stores and cryptographic key custody remain part of the host trusted
  computing base.

## Threats and controls

| Threat                                               | Required control                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A strategy smuggles new authority into a role        | Copy or narrow predecessor authority, validate against the active ceiling at admission, publication, activation and handoff |
| A patch is applied to the wrong predecessor          | Bind every operation, draft, selection and certificate to predecessor ID, revision and digest                               |
| A patch deletes or weakens constraints               | Reject removals; require expected-value digests and a local semantic-strengthening decision for replacements                |
| Ambiguous array edits produce divergent definitions  | Canonical operation ordering, unique operation targets and deterministic application                                        |
| A peer injects role instructions                     | Collective records contain only identifiers, digests, revisions and bounded reason/evidence references                      |
| A compromised evaluator dominates selection          | Distinct evaluator bindings, Trust eligibility, bounded candidates, thresholding and deterministic aggregate scoring        |
| Byzantine voters certify a different draft           | Verify the commit certificate cryptographically and bind the exact value, membership epoch and configuration                |
| A stale node overwrites a catalog revision           | Compare-and-swap publication on predecessor revision and digest                                                             |
| Runtime activates an unpublished or substituted role | Resolve the published definition locally and compare its digest before activation                                           |
| Partial publication or activation is retried         | Idempotent publication and runtime update with durable intermediate states                                                  |
| A restarted caller substitutes an external effect ID | Bind selection, publication, activation and rollback IDs into the request digest and reject mismatches before side effects  |
| A harmful revision passes pre-activation review      | Provisional monitoring, hard-violation fail-closed behavior, certified rollback and catalog quarantine                      |
| Rollback restores a substituted predecessor          | Bind rollback to the exact activation and predecessor definition digests                                                    |
| Handoff resets monitoring history                    | Transfer the complete digest-bound state and atomically rebind the destination session                                      |
| Observer failure changes enforcement                 | Persist enforcement state first; observers are content-free and best effort                                                 |
| State growth causes denial of service                | Policy limits for patches, candidates, evaluations, observations, events, bytes and lifetimes                               |
| Replayed or reordered inputs corrupt state           | Monotonic logical time, request TTLs, revision CAS and causal event digests                                                 |

## Fail-closed rules

- Unavailable Trust, semantic validation, draft content, catalog state,
  certification or runtime state cannot be interpreted as approval.
- An expired in-flight request cannot publish or activate a definition.
- An expired publication or rollback certificate cannot trigger its external
  effect.
- A provisional revision that reaches monitoring expiry without enough valid
  observations requires rollback.
- Quarantined definition digests cannot be selected, republished or activated.
- A destination unable to resolve the exact predecessor, draft or published
  definition rejects the handoff.

## Residual risks

- Semantic strength is application-dependent and relies on the configured
  validator and evaluator diversity.
- Digest integrity does not replace authenticated durable storage.
- Collective certification cannot prove that an external runtime faithfully
  executes the supplied role; runtime attestation remains adapter-specific.
- Emergency local intervention may temporarily precede collective rollback.
