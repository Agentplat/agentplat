# Evidence and Trust `0.3.0-alpha.4` acceptance checklist

Status: design frozen. Implementation and release evidence are pending.

This checklist is the release contract for Alpha 4. A box is checked only when
its evidence is reproducible from the reviewed public commit. Design items may
be checked in the design-freeze PR; implementation and registry items remain
open until their corresponding transition is complete.

## Release identity

- version: `0.3.0-alpha.4`;
- distribution tag: `next`;
- Git tag: `v0.3.0-alpha.4`;
- new package: `@agentplat/trust`;
- coordinated package count: 30;
- Trust state/policy/snapshot schema: `1`;
- Mesh wire version: `0`;
- compatibility baseline: `v0.3.0-alpha.3`;
- release commit: not assigned;
- coordinated publication completion: not assigned.

## Design freeze

- [x] implementation plan defines exact public scope and non-goals;
- [x] package boundaries preserve a pure `@agentplat/trust` root and explicit
      Mesh/Inference Control subpaths;
- [x] terminology uses only industry vocabulary and makes no global-truth,
      universal-reputation or universal-safety claim;
- [x] Evidence, Trust Profile, Fusion Decision, eligibility, quarantine and
      recovery are distinct contracts;
- [x] Trust can restrict an opt-in adapter but cannot create identity,
      admission, permission, lease, epoch, fence or Action Grant authority;
- [x] signed Evidence is explicitly separated from Evidence correctness;
- [x] source independence is locally configured through dependency groups and
      never inferred from identity count;
- [x] defaults remain observe-only with peer quarantine disabled;
- [x] threat model covers every new boundary, asset and adversarial assumption;
- [x] compatibility policy covers Alpha 1/2/3 API, wire, fixture, snapshot and
      default behavior;
- [x] three independent design reviews finish with zero open P0/P1 findings;
- [x] design-review record links the reviewed commit and final verdicts.

## Canonical foundation

- [ ] strict JSON rejects unknown keys, accessors, symbols, custom prototypes,
      sparse arrays, cycles, invalid Unicode and non-finite numbers;
- [ ] byte, depth, node, key and array limits apply before cloning or mutation;
- [ ] canonical object ordering uses Unicode code units, not locale collation;
- [ ] arrays with set semantics must be unique and pre-sorted;
- [ ] every causal/basis reference carries a closed kind, type, exact ID and
      exact digest; bare IDs are rejected;
- [ ] Claim and Challenge authority is retained only as a content-bound causal
      authorization verified through the exact policy/upstream binding;
- [ ] authorization bases cannot come from the future; Evidence-only chains
      must reach a non-Evidence terminal root without cycles;
- [ ] all arithmetic uses checked safe integers;
- [ ] SHA-256 digest input uses the exact
      `agentplat.trust/<domain>/v1\0` prefix;
- [ ] every closed digest domain has positive, cross-domain and tampering tests;
- [ ] reducer, Fusion, eligibility and quarantine outputs use only the closed V1
      reason-code union, and restore rejects unknown codes;
- [ ] Claim, Attestation, Challenge, Retraction and observation IDs are derived
      from their exact domain digest;
- [ ] family relationship digests identify source/target or source/subject/
      criterion/root-basis relationships independently from record IDs;
- [ ] conflicting content under one relationship is permanent V1 equivocation
      even after Retraction;
- [ ] shared `@agentplat/trust/mesh-records` normalizers map signed wire fields
      to exact root records with no mutable-state input;
- [ ] every root family retains explicit nullable causation and causation
      mutation changes its content digest;
- [ ] protocol and Trust cross-package fixtures produce identical IDs/digests;
- [ ] cross-package fixtures mutate envelope causation and every foreign digest
      encoding independently and reject mismatches;
- [ ] supplied ID mismatch fails before state mutation;
- [ ] exact duplicates are idempotent;
- [ ] conflicting logical relationships are retained as bounded equivocation
      and excluded from effective fusion;
- [ ] package root imports without clock, random, network, persistence,
      registration or telemetry side effects;
- [ ] package root passes the browser dependency-closure audit.
- [ ] `@agentplat/trust` root and `./mesh-records` are declared browser-safe;
- [ ] Mesh/Inference Control Trust integration subpaths are server-only in
      Alpha 4 and have Node tarball smoke coverage;

## Scopes, subjects and limits

- [ ] standalone, Mesh, Objective, Work and controlled-run scopes are closed
      tagged unions;
- [ ] Work scope binds Objective/Work revisions, assignment epoch, authority ID
      and fencing token;
- [ ] subjects distinguish peer from peer-capability scope;
- [ ] capability profiles cannot substitute peer profiles or cross scope;
- [ ] profile and quarantine keys include exact `policyDigest` and cannot share
      heads across policies;
- [ ] tenant and Mesh identity alignment is checked in every composite state;
- [ ] configurable limits cannot exceed tested V1 ceilings;
- [ ] exact-limit and one-over-limit tests cover every collection and byte cap;
- [ ] capacity exhaustion is fail-closed and does not evict live retraction,
      equivocation, quarantine, replay or idempotency state;
- [ ] encoded state bytes are recomputed and verified after every transition.

## Claim lifecycle

- [ ] Claim schema binds source, subject, scope, criterion, outcome, assertion
      digest, content metadata, basis references and observed time;
- [ ] `observedAt` is treated as Evidence, never as trusted local time;
- [ ] inline summaries and references are mutually exclusive and bounded;
- [ ] inline byte count and SHA-256 digest are recomputed from exact UTF-8 bytes;
- [ ] reference byte count is exact and resolver checks immutable version,
      media type, bytes and digest;
- [ ] referenced content carries one typed `EvidenceReferenceV1`, and resolution
      ID/digest fields equal that exact descriptor without encoding conversion;
- [ ] assertion digest has one normative preimage and is recomputed;
- [ ] typed roots and root-basis digests are acyclic, bounded and unique;
- [ ] referenced content never triggers a reducer network fetch;
- [ ] content-required Claims are unavailable until authorization, media type,
      size and digest are verified by a bound resolver;
- [ ] content-resolution inputs bind Claim, reference, resolver digest, media
      type, byte count and trusted verification time without retaining bytes;
- [ ] `satisfied`, `violated` and `inconclusive` outcomes have only local-policy
      semantics;
- [ ] unsupported criteria and ineffective sources may be retained but have
      zero Fusion weight;
- [ ] work-derived Claims require a locally accepted immutable result/checkpoint causal
      reference and exact historical accepted authority binding;
- [ ] delayed work-derived Claims resolve immutable historical authority rather
      than requiring the assignment to remain the current head;
- [ ] effective time comes from the accepted producing record, so delayed
      delivery cannot rejuvenate Evidence;
- [ ] each criterion has a closed Claim-authority rule for source relation and
      permitted basis kinds/counts;
- [ ] peer/capability Claims default to source-equals-subject and exact accepted
      capability owner/version/revision;
- [ ] owner/observer/witness third-party Claims require an explicitly permitted
      historical role and exact subject relation;
- [ ] unrelated peers fail with `claim_subject_authority_invalid` before state
      mutation;
- [ ] stale epoch, stale fence and causal-scope mismatch fail closed;
- [ ] duplicate, reordered, pending, conflict and capacity behavior is
      deterministic.
- [ ] pending relationships expire deterministically to unavailable at the
      configured trusted-logical-time bound without losing replay evidence;

## Attestation lifecycle

- [ ] Attestation targets exact Claim ID plus Claim digest in the same scope;
- [ ] disposition is exactly support, contradict or inconclusive;
- [ ] confidence is an integer from 0 through 10,000 and is capped by local
      source/group policy;
- [ ] one source cannot create multiple effective Attestations for one Claim;
- [ ] conflicting Attestations by one source create equivocation;
- [ ] self-Attestation cannot satisfy an independence threshold;
- [ ] unknown or inactive source binding produces zero weight;
- [ ] Attestation before Claim remains bounded pending and cannot fuse early;
- [ ] cross-tenant, cross-scope and wrong-digest targets fail closed;
- [ ] retracted, challenged, conflicted and stale Attestations are ineffective.

## Challenge and Retraction lifecycle

- [ ] Challenge targets one inspectable exact Claim or Attestation;
- [ ] Challenge requires a non-empty bounded basis and authorized same-scope
      challenger;
- [ ] every criterion has a Challenge-authority rule covering challenger
      relation, allowed typed bases/counts and mandatory basis resolution;
- [ ] unresolved, irrelevant or unauthorized Challenge bases cannot block a
      target;
- [ ] only one Challenge per target and challenger dependency group is
      effective under every identity count and arrival order;
- [ ] same-group Challenges aggregate canonically; their causal cutoff derives
      from resolved basis effective times and cannot move forward when another
      identity arrives;
- [ ] two same-group Challenges admitted in opposite orders yield the same
      resolution, decision, profile and digests;
- [ ] Challenge alone cannot create a negative profile contribution or
      quarantine;
- [ ] an unresolved Challenge prevents only its exact target from contributing
      positively and raises uncertainty;
- [ ] Challenge resolution is a deterministic policy-bound projection using
      only independent Attestations after the resolved causal-basis cutoff and
      exact group caps;
- [ ] Claim and Attestation target corroboration/opposition mappings, threshold
      order and terminal results are closed and covered by vectors;
- [ ] a target contributes only when every active group Challenge is dismissed;
- [ ] unresolved/sustained/contested group Challenges raise uncertainty once per
      target, while dismissed Challenges add no weight;
- [ ] challenge flood is bounded per source, scope and state;
- [ ] exact and one-over tests cover active and pending Challenge quotas per
      source/scope;
- [ ] Retraction targets only a Claim or Attestation by exact digest;
- [ ] only the original author may retract;
- [ ] Retraction never deletes history, Challenges, decisions or diagnostics;
- [ ] third-party, cross-scope and wrong-digest Retractions fail closed;
- [ ] Retraction before target is pending and becomes effective only after
      authorship and scope resolve;
- [ ] an admitted original author may retract its own historical target after
      current Fusion weight/role expiry;
- [ ] replayed Retraction is idempotent and cannot refresh time.

## Policy and source bindings

- [ ] Fusion policies are local-only, closed, immutable and digest-bound;
- [ ] policy versions advance exactly by one and name the parent digest;
- [ ] remote messages cannot install, select or relax policy;
- [ ] dimensions, criteria, source bindings, groups, eligibility, quarantine,
      recovery, limits and redaction are all explicit;
- [ ] eligibility rules are closed non-empty request templates, and requests
      exactly match one policy rule without omitting or relaxing requirements;
- [ ] dimension policy freezes priors, coverage, decay and uncertainty growth;
- [ ] criterion policy freezes outcome values, weight caps, evidence age,
      group thresholds and quarantine/recovery eligibility;
- [ ] every support, contradiction and Challenge-resolution group/weight
      threshold is positive; zero-threshold policies are rejected;
- [ ] Claim-source Attestation is exact source-kind/ID equality, is disabled by
      default and never counts toward an independent-group minimum;
- [ ] every effective source maps to one local dependency group;
- [ ] unknown sources are record-only and have zero effective weight;
- [ ] dependency-group caps cannot be increased by additional identities;
- [ ] group policy separately caps Attestation weight per Claim and aggregate
      profile weight per dimension/criterion across all roots and identities;
- [ ] source binding validity uses trusted logical time;
- [ ] stale or rebound policy/source dependencies invalidate later evaluation
      without rewriting historical decisions.
- [ ] resolver and integration dependency bindings are local-only, immutable,
      version-linked, policy-bound and exact-kind checked;
- [ ] missing, expired or rebound dependency bindings produce unavailable and
      never fall back to an unbound component;

## Deterministic Fusion

- [ ] Fusion executes the eight ordered stages in the implementation plan;
- [ ] one exact subject, scope, policy and logical time identify evaluation;
- [ ] pending, retracted, conflicted, challenged, stale, unavailable and
      cross-scope Claims cannot contribute;
- [ ] source weight uses checked integer multiplication and floor division;
- [ ] group contribution obeys exact local caps;
- [ ] group disposition is determined before deterministic cap allocation and
      mixed support/contradiction resolves conservatively;
- [ ] a group containing support and contradiction resolves conservatively as
      contradiction with an explicit reason;
- [ ] support and contradiction require both group-count and weight thresholds;
- [ ] simultaneous thresholds produce contested, not an arbitrary tie-break;
- [ ] inter-Challenge basis dependencies use the well-founded lower fixed
      point; acyclic blockers may be defeated and recursive blocker cycles are
      unavailable without arrival-order selection;
- [ ] contradicted Claims are excluded and never inverted into facts;
- [ ] supported violated Claims are the only negative Claim contributions;
- [ ] decay uses trusted effective time and integer steps;
- [ ] replay never refreshes freshness or effective weight;
- [ ] a root basis cannot be counted twice;
- [ ] conflicting values for one root basis are excluded and increase contested
      uncertainty;
- [ ] aggregate source-group profile caps apply across every Claim/root/identity
      rather than once per root;
- [ ] Attestation groups qualify one Claim but cannot be counted as multiple
      independent Claim sources for profile, quarantine or recovery diversity;
- [ ] candidate ordering is deterministic by logical time and digest;
- [ ] scores and uncertainty use the exact checked integer formulas;
- [ ] age uncertainty, contradiction pressure and profile status use closed
      policy fields and exact formulas;
- [ ] contradiction uncertainty per contested/root/challenged target is
      strictly positive and policy-capped;
- [ ] prior score/weight always come from policy, never the previous profile;
- [ ] input-set digest includes considered excluded/unavailable records;
- [ ] Fusion Decision explains every inclusion, exclusion, group cap, weight and
      stable reason code;
- [ ] same state/input/time yields byte-identical decision and trace digest.

## Trust Profiles and eligibility

- [ ] profiles are local, immutable, subject/scope/policy-bound projections;
- [ ] dimensions remain independent and no overall score is exported;
- [ ] each dimension carries score, uncertainty, effective weight and exact
      supporting Evidence IDs/groups;
- [ ] profile history is bounded without losing live security state;
- [ ] profile status distinguishes unknown, supported, contested and degraded;
- [ ] eligibility names explicit per-dimension score and uncertainty bounds;
- [ ] missing, stale, mismatched or excessively uncertain profiles return
      unavailable, never eligible;
- [ ] eligibility performs exact policy-bound profile/quarantine key lookup and
      never selects a latest subject-only head;
- [ ] active quarantine returns quarantined only for its exact dimension/scope;
- [ ] observe mode records the would-restrict result without changing the
      delegated operation;
- [ ] restrict mode can only be applied by an explicit integration adapter;
- [ ] profiles never enter Auth, admission, lease, grant or context-promotion
      state;
- [ ] remote Trust observations never contribute recursively to a profile.

## Decay, contradiction and clock safety

- [ ] decay interval, rate and floor are policy-bound;
- [ ] uncertainty growth is integer-only and bounded;
- [ ] clock rollback fails before state or profile mutation;
- [ ] large time advances cannot overflow arithmetic;
- [ ] decay cannot turn an unsupported Claim into supported;
- [ ] decay alone cannot lift quarantine;
- [ ] unresolved contradictions raise uncertainty;
- [ ] exact duplicate Evidence does not change score, uncertainty or weight;
- [ ] delayed/reordered Evidence converges to the same projection when the
      accepted record set and logical evaluation time are equal;
- [ ] source compromise and later key revocation cannot make new Evidence
      effective, while historical records remain attributable.

## Quarantine and recovery

- [ ] quarantine activation requires a supported violated Claim from a
      quarantine-eligible criterion;
- [ ] activation also requires configured negative group count, weight and
      dimension score threshold;
- [ ] missing or merely uncertain Evidence does not create a negative penalty;
- [ ] quarantine key contains tenant, exact subject, scope, dimension and
      policy digest;
- [ ] quarantine history is append-only and revision-linked;
- [ ] reaching review time transitions to review-required and does not lift the
      restriction; a capacity-exhausted final active head uses the documented
      canonical review-required projection and can only review as unavailable;
- [ ] recovery evaluation is explicit and occurs only after review time;
- [ ] recovery uses only supported positive Evidence accepted after activation;
- [ ] recovery groups are disjoint from activation dependency groups and every
      effective Claim/Attestation/content resolution is post-activation;
- [ ] recovery requires configured independent groups, weight, score and
      uncertainty;
- [ ] unresolved qualifying negative Evidence, Challenge or equivocation blocks
      recovery;
- [ ] self-claims, old replay, remote observations and time alone cannot recover;
- [ ] successful recovery appends a revision and preserves negative history;
- [ ] a recovered key reactivates only from new post-recovery qualifying
      negative Evidence, and per-key revision exhaustion fails closed;
- [ ] quarantine/recovery in one tenant, scope, capability or dimension cannot
      affect another.

## State, snapshot and restore

- [ ] state is deeply frozen and contains logical-time high-water, limits,
      policies, bindings, records, decisions, profiles, quarantines,
      diagnostics, trace digest and encoded bytes;
- [ ] reducer has no wall clock, random source, I/O or mutable dependency;
- [ ] ordered effects are frozen, bounded and redacted;
- [ ] full snapshots are classified as sensitive application data;
- [ ] restore validates strict structure and aggregate limits;
- [ ] restore recomputes every content-bound ID and domain digest;
- [ ] restore validates policy lineage and dependency bindings;
- [ ] content resolutions and invalidations are append-only, digest-bound and
      validated against the exact historical resolver binding active at their
      recorded time;
- [ ] current Fusion requires a current-binding resolution after resolver
      rotation while historical resolutions remain restorable and ineffective;
- [ ] restorable snapshots require a construction-bound cryptographic integrity
      proof over state/generation/digests and never rely on hashes as
      authentication;
- [ ] restore requires an exact trusted external rollback anchor and rejects an
      older authentic or unanchored newer snapshot;
- [ ] every `verified_mesh` record restores only after its original signed
      envelope/proof is revalidated from authenticated composite Mesh state;
- [ ] verified Mesh restore resolves the exact historical origin-verifier
      binding and requires its upstream digest to equal the record's historical
      Mesh-ingress binding;
- [ ] wrong verifier kind/link, verifier rebind without history and missing
      historical proof fail, while a valid historical binding still restores;
- [ ] every retained causal authorization is reverified through its exact
      historical construction-bound registry entry on restore;
- [ ] states retaining causal authorizations require that verifier registry on
      every later reducer transition;
- [ ] pure state validation is documented and tested as structural projection
      validation, never as an authentication or import boundary;
- [ ] absent or invalid protector, anchor or origin proof leaves restrict-mode
      state unavailable, never eligible;
- [ ] restore rebuilds all indexes from retained records;
- [ ] restore recomputes and compares Fusion Decisions and profile heads;
- [ ] forged score, omitted contradiction, truncated record, clock rollback,
      stale policy and broken quarantine chain fail closed;
- [ ] coherently recomputed snapshot attacks that remove quarantine/
      contradiction, advance effective time or insert verified Evidence fail
      against protector, anchor or origin verification;
- [ ] redacted projection declares `restorable: false` and cannot enter restore;
- [ ] quiescent snapshot round trip is byte-equivalent;
- [ ] import and restore perform no network access or migration side effects.

## Mesh wire payloads

- [ ] all four `evidence.*` families and `trust.observation` have closed types;
- [ ] each family has a canonical wire-v0 fixture;
- [ ] strict validator rejects unknown fields and wrong discriminants;
- [ ] content-bound IDs are recomputed during payload validation;
- [ ] envelope tenant/Mesh/Objective align with payload scope;
- [ ] Evidence message TTL never exceeds five minutes;
- [ ] Claim sender equals Claim source;
- [ ] work-derived Claim requires locally accepted immutable historical causal
      state;
- [ ] present Attestation/Challenge/Retraction targets require exact same-scope
      ID and digest, plus original authorship for Retraction;
- [ ] absent targets enter only a bounded pending index after authenticated
      envelope checks and cannot affect Fusion, quarantine or recovery;
- [ ] target arrival deterministically resolves pending relationship scope,
      digest and authorship to active, conflicted or unavailable;
- [ ] Trust observation sender equals observer and grants no authority;
- [ ] observation score/uncertainty bands use fixed V1 boundaries;
- [ ] remote observations are `remote_unverified` or `locally_correlated` only
      after exact local digest equality, and neither enters Fusion;
- [ ] Evidence/Trust message types enforce a five-minute lifetime separately
      from the general protocol ceiling;
- [ ] malformed, wrong-ID, cross-scope and exact/one-over fixtures are public;
- [ ] older fixtures remain readable and byte-stable where promised;
- [ ] legacy Alpha 1/2 routes still reject Evidence families unless the Alpha 4
      boundary is constructed;
- [ ] chained tests prove protocol Alpha 4 accepts a valid payload, legacy Mesh
      routes reject it, and only `@agentplat/mesh/trust` performs the
      authenticated Trust transition;
- [ ] no unknown-message downgrade or generic extension fallback exists.

## Authenticated Mesh boundary

- [ ] processor construction-binds crypto, resolver, protocol limits, local
      identity, admission, source policy and accepted coordination state;
- [ ] processing order is parse, scope/freshness, crypto, admission/role,
      replay, causal authority, Evidence binding, then Trust transition;
- [ ] direct payload input cannot claim verified Mesh origin;
- [ ] unknown, expired or revoked keys fail before Trust mutation;
- [ ] shared replay/message-ID state is non-evictable and snapshot-restorable;
- [ ] composite transition updates replay and Trust atomically in its returned
      immutable state;
- [ ] wrong audience, role, Objective, Work, revision, epoch or fence fails;
- [ ] public rejection codes are coarse and diagnostics do not echo payload;
- [ ] Mesh eligibility filter cannot add candidates or create assignment;
- [ ] Mesh restrict filtering accepts only the construction-bound composite
      runtime restored through the exact current protected snapshot and
      rollback anchor; raw/structural/cloned state is unavailable;
- [ ] Mesh evaluation time equals the authenticated snapshot creation time;
      older runtimes and clock rewind are unavailable;
- [ ] observe filter preserves original candidate set;
- [ ] restrict filter returns a subset or unavailable and never auto-selects;
- [ ] existing Mesh root, loopback and coordination behavior remains unchanged.

## Inference Control boundary

- [ ] only accepted assessments or terminal controlled outcomes produce Claim
      candidates;
- [ ] candidate binds request/assessment/target/scope/dependency digests;
- [ ] conversion excludes raw prompt, output, action arguments and message body;
- [ ] application must explicitly admit the candidate to Trust state;
- [ ] evidence references are exact, bounded and digest-verifiable;
- [ ] Trust-bound wrappers use construction-bound synchronous resolvers;
- [ ] wrapper binding digest includes Trust policy, resolver, mapping and base
      binding digest;
- [ ] model wrapper checks before execution;
- [ ] action and message wrappers revalidate immediately before delegation;
- [ ] stale, mismatched, unavailable or quarantined state refuses only in
      restrict mode;
- [ ] observe mode delegates and emits redacted evidence;
- [ ] wrappers cannot issue or relax an Action Grant;
- [ ] Action Gateway consumption, authority revalidation, idempotency and
      downstream fencing remain mandatory and unchanged;
- [ ] direct legacy calls remain outside the opt-in Trust boundary.

## Adversarial and deterministic scenarios

- [ ] valid supported Claim and profile derivation;
- [ ] zero support/contradiction/Challenge thresholds are rejected;
- [ ] duplicate idempotency for every Evidence family;
- [ ] same logical relationship with conflicting content;
- [ ] relationship equivocation remains ineffective after Retraction;
- [ ] Attestation/Challenge/Retraction before target;
- [ ] unrelated third-party Claim citing otherwise valid Work Evidence;
- [ ] cross-tenant/Mesh/Objective/Work/revision/epoch/fence replay;
- [ ] revoked-key and stale-key Evidence;
- [ ] compromised source plus independent contradiction;
- [ ] author Retraction versus third-party/cross-scope attempts;
- [ ] multiple colluding identities in one dependency group;
- [ ] 1,024 Claims and roots from one dependency group remain under one
      aggregate dimension/criterion cap;
- [ ] unbound identity burst has zero effective weight;
- [ ] self-Attestation and cyclic dependency rejection;
- [ ] Claim-source Attestation disabled/enabled vectors preserve independent
      group thresholds;
- [ ] unresolved external Challenge basis and same-group Challenge identity
      multiplication do not block a target;
- [ ] unresolved, dismissed, sustained and contested Challenge projection;
- [ ] decay and clock rollback;
- [ ] exact-scope quarantine isolation;
- [ ] new-evidence recovery versus replayed-old-evidence failure;
- [ ] partially overlapping activation/recovery groups fail recovery;
- [ ] missing/mutated/unauthorized referenced content;
- [ ] forged, stale and invalidated content-resolution records;
- [ ] forged snapshot/profile/policy/quarantine state;
- [ ] coherent all-digest snapshot rewrite, authentic-generation rollback and
      fabricated `verified_mesh` origin all fail external verification;
- [ ] resolver rotation retains restorable history and requires a new
      current-binding resolution for Fusion;
- [ ] capacity floods preserve live security state;
- [ ] loss, duplicate, delay, reorder and partition convergence;
- [ ] remote Trust observation recursion attempt;
- [ ] direct-boundary bypass receives no new authority;
- [ ] Alpha 1/2/3 regression scenario replay;
- [ ] packed and registry-installed Trust scenario;
- [ ] every scenario reports version, seed, config digest, fault-plan digest,
      trace digest and first divergence.

## Security and privacy

- [ ] threat model states that signatures prove integrity, not truth;
- [ ] Sybil resistance depends on admission and configured dependency groups;
- [ ] colluding-majority limitation is explicit;
- [ ] external content resolver prevents authorization and digest TOCTOU;
- [ ] raw content, references, dependency topology and private policy details are
      absent from normal telemetry;
- [ ] full snapshots and unredacted decisions are treated as sensitive;
- [ ] public diagnostics are bounded and do not become a policy oracle;
- [ ] Trust cannot promote untrusted context or bypass Inference Control;
- [ ] quarantine cannot propagate across tenant/scope by default;
- [ ] denial-of-service limits cover Evidence, challenges, graph depth, Fusion,
      profiles, quarantine and diagnostics;
- [ ] public source and built artifacts pass the terminology/secret audit;
- [ ] external non-empty denylist passes source, build and tarball audit.

## Compatibility

- [ ] existing Runtime, Model, Tools, Streaming, Sessions, Rooms, Framework,
      Audit and Auth public types have no required-field or closed-union change;
- [ ] existing behavior remains unchanged without explicit Trust construction;
- [ ] Framework does not depend on or re-export Trust;
- [ ] Trust snapshot schema 1 remains separate from existing snapshots;
- [ ] Mesh wire version remains 0 with explicit old-node rejection;
- [ ] Alpha 1/2/3 canonical fixtures required by policy remain readable;
- [ ] Alpha 2 allocation/recovery state versions remain readable;
- [ ] Alpha 3 Inference Control state and behavior remain readable/unchanged;
- [ ] imports never run persistence migration;
- [ ] browser-safe entrypoints have no Node or vendor SDK dependency;
- [ ] public TypeScript consumers compile with `skipLibCheck: false`;
- [ ] existing clean tarball consumers remain green.

## Package and release gates

- [ ] public catalog contains exactly 30 ASCII-ordered package entries;
- [ ] `@agentplat/trust` is provider-neutral, publishable and pack-smoked;
- [ ] root and all 30 manifests use fixed version `0.3.0-alpha.4`;
- [ ] internal dependencies use the coordinated version in packed manifests;
- [ ] versioned cohort guard accepts historical 29-package Alpha 3 and current
      30-package Alpha 4 fixtures only;
- [ ] cohort guard rejects 29/31 Alpha 4, 30 Alpha 3, missing/duplicate Trust,
      mixed versions, catalog mismatch and root mismatch before pack or
      registry access;
- [ ] clean install with frozen lockfile succeeds without registry credentials;
- [ ] `pnpm check` passes public audit, clean build, public type checks, unit,
      adapter, legacy scenario, Trust scenario, release and pack gates;
- [ ] all tarballs contain only intended public files and imports;
- [ ] Trust functional consumer executes root, Mesh and Inference Control
      subpaths from tarballs;
- [ ] registry consumer installs exact Alpha 4 package versions and executes the
      Trust scenario without credentials.

## Coordinated publication

- [ ] use repository-scoped npm publisher credentials or Trusted Publishing;
- [ ] run from the reviewed release commit on a clean `main` checkout;
- [ ] record prior `next` rollback target for all 30 packages;
- [ ] complete no-mutation dry-run with `NPM_DIST_TAG=next`;
- [ ] confirm candidate is absent or registry-equivalent for every package;
- [ ] publish missing packages under commit-specific staging tag;
- [ ] verify registry SHA-512 metadata against every local tarball;
- [ ] promote the complete 30-package cohort to `next`;
- [ ] conditionally roll back only tags still targeting the failed candidate;
- [ ] remove candidate staging tags after complete promotion;
- [ ] install exact versions in a credential-free clean registry consumer;
- [ ] execute exact-version Evidence and Trust scenario;
- [ ] create and push annotated `v0.3.0-alpha.4` at verified release commit;
- [ ] record workflow URL, release commit, publication time, previous targets,
      staging tag, integrities and consumer result;
- [ ] record first-publication `latest` behavior for the new package without
      treating it as coordinated stable promotion.

## Definition of accepted

Alpha 4 is accepted only when every applicable item above is checked and linked
to reproducible evidence. Any failed safety invariant, open P0/P1, package
integrity mismatch, cross-tenant effect, authority escalation or incomplete
coordinated promotion blocks the release.
