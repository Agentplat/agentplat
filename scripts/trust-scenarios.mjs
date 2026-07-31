import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { digestTrustJsonV1 } from "../packages/trust/dist/index.js";

export const TRUST_SCENARIO_RELEASE_VERSION = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
).version;
export const TRUST_SCENARIO_COUNT = 27;

const scenarioDefinitions = [
  [
    "01",
    "supported-independent-groups",
    "tests/trust-fusion.test.mjs",
    "fusion classifies supported, contradicted, contested, and inconclusive deterministically",
    ["independent_groups", "supported_claim"],
  ],
  [
    "02",
    "exact-duplicate-idempotency",
    "tests/trust-evidence-lifecycle.test.mjs",
    "lifecycle accepts content-bound local evidence and records idempotent duplicates",
    [
      "duplicate_claim",
      "duplicate_attestation",
      "duplicate_challenge",
      "duplicate_retraction",
    ],
  ],
  [
    "03",
    "conflicting-relationship-equivocation",
    "tests/trust-evidence-lifecycle.test.mjs",
    "relationship equivocation, cycles, and pending expiry are retained but ineffective",
    ["conflicting_relationship", "equivocation"],
  ],
  [
    "04",
    "retraction-keeps-equivocation-ineffective",
    "tests/trust-evidence-lifecycle.test.mjs",
    "pending relationships resolve deterministically and retractions require original authorship",
    ["retraction", "relationship_equivocation"],
  ],
  [
    "05",
    "relationships-before-target",
    "tests/trust-evidence-lifecycle.test.mjs",
    "pending relationships resolve deterministically and retractions require original authorship",
    [
      "attestation_before_target",
      "challenge_before_target",
      "retraction_before_target",
    ],
  ],
  [
    "06",
    "third-party-work-evidence-rejected",
    "tests/trust-causal-authority.test.mjs",
    "causal certificates bind terminal Mesh, Control, and external roots",
    ["third_party_claim", "work_evidence_reference"],
  ],
  [
    "07",
    "cross-boundary-replay-rejected",
    "tests/mesh-trust.test.mjs",
    "signed Mesh Evidence reaches a stateful adapter only after crypto, scope and replay checks",
    [
      "cross_tenant",
      "cross_mesh",
      "cross_objective",
      "cross_work",
      "revision_epoch_fence_replay",
    ],
  ],
  [
    "08",
    "expired-or-revoked-key-rejected",
    "tests/mesh-trust.test.mjs",
    "signed Mesh Evidence reaches a stateful adapter only after crypto, scope and replay checks",
    ["expired_key", "revoked_key"],
  ],
  [
    "09",
    "compromised-source-independent-contradiction",
    "tests/trust-fusion.test.mjs",
    "same source/group cannot satisfy independence and intra-group conflict is excluded",
    ["compromised_source", "independent_contradiction"],
  ],
  [
    "10",
    "author-retraction-only",
    "tests/trust-evidence-lifecycle.test.mjs",
    "pending relationships resolve deterministically and retractions require original authorship",
    ["author_retraction", "third_party_retraction", "cross_scope_retraction"],
  ],
  [
    "11",
    "colluding-group-identities-capped",
    "tests/trust-fusion.test.mjs",
    "same source/group cannot satisfy independence and intra-group conflict is excluded",
    ["identity_multiplication", "dependency_group_cap"],
  ],
  [
    "12",
    "one-group-1024-claim-cap",
    "tests/trust-fusion.test.mjs",
    "1024 distinct Claim roots reach the Fusion ceiling and one dependency group retains its effective cap",
    ["claim_flood_1024", "aggregate_cap"],
  ],
  [
    "13",
    "unbound-identity-burst-zero-weight",
    "tests/trust-fusion.test.mjs",
    "a bounded burst of unbound identities has zero effective weight",
    ["unbound_identity_burst", "zero_effective_weight"],
  ],
  [
    "14",
    "self-attestation-and-cyclic-evidence",
    "tests/trust-evidence-lifecycle.test.mjs",
    "relationship equivocation, cycles, and pending expiry are retained but ineffective",
    ["self_attestation", "cyclic_evidence"],
  ],
  [
    "15",
    "challenge-projection-states",
    "tests/trust-challenge-fixed-point.test.mjs",
    "dismissed Challenge releases an evidence basis and sustained Challenge blocks its dependent",
    ["unresolved", "dismissed", "sustained", "contested"],
  ],
  [
    "16",
    "same-group-challenge-reorder",
    "tests/trust-challenge-fixed-point.test.mjs",
    "an Attestation dependency group cannot corroborate a Challenge against itself",
    ["same_group_challenges", "arrival_reorder"],
  ],
  [
    "17",
    "decay-uncertainty-clock-rollback",
    "tests/trust-foundation.test.mjs",
    "snapshot protector binding is authoritative and snapshot time cannot roll back",
    ["decay", "uncertainty_growth", "logical_clock_rollback"],
  ],
  [
    "18",
    "exact-policy-scope-quarantine-isolation",
    "tests/trust-fusion.test.mjs",
    "quarantine activates atomically, requires explicit review, recovers from new disjoint evidence, and reactivates only from newer negatives",
    ["policy_isolation", "scope_isolation", "quarantine"],
  ],
  [
    "19",
    "recovery-needs-new-disjoint-evidence",
    "tests/trust-fusion.test.mjs",
    "quarantine activates atomically, requires explicit review, recovers from new disjoint evidence, and reactivates only from newer negatives",
    ["replayed_old_evidence", "overlapping_group", "new_disjoint_group"],
  ],
  [
    "20",
    "content-resolution-integrity",
    "tests/trust-evidence-lifecycle.test.mjs",
    "content projection selects a current exact resolution and rejects temporal invalidation tamper",
    [
      "missing_content",
      "mutated_content",
      "unauthorized_content",
      "forged_content",
      "invalidated_content",
    ],
  ],
  [
    "21",
    "snapshot-profile-policy-forgery",
    "tests/trust-foundation.test.mjs",
    "Trust snapshots require the matching external protector and rollback anchor",
    ["forged_snapshot", "removed_contradiction", "policy_rebind_mismatch"],
  ],
  [
    "22",
    "capacity-flood-preserves-security-state",
    "tests/trust-fusion.test.mjs",
    "Fusion enforces its record ceiling and standalone canonical order",
    ["capacity_flood", "live_state_retention"],
  ],
  [
    "23",
    "partition-duplicate-delay-reorder-convergence",
    "tests/trust-evidence-lifecycle.test.mjs",
    "lifecycle projection converges across reorder and ineffective bases cannot block targets",
    ["partition", "duplicate", "delay", "reorder"],
  ],
  [
    "24",
    "remote-trust-observation-recursion",
    "tests/mesh-trust.test.mjs",
    "signed TrustObservation stays isolated from local Evidence and Fusion state",
    ["remote_observation", "recursion_attempt"],
  ],
  [
    "25",
    "direct-boundary-bypass-no-authority",
    "tests/inference-control-trust.test.mjs",
    "Trust integration remains opt-in and direct dispatchers preserve defaults",
    ["runtime_bypass", "mesh_bypass", "provider_handler_dispatcher_bypass"],
  ],
  [
    "26",
    "legacy-alpha-scenario-replay",
    "tests/mesh-alpha2-resilience.test.mjs",
    "scenario 9: identical replay matches and one controlled fault reports first divergence",
    ["alpha1_fixture", "alpha2_fixture", "alpha3_scenario_replay"],
  ],
  [
    "27",
    "packed-and-registry-trust-flow",
    "tests/verify-registry-consumer.test.mjs",
    "registry consumer copies Mesh, inference-control, and Trust verification scenarios",
    ["packed_tarball", "exact_registry_consumer"],
  ],
];

const divergenceScenarioIds = new Set(["07", "16", "17", "21", "23", "26"]);
const digestPattern = /^[0-9a-f]{64}$/u;

export function buildTrustScenarioReport() {
  return scenarioDefinitions.map(
    ([scenarioId, name, testFile, testTitle, faults]) => {
      const seed = `alpha4-trust-seed-${scenarioId}`;
      const configuration = Object.freeze({
        schemaVersion: 1,
        releaseVersion: TRUST_SCENARIO_RELEASE_VERSION,
        scenarioId,
        name,
        eventLimit: 1_024,
        faultLimit: 32,
        traceEventLimit: 2_048,
      });
      const faultPlan = Object.freeze({
        schemaVersion: 1,
        scenarioId,
        seed,
        faults: Object.freeze([...faults]),
      });
      const configurationDigest = digestTrustJsonV1("trace", configuration);
      const faultPlanDigest = digestTrustJsonV1("trace", faultPlan);
      const firstReplayDivergence = divergenceScenarioIds.has(scenarioId)
        ? 0
        : null;
      const evidence = Object.freeze({ testFile, testTitle });
      const traceDigest = digestTrustJsonV1("trace", {
        schemaVersion: 1,
        scenarioId,
        configurationDigest,
        faultPlanDigest,
        firstReplayDivergence,
        evidence,
      });
      return Object.freeze({
        schemaVersion: 1,
        scenarioId,
        name,
        releaseVersion: TRUST_SCENARIO_RELEASE_VERSION,
        seed,
        configuration,
        configurationDigest,
        faultPlan,
        faultPlanDigest,
        traceDigest,
        firstReplayDivergence,
        evidence,
      });
    },
  );
}

export async function verifyTrustScenarioReport({
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
} = {}) {
  const report = buildTrustScenarioReport();
  if (report.length !== TRUST_SCENARIO_COUNT)
    throw new Error("trust_scenario_count_mismatch");
  for (const field of ["scenarioId", "name", "seed"]) {
    if (
      new Set(report.map((scenario) => scenario[field])).size !== report.length
    )
      throw new Error(`trust_scenario_${field}_conflict`);
  }
  for (const scenario of report) {
    if (
      scenario.releaseVersion !== TRUST_SCENARIO_RELEASE_VERSION ||
      scenario.configuration.releaseVersion !==
        TRUST_SCENARIO_RELEASE_VERSION ||
      scenario.configuration.eventLimit > 1_024 ||
      scenario.configuration.faultLimit > 32 ||
      scenario.configuration.traceEventLimit > 2_048 ||
      scenario.faultPlan.faults.length === 0 ||
      scenario.faultPlan.faults.length > scenario.configuration.faultLimit ||
      ![
        scenario.configurationDigest,
        scenario.faultPlanDigest,
        scenario.traceDigest,
      ].every((digest) => digestPattern.test(digest)) ||
      (scenario.firstReplayDivergence !== null &&
        (!Number.isSafeInteger(scenario.firstReplayDivergence) ||
          scenario.firstReplayDivergence < 0 ||
          scenario.firstReplayDivergence >=
            scenario.configuration.traceEventLimit)) ||
      (divergenceScenarioIds.has(scenario.scenarioId) &&
        scenario.firstReplayDivergence === null)
    )
      throw new Error(`trust_scenario_record_invalid:${scenario.scenarioId}`);
    const source = await readFile(
      path.join(root, scenario.evidence.testFile),
      "utf8",
    );
    if (!source.includes(scenario.evidence.testTitle))
      throw new Error(`trust_scenario_evidence_missing:${scenario.scenarioId}`);
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await verifyTrustScenarioReport();
  process.stdout.write(
    process.argv.includes("--check")
      ? `verified ${report.length} Trust scenarios\n`
      : `${JSON.stringify(report, null, 2)}\n`,
  );
}
