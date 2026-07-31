# Evidence and Trust `0.3.0-alpha.4` acceptance checklist

Status: implementation verified. Coordinated publication evidence is pending.

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

## Candidate verification

The implementation candidate was verified on 2026-07-31 with the external
release terminology denylist and the repository-owned gates:

- `pnpm run audit:public:release` passed against source, build and packed
  artifacts;
- `pnpm run check` passed build, strict public types, unit/adaptor regression,
  28 Inference Control scenarios, the 27-scenario Trust catalog, release cohort
  validation and clean consumers for 30 tarballs with 41 declared exports;
- three independent architecture, security and compatibility reviews reported
  zero open P0/P1 findings.

The reviewed commit, workflow runs, registry integrities, previous distribution
tags and exact-version consumer result are recorded after the clean `main`
publication transition below.

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

- [x] strict JSON rejects unknown keys, accessors, symbols, custom prototypes,
      sparse arrays, cycles, invalid Unicode and non-finite numbers;
- [x] byte, depth, node, key and array limits apply before cloning or mutation;
- [x] canonical object ordering uses Unicode code units, not locale collation;
- [x] arrays with set semantics must be unique and pre-sorted;
- [x] every causal/basis reference carries a closed kind, type, exact ID and
      exact digest; bare IDs are rejected;
- [x] Claim and Challenge authority is retained only as a content-bound causal
      authorization verified through the exact policy/upstream binding;
- [x] authorization bases cannot come from the future; Evidence-only chains
      must reach a non-Evidence terminal root without cycles;
- [x] all arithmetic uses checked safe integers;
- [x] SHA-256 digest input uses the exact
      `agentplat.trust/<domain>/v1\0` prefix;
- [x] every closed digest domain has positive, cross-domain and tampering tests;
- [x] reducer, Fusion, eligibility and quarantine outputs use only the closed V1
      reason-code union, and restore rejects unknown codes;
- [x] Claim, Attestation, Challenge, Retraction and observation IDs are derived
      from their exact domain digest;
- [x] family relationship digests identify source/target or source/subject/
      criterion/root-basis relationships independently from record IDs;
- [x] conflicting content under one relationship is permanent V1 equivocation
      even after Retraction;
- [x] shared `@agentplat/trust/mesh-records` normalizers map signed wire fields
      to exact root records with no mutable-state input;
- [x] every root family retains explicit nullable causation and causation
      mutation changes its content digest;
- [x] protocol and Trust cross-package fixtures produce identical IDs/digests;
- [x] cross-package fixtures mutate envelope causation and every foreign digest
      encoding independently and reject mismatches;
- [x] supplied ID mismatch fails before state mutation;
- [x] exact duplicates are idempotent;
- [x] conflicting logical relationships are retained as bounded equivocation
      and excluded from effective fusion;
- [x] package root imports without clock, random, network, persistence,
      registration or telemetry side effects;
- [x] package root passes the browser dependency-closure audit.
- [x] `@agentplat/trust` root and `./mesh-records` are declared browser-safe;
- [x] Mesh/Inference Control Trust integration subpaths are server-only in
      Alpha 4 and have Node tarball smoke coverage;

## Scopes, subjects and limits

- [x] standalone, Mesh, Objective, Work and controlled-run scopes are closed
      tagged unions;
- [x] Work scope binds Objective/Work revisions, assignment epoch, authority ID
      and fencing token;
- [x] subjects distinguish peer from peer-capability scope;
- [x] capability profiles cannot substitute peer profiles or cross scope;
- [x] profile and quarantine keys include exact `policyDigest` and cannot share
      heads across policies;
- [x] tenant and Mesh identity alignment is checked in every composite state;
- [x] configurable limits cannot exceed tested V1 ceilings;
- [x] exact-limit and one-over-limit tests cover every collection and byte cap;
- [x] capacity exhaustion is fail-closed and does not evict live retraction,
      equivocation, quarantine, replay or idempotency state;
- [x] encoded state bytes are recomputed and verified after every transition.

## Claim lifecycle

- [x] Claim schema binds source, subject, scope, criterion, outcome, assertion
      digest, content metadata, basis references and observed time;
- [x] `observedAt` is treated as Evidence, never as trusted local time;
- [x] inline summaries and references are mutually exclusive and bounded;
- [x] inline byte count and SHA-256 digest are recomputed from exact UTF-8 bytes;
- [x] reference byte count is exact and resolver checks immutable version,
      media type, bytes and digest;
- [x] referenced content carries one typed `EvidenceReferenceV1`, and resolution
      ID/digest fields equal that exact descriptor without encoding conversion;
- [x] assertion digest has one normative preimage and is recomputed;
- [x] typed roots and root-basis digests are acyclic, bounded and unique;
- [x] referenced content never triggers a reducer network fetch;
- [x] content-required Claims are unavailable until authorization, media type,
      size and digest are verified by a bound resolver;
- [x] content-resolution inputs bind Claim, reference, resolver digest, media
      type, byte count and trusted verification time without retaining bytes;
- [x] `satisfied`, `violated` and `inconclusive` outcomes have only local-policy
      semantics;
- [x] unsupported criteria and ineffective sources may be retained but have
      zero Fusion weight;
- [x] work-derived Claims require a locally accepted immutable result/checkpoint causal
      reference and exact historical accepted authority binding;
- [x] delayed work-derived Claims resolve immutable historical authority rather
      than requiring the assignment to remain the current head;
- [x] effective time comes from the accepted producing record, so delayed
      delivery cannot rejuvenate Evidence;
- [x] each criterion has a closed Claim-authority rule for source relation and
      permitted basis kinds/counts;
- [x] peer/capability Claims default to source-equals-subject and exact accepted
      capability owner/version/revision;
- [x] owner/observer/witness third-party Claims require an explicitly permitted
      historical role and exact subject relation;
- [x] unrelated peers fail with `claim_subject_authority_invalid` before state
      mutation;
- [x] stale epoch, stale fence and causal-scope mismatch fail closed;
- [x] duplicate, reordered, pending, conflict and capacity behavior is
      deterministic.
- [x] pending relationships expire deterministically to unavailable at the
      configured trusted-logical-time bound without losing replay evidence;

## Attestation lifecycle

- [x] Attestation targets exact Claim ID plus Claim digest in the same scope;
- [x] disposition is exactly support, contradict or inconclusive;
- [x] confidence is an integer from 0 through 10,000 and is capped by local
      source/group policy;
- [x] one source cannot create multiple effective Attestations for one Claim;
- [x] conflicting Attestations by one source create equivocation;
- [x] self-Attestation cannot satisfy an independence threshold;
- [x] unknown or inactive source binding produces zero weight;
- [x] Attestation before Claim remains bounded pending and cannot fuse early;
- [x] cross-tenant, cross-scope and wrong-digest targets fail closed;
- [x] retracted, challenged, conflicted and stale Attestations are ineffective.

## Challenge and Retraction lifecycle

- [x] Challenge targets one inspectable exact Claim or Attestation;
- [x] Challenge requires a non-empty bounded basis and authorized same-scope
      challenger;
- [x] every criterion has a Challenge-authority rule covering challenger
      relation, allowed typed bases/counts and mandatory basis resolution;
- [x] unresolved, irrelevant or unauthorized Challenge bases cannot block a
      target;
- [x] only one Challenge per target and challenger dependency group is
      effective under every identity count and arrival order;
- [x] same-group Challenges aggregate canonically; their causal cutoff derives
      from resolved basis effective times and cannot move forward when another
      identity arrives;
- [x] two same-group Challenges admitted in opposite orders yield the same
      resolution, decision, profile and digests;
- [x] Challenge alone cannot create a negative profile contribution or
      quarantine;
- [x] an unresolved Challenge prevents only its exact target from contributing
      positively and raises uncertainty;
- [x] Challenge resolution is a deterministic policy-bound projection using
      only independent Attestations after the resolved causal-basis cutoff and
      exact group caps;
- [x] Claim and Attestation target corroboration/opposition mappings, threshold
      order and terminal results are closed and covered by vectors;
- [x] a target contributes only when every active group Challenge is dismissed;
- [x] unresolved/sustained/contested group Challenges raise uncertainty once per
      target, while dismissed Challenges add no weight;
- [x] challenge flood is bounded per source, scope and state;
- [x] exact and one-over tests cover active and pending Challenge quotas per
      source/scope;
- [x] Retraction targets only a Claim or Attestation by exact digest;
- [x] only the original author may retract;
- [x] Retraction never deletes history, Challenges, decisions or diagnostics;
- [x] third-party, cross-scope and wrong-digest Retractions fail closed;
- [x] Retraction before target is pending and becomes effective only after
      authorship and scope resolve;
- [x] an admitted original author may retract its own historical target after
      current Fusion weight/role expiry;
- [x] replayed Retraction is idempotent and cannot refresh time.

## Policy and source bindings

- [x] Fusion policies are local-only, closed, immutable and digest-bound;
- [x] policy versions advance exactly by one and name the parent digest;
- [x] remote messages cannot install, select or relax policy;
- [x] dimensions, criteria, source bindings, groups, eligibility, quarantine,
      recovery, limits and redaction are all explicit;
- [x] eligibility rules are closed non-empty request templates, and requests
      exactly match one policy rule without omitting or relaxing requirements;
- [x] dimension policy freezes priors, coverage, decay and uncertainty growth;
- [x] criterion policy freezes outcome values, weight caps, evidence age,
      group thresholds and quarantine/recovery eligibility;
- [x] every support, contradiction and Challenge-resolution group/weight
      threshold is positive; zero-threshold policies are rejected;
- [x] Claim-source Attestation is exact source-kind/ID equality, is disabled by
      default and never counts toward an independent-group minimum;
- [x] every effective source maps to one local dependency group;
- [x] unknown sources are record-only and have zero effective weight;
- [x] dependency-group caps cannot be increased by additional identities;
- [x] group policy separately caps Attestation weight per Claim and aggregate
      profile weight per dimension/criterion across all roots and identities;
- [x] source binding validity uses trusted logical time;
- [x] stale or rebound policy/source dependencies invalidate later evaluation
      without rewriting historical decisions.
- [x] resolver and integration dependency bindings are local-only, immutable,
      version-linked, policy-bound and exact-kind checked;
- [x] missing, expired or rebound dependency bindings produce unavailable and
      never fall back to an unbound component;

## Deterministic Fusion

- [x] Fusion executes the eight ordered stages in the implementation plan;
- [x] one exact subject, scope, policy and logical time identify evaluation;
- [x] pending, retracted, conflicted, challenged, stale, unavailable and
      cross-scope Claims cannot contribute;
- [x] source weight uses checked integer multiplication and floor division;
- [x] group contribution obeys exact local caps;
- [x] group disposition is determined before deterministic cap allocation and
      mixed support/contradiction resolves conservatively;
- [x] a group containing support and contradiction resolves conservatively as
      contradiction with an explicit reason;
- [x] support and contradiction require both group-count and weight thresholds;
- [x] simultaneous thresholds produce contested, not an arbitrary tie-break;
- [x] inter-Challenge basis dependencies use the well-founded lower fixed
      point; acyclic blockers may be defeated and recursive blocker cycles are
      unavailable without arrival-order selection;
- [x] contradicted Claims are excluded and never inverted into facts;
- [x] supported violated Claims are the only negative Claim contributions;
- [x] decay uses trusted effective time and integer steps;
- [x] replay never refreshes freshness or effective weight;
- [x] a root basis cannot be counted twice;
- [x] conflicting values for one root basis are excluded and increase contested
      uncertainty;
- [x] aggregate source-group profile caps apply across every Claim/root/identity
      rather than once per root;
- [x] Attestation groups qualify one Claim but cannot be counted as multiple
      independent Claim sources for profile, quarantine or recovery diversity;
- [x] candidate ordering is deterministic by logical time and digest;
- [x] scores and uncertainty use the exact checked integer formulas;
- [x] age uncertainty, contradiction pressure and profile status use closed
      policy fields and exact formulas;
- [x] contradiction uncertainty per contested/root/challenged target is
      strictly positive and policy-capped;
- [x] prior score/weight always come from policy, never the previous profile;
- [x] input-set digest includes considered excluded/unavailable records;
- [x] Fusion Decision explains every inclusion, exclusion, group cap, weight and
      stable reason code;
- [x] same state/input/time yields byte-identical decision and trace digest.

## Trust Profiles and eligibility

- [x] profiles are local, immutable, subject/scope/policy-bound projections;
- [x] dimensions remain independent and no overall score is exported;
- [x] each dimension carries score, uncertainty, effective weight and exact
      supporting Evidence IDs/groups;
- [x] profile history is bounded without losing live security state;
- [x] profile status distinguishes unknown, supported, contested and degraded;
- [x] eligibility names explicit per-dimension score and uncertainty bounds;
- [x] missing, stale, mismatched or excessively uncertain profiles return
      unavailable, never eligible;
- [x] eligibility performs exact policy-bound profile/quarantine key lookup and
      never selects a latest subject-only head;
- [x] active quarantine returns quarantined only for its exact dimension/scope;
- [x] observe mode records the would-restrict result without changing the
      delegated operation;
- [x] restrict mode can only be applied by an explicit integration adapter;
- [x] profiles never enter Auth, admission, lease, grant or context-promotion
      state;
- [x] remote Trust observations never contribute recursively to a profile.

## Decay, contradiction and clock safety

- [x] decay interval, rate and floor are policy-bound;
- [x] uncertainty growth is integer-only and bounded;
- [x] clock rollback fails before state or profile mutation;
- [x] large time advances cannot overflow arithmetic;
- [x] decay cannot turn an unsupported Claim into supported;
- [x] decay alone cannot lift quarantine;
- [x] unresolved contradictions raise uncertainty;
- [x] exact duplicate Evidence does not change score, uncertainty or weight;
- [x] delayed/reordered Evidence converges to the same projection when the
      accepted record set and logical evaluation time are equal;
- [x] source compromise and later key revocation cannot make new Evidence
      effective, while historical records remain attributable.

## Quarantine and recovery

- [x] quarantine activation requires a supported violated Claim from a
      quarantine-eligible criterion;
- [x] activation also requires configured negative group count, weight and
      dimension score threshold;
- [x] missing or merely uncertain Evidence does not create a negative penalty;
- [x] quarantine key contains tenant, exact subject, scope, dimension and
      policy digest;
- [x] quarantine history is append-only and revision-linked;
- [x] reaching review time transitions to review-required and does not lift the
      restriction; a capacity-exhausted final active head uses the documented
      canonical review-required projection and can only review as unavailable;
- [x] recovery evaluation is explicit and occurs only after review time;
- [x] recovery uses only supported positive Evidence accepted after activation;
- [x] recovery groups are disjoint from activation dependency groups and every
      effective Claim/Attestation/content resolution is post-activation;
- [x] recovery requires configured independent groups, weight, score and
      uncertainty;
- [x] unresolved qualifying negative Evidence, Challenge or equivocation blocks
      recovery;
- [x] self-claims, old replay, remote observations and time alone cannot recover;
- [x] successful recovery appends a revision and preserves negative history;
- [x] a recovered key reactivates only from new post-recovery qualifying
      negative Evidence, and per-key revision exhaustion fails closed;
- [x] quarantine/recovery in one tenant, scope, capability or dimension cannot
      affect another.

## State, snapshot and restore

- [x] state is deeply frozen and contains logical-time high-water, limits,
      policies, bindings, records, decisions, profiles, quarantines,
      diagnostics, trace digest and encoded bytes;
- [x] reducer has no wall clock, random source, I/O or mutable dependency;
- [x] ordered effects are frozen, bounded and redacted;
- [x] full snapshots are classified as sensitive application data;
- [x] restore validates strict structure and aggregate limits;
- [x] restore recomputes every content-bound ID and domain digest;
- [x] restore validates policy lineage and dependency bindings;
- [x] content resolutions and invalidations are append-only, digest-bound and
      validated against the exact historical resolver binding active at their
      recorded time;
- [x] current Fusion requires a current-binding resolution after resolver
      rotation while historical resolutions remain restorable and ineffective;
- [x] restorable snapshots require a construction-bound cryptographic integrity
      proof over state/generation/digests and never rely on hashes as
      authentication;
- [x] restore requires an exact trusted external rollback anchor and rejects an
      older authentic or unanchored newer snapshot;
- [x] every `verified_mesh` record restores only after its original signed
      envelope/proof is revalidated from authenticated composite Mesh state;
- [x] verified Mesh restore resolves the exact historical origin-verifier
      binding and requires its upstream digest to equal the record's historical
      Mesh-ingress binding;
- [x] wrong verifier kind/link, verifier rebind without history and missing
      historical proof fail, while a valid historical binding still restores;
- [x] every retained causal authorization is reverified through its exact
      historical construction-bound registry entry on restore;
- [x] states retaining causal authorizations require that verifier registry on
      every later reducer transition;
- [x] pure state validation is documented and tested as structural projection
      validation, never as an authentication or import boundary;
- [x] absent or invalid protector, anchor or origin proof leaves restrict-mode
      state unavailable, never eligible;
- [x] restore rebuilds all indexes from retained records;
- [x] restore recomputes and compares Fusion Decisions and profile heads;
- [x] forged score, omitted contradiction, truncated record, clock rollback,
      stale policy and broken quarantine chain fail closed;
- [x] coherently recomputed snapshot attacks that remove quarantine/
      contradiction, advance effective time or insert verified Evidence fail
      against protector, anchor or origin verification;
- [x] redacted projection declares `restorable: false` and cannot enter restore;
- [x] quiescent snapshot round trip is byte-equivalent;
- [x] import and restore perform no network access or migration side effects.

## Mesh wire payloads

- [x] all four `evidence.*` families and `trust.observation` have closed types;
- [x] each family has a canonical wire-v0 fixture;
- [x] strict validator rejects unknown fields and wrong discriminants;
- [x] content-bound IDs are recomputed during payload validation;
- [x] envelope tenant/Mesh/Objective align with payload scope;
- [x] Evidence message TTL never exceeds five minutes;
- [x] Claim sender equals Claim source;
- [x] work-derived Claim requires locally accepted immutable historical causal
      state;
- [x] present Attestation/Challenge/Retraction targets require exact same-scope
      ID and digest, plus original authorship for Retraction;
- [x] absent targets enter only a bounded pending index after authenticated
      envelope checks and cannot affect Fusion, quarantine or recovery;
- [x] target arrival deterministically resolves pending relationship scope,
      digest and authorship to active, conflicted or unavailable;
- [x] Trust observation sender equals observer and grants no authority;
- [x] observation score/uncertainty bands use fixed V1 boundaries;
- [x] remote observations are `remote_unverified` or `locally_correlated` only
      after exact local digest equality, and neither enters Fusion;
- [x] Evidence/Trust message types enforce a five-minute lifetime separately
      from the general protocol ceiling;
- [x] malformed, wrong-ID, cross-scope and exact/one-over fixtures are public;
- [x] older fixtures remain readable and byte-stable where promised;
- [x] legacy Alpha 1/2 routes still reject Evidence families unless the Alpha 4
      boundary is constructed;
- [x] chained tests prove protocol Alpha 4 accepts a valid payload, legacy Mesh
      routes reject it, and only `@agentplat/mesh/trust` performs the
      authenticated Trust transition;
- [x] no unknown-message downgrade or generic extension fallback exists.

## Authenticated Mesh boundary

- [x] processor construction-binds crypto, resolver, protocol limits, local
      identity, admission, source policy and accepted coordination state;
- [x] processing order is parse, scope/freshness, crypto, admission/role,
      replay, causal authority, Evidence binding, then Trust transition;
- [x] direct payload input cannot claim verified Mesh origin;
- [x] unknown, expired or revoked keys fail before Trust mutation;
- [x] shared replay/message-ID state is non-evictable and snapshot-restorable;
- [x] composite transition updates replay and Trust atomically in its returned
      immutable state;
- [x] wrong audience, role, Objective, Work, revision, epoch or fence fails;
- [x] public rejection codes are coarse and diagnostics do not echo payload;
- [x] Mesh eligibility filter cannot add candidates or create assignment;
- [x] Mesh restrict filtering accepts only the construction-bound composite
      runtime restored through the exact current protected snapshot and
      rollback anchor; raw/structural/cloned state is unavailable;
- [x] Mesh evaluation time equals the authenticated snapshot creation time;
      older runtimes and clock rewind are unavailable;
- [x] observe filter preserves original candidate set;
- [x] restrict filter returns a subset or unavailable and never auto-selects;
- [x] existing Mesh root, loopback and coordination behavior remains unchanged.

## Inference Control boundary

- [x] only accepted assessments or terminal controlled outcomes produce Claim
      candidates;
- [x] candidate binds request/assessment/target/scope/dependency digests;
- [x] conversion excludes raw prompt, output, action arguments and message body;
- [x] application must explicitly admit the candidate to Trust state;
- [x] evidence references are exact, bounded and digest-verifiable;
- [x] legacy Trust-bound wrappers retain their construction-bound synchronous
      resolver contracts and behavior unchanged;
- [x] state-backed wrappers accept only opaque runtimes produced by strict
      protected-snapshot restore with the exact external rollback anchor;
- [x] the opaque runtime token exposes no Evidence state; its bound current
      source repeats the exact restore anchor on every synchronous check;
- [x] current-source identity, revision and protector binding are included in
      the eligibility configuration and exact operation-boundary binding;
- [x] the current source is documented and tested as a TCB adapter that reads
      the durable high-water anchor atomically per check and never serves a
      cached head; an unseen authentic successor is outside local detection;
- [x] state-backed evaluation uses only the authenticated snapshot creation
      time; raw clones, replaced generations and clock rewind are unavailable;
- [x] current profile-resolver and operation-boundary heads bind the exact
      Trust policy, subject mapping, full eligibility template and real base
      model/dispatcher implementation digest;
- [x] model wrapper checks before execution;
- [x] model execution captures the exact versioned base boundary and passes it
      the same immutable per-invocation target evaluated by Trust;
- [x] action and message wrappers revalidate immediately before delegation;
- [x] stale, mismatched, unavailable or quarantined state refuses only in
      restrict mode;
- [x] observe mode delegates and emits redacted evidence;
- [x] wrappers cannot issue or relax an Action Grant;
- [x] Action Gateway consumption, authority revalidation, idempotency and
      downstream fencing remain mandatory and unchanged;
- [x] direct legacy calls remain outside the opt-in Trust boundary.

## Adversarial and deterministic scenarios

- [x] valid supported Claim and profile derivation;
- [x] zero support/contradiction/Challenge thresholds are rejected;
- [x] duplicate idempotency for every Evidence family;
- [x] same logical relationship with conflicting content;
- [x] relationship equivocation remains ineffective after Retraction;
- [x] Attestation/Challenge/Retraction before target;
- [x] unrelated third-party Claim citing otherwise valid Work Evidence;
- [x] cross-tenant/Mesh/Objective/Work/revision/epoch/fence replay;
- [x] revoked-key and stale-key Evidence;
- [x] compromised source plus independent contradiction;
- [x] author Retraction versus third-party/cross-scope attempts;
- [x] multiple colluding identities in one dependency group;
- [x] 1,024 Claims and roots from one dependency group remain under one
      aggregate dimension/criterion cap;
- [x] unbound identity burst has zero effective weight;
- [x] self-Attestation and cyclic dependency rejection;
- [x] Claim-source Attestation disabled/enabled vectors preserve independent
      group thresholds;
- [x] unresolved external Challenge basis and same-group Challenge identity
      multiplication do not block a target;
- [x] unresolved, dismissed, sustained and contested Challenge projection;
- [x] decay and clock rollback;
- [x] exact-scope quarantine isolation;
- [x] new-evidence recovery versus replayed-old-evidence failure;
- [x] partially overlapping activation/recovery groups fail recovery;
- [x] missing/mutated/unauthorized referenced content;
- [x] forged, stale and invalidated content-resolution records;
- [x] forged snapshot/profile/policy/quarantine state;
- [x] coherent all-digest snapshot rewrite, authentic-generation rollback and
      fabricated `verified_mesh` origin all fail external verification;
- [x] resolver rotation retains restorable history and requires a new
      current-binding resolution for Fusion;
- [x] capacity floods preserve live security state;
- [x] loss, duplicate, delay, reorder and partition convergence;
- [x] remote Trust observation recursion attempt;
- [x] direct-boundary bypass receives no new authority;
- [x] Alpha 1/2/3 regression scenario replay;
- [x] packed and registry-installed Trust scenario;
- [x] every scenario reports version, seed, config digest, fault-plan digest,
      trace digest and first divergence.

## Security and privacy

- [x] threat model states that signatures prove integrity, not truth;
- [x] Sybil resistance depends on admission and configured dependency groups;
- [x] colluding-majority limitation is explicit;
- [x] external content resolver prevents authorization and digest TOCTOU;
- [x] raw content, references, dependency topology and private policy details are
      absent from normal telemetry;
- [x] full snapshots and unredacted decisions are treated as sensitive;
- [x] public diagnostics are bounded and do not become a policy oracle;
- [x] Trust cannot promote untrusted context or bypass Inference Control;
- [x] quarantine cannot propagate across tenant/scope by default;
- [x] denial-of-service limits cover Evidence, challenges, graph depth, Fusion,
      profiles, quarantine and diagnostics;
- [x] public source and built artifacts pass the terminology/secret audit;
- [x] external non-empty denylist passes source, build and tarball audit.

## Compatibility

- [x] existing Runtime, Model, Tools, Streaming, Sessions, Rooms, Framework,
      Audit and Auth public types have no required-field or closed-union change;
- [x] existing behavior remains unchanged without explicit Trust construction;
- [x] Framework does not depend on or re-export Trust;
- [x] Trust snapshot schema 1 remains separate from existing snapshots;
- [x] Mesh wire version remains 0 with explicit old-node rejection;
- [x] Alpha 1/2/3 canonical fixtures required by policy remain readable;
- [x] Alpha 2 allocation/recovery state versions remain readable;
- [x] Alpha 3 Inference Control state and behavior remain readable/unchanged;
- [x] imports never run persistence migration;
- [x] browser-safe entrypoints have no Node or vendor SDK dependency;
- [x] public TypeScript consumers compile with `skipLibCheck: false`;
- [x] existing clean tarball consumers remain green.

## Package and release gates

- [x] public catalog contains exactly 30 ASCII-ordered package entries;
- [x] `@agentplat/trust` is provider-neutral, publishable and pack-smoked;
- [x] root and all 30 manifests use fixed version `0.3.0-alpha.4`;
- [x] internal dependencies use the coordinated version in packed manifests;
- [x] versioned cohort guard accepts historical 29-package Alpha 3 and current
      30-package Alpha 4 fixtures only;
- [x] cohort guard rejects 29/31 Alpha 4, 30 Alpha 3, missing/duplicate Trust,
      mixed versions, catalog mismatch and root mismatch before pack or
      registry access;
- [x] clean install with frozen lockfile succeeds without registry credentials;
- [x] `pnpm check` passes public audit, clean build, public type checks, unit,
      adapter, legacy scenario, Trust scenario, release and pack gates;
- [x] all tarballs contain only intended public files and imports;
- [x] Trust functional consumer executes root, Mesh and Inference Control
      subpaths from tarballs;
- [x] registry consumer installs exact Alpha 4 package versions and executes the
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
