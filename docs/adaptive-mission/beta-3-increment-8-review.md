# AgentPlat `0.3.0-beta.3` Increment 8 review

Status: release-candidate implementation evidence. This increment freezes the
public statistical-campaign contracts, scale configuration, bundle verifier,
package-consumer smoke and operations specification. It does not claim that a
50/100/250/500-agent campaign has run, that thresholds have passed, or that a
release artifact has been published.

## Frozen registration and manifest

The evaluation subpath defines two closed profiles. Preflight has two seeds for
each of four strata at 50 agents (eight cells). Normative has 10 paired seeds
per smaller scale/stratum and 30 at 500 (240 cells, or 960 execution slots when
first/replay is included for both runners). Cell order and identity are
canonical. Every cell commits its exact scale configuration, scale-specific
interaction ceiling, runner definitions, fault plan and fault-matrix binding.

Registration validation rejects a missing, added, reordered or substituted
cell. The terminal manifest retains exactly one ordered success/failure record
per registered cell. Success binds both runners' result, trace, ledger and
campaign-evidence digests plus comparison fairness; failure carries a reason
and cannot masquerade partial success evidence as completion.

## Deterministic scale configuration

The closed ladder is 50/100/250/500 agents with 300/700/2,000/4,500 directed
edges and 1,000/1,600/3,000/5,000 interaction ceilings. Each topology contains
a directed ring for connectivity and deterministic, unique seeded neighbors.
The four strata are nominal, benign, adversarial and mixed. Nominal registers
no injected fault; the others bind the six closed resilience fault families.
Observed coverage must equal the registered row exactly.

This is configuration and verification machinery. The daily smoke does not
allocate or run any ladder row, and the repository makes no capacity or
statistical-pass claim from it.

## Closed evidence bundle

The bundle carries a trusted-source lock, package/fixture/policy/environment/
observation-policy/monitor/canary commitments, the canonical public
registration and manifest, every sample's trace, interaction ledger and
evidence, per-cell comparisons, and the final summary. Its expected-artifact
set and index must be identical closures.

The verifier derives cell and seed admission only from the public registration.
It requires adaptive and centralized first/replay records for every cell,
rejects an unreferenced registration or artifact, binds success manifest
digests to first executions, retains failed executions and recomputes
comparison and summary statistics through required independent hooks. Replay
must match the stable outcome, trace records, ledger records and observations.

No path is opened. Inputs are snapshotted once from data descriptors before
use, accessors and malformed JSON shapes fail closed, artifact paths are safe
relative names, individual artifacts are limited to 16 MiB and total supplied
bytes to 256 MiB before decoding. A source lock must match an expectation
provided outside the self-described bundle.

## Consumers and operational boundary

The existing compact resilience consumer now imports the public registration
and scale APIs from coordinated tarballs under both isolated pnpm and
independent npm installs. It constructs a 50-agent topology and matrix without
executing the scale campaign. The daily command is named and labeled as a
contract smoke, reports dirty local source state, and derives its commitments
from the current commit/tree, lockfile blob and package version.

The operations document describes the normative campaign as a future release
operation. No scheduled/manual evidence workflow or completed statistical
threshold is implied by this increment.

## Independent review and remediation

Cross-review initially found and closed:

- a bundle registration parallel to, and weaker than, the public schedule;
- no binding from the bundle to the terminal manifest;
- unbounded artifact bytes and repeated reads of untrusted objects;
- unreferenced registration artifacts admitted by the index;
- replay equality limited to an outcome digest;
- a global ceiling that did not bind each scale row;
- fault-plan fields populated with a configuration digest;
- self-described source/package commitments;
- a package consumer that imported but did not exercise the new semantics; and
- operational prose that could be read as an existing campaign workflow.

Final independent cross-reviews report zero open P0, P1 and P2 findings in the
Increment 8 scope.

## Verification evidence

Focused evidence before the repository-wide gate:

- builds for Collective Planning and Mesh Sim;
- public TypeScript contracts, including negative closed-union and immutability
  cases;
- registration, manifest, scale, fault coverage and bundle verifier tests;
- accessor/TOCTOU, omission, substitution, provenance and byte-limit negative
  cases; and
- the registration/configuration-only contract smoke.

The repository-wide `pnpm check` passes, including 701 unit-test cases (695
passed and six explicit TODOs), compatibility/fixture gates, adapter checks,
the contract smoke and all 37 isolated tarballs under pnpm and independent npm.
Pull-request CI and the exact merged-main workflow remain integration gates
recorded at delivery.

## Deferred release boundaries

The normative ladder execution, threshold analysis, raw release evidence and
nightly/manual sharding workflow remain open acceptance work. Release staging,
dist-tag promotion, annotated tagging and evidence-only merge remain a later
release objective. No unchecked acceptance item is implied by Increment 8.
