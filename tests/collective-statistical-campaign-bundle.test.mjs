import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignManifestV1,
  createCollectiveEvaluationCampaignRegistrationV1,
} from "@agentplat/collective-planning/evaluation";
import {
  COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1,
  COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1,
  digestCollectiveStatisticalCampaignArtifactV1,
  digestCollectiveStatisticalCampaignBundleV1,
  digestCollectiveStatisticalCampaignComparisonInputV1,
  digestCollectiveStatisticalCampaignComparisonV1,
  digestCollectiveStatisticalCampaignEvidenceV1,
  digestCollectiveStatisticalCampaignLedgerV1,
  digestCollectiveStatisticalCampaignSampleV1,
  digestCollectiveStatisticalCampaignSummaryV1,
  digestCollectiveStatisticalCampaignTraceV1,
  verifyCollectiveStatisticalCampaignBundleV1,
} from "@agentplat/mesh-sim";

const digest = (label) =>
  `sha256:${createHash("sha256").update(label).digest("hex")}`;
const encode = (value) => JSON.stringify(value);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function artifact(id, kind, value) {
  const bytes = encode(value);
  return {
    id,
    bytes,
    index: {
      schemaVersion: 1,
      artifactId: id,
      kind,
      path: `${kind}s/${id}.json`,
      byteLength: Buffer.byteLength(bytes),
      sha256: sha256(bytes),
      canonicalDigest: digestCollectiveStatisticalCampaignArtifactV1(
        kind,
        value,
      ),
    },
  };
}

function expected(
  artifactValue,
  cellId = null,
  seed = null,
  runner = null,
  attempt = null,
) {
  return {
    schemaVersion: 1,
    artifactId: artifactValue.id,
    kind: artifactValue.index.kind,
    cellId,
    seed,
    runner,
    attempt,
  };
}

function makeRegistration({
  campaignId,
  sourceDigest,
  packageDigest,
  fixtureDigest,
  policyDigest,
  environmentDigest,
  observationPolicyDigest,
  monitorDigest,
  hiddenCanaryDigest,
}) {
  return createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile: COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
    sourceDigest,
    packageDigest,
    fixtureManifestDigest: fixtureDigest,
    policyDigest,
    environmentDigest,
    observationPolicyDigest,
    monitorDigest,
    hiddenCanaryDigest,
    runners: ["adaptive_collective", "centralized_planner"],
    maximumInteractions: 1_000,
    cells: collectiveEvaluationCampaignProfileCellsV1(
      COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
      campaignId,
    ).map((cell) => ({
      schemaVersion: 1,
      ...cell,
      maximumInteractions: 1_000,
      scaleConfigurationDigest: digest(`scale-configuration:${cell.cellId}`),
      adaptiveDefinitionDigest: digest(`adaptive-definition:${cell.cellId}`),
      centralizedDefinitionDigest: digest(
        `centralized-definition:${cell.cellId}`,
      ),
      faultPlanDigest: digest(`fault-plan:${cell.cellId}`),
      faultMatrixBindingDigest: digest(`fault-matrix:${cell.cellId}`),
    })),
  });
}

function makeManifest(registration, firstAttempts, comparisonsByCell) {
  return createCollectiveEvaluationCampaignManifestV1(registration, {
    schemaVersion: 1,
    registrationDigest: registration.registrationDigest,
    entries: registration.cells.map((cell) => {
      const first = firstAttempts.get(cell.cellId);
      return {
        schemaVersion: 1,
        cellId: cell.cellId,
        status: "success",
        reasonCode: null,
        adaptiveResultDigest: first.adaptive.sample.sampleDigest,
        centralizedResultDigest: first.centralized.sample.sampleDigest,
        adaptiveTraceDigest: first.adaptive.trace.traceDigest,
        centralizedTraceDigest: first.centralized.trace.traceDigest,
        adaptiveLedgerDigest: first.adaptive.ledger.ledgerDigest,
        centralizedLedgerDigest: first.centralized.ledger.ledgerDigest,
        fairnessDigest: comparisonsByCell.get(cell.cellId).comparisonDigest,
        adaptiveCampaignEvidenceDigest: first.adaptive.evidence.evidenceDigest,
        centralizedCampaignEvidenceDigest:
          first.centralized.evidence.evidenceDigest,
      };
    }),
  });
}

function makeBundle() {
  const artifacts = [];
  const add = (id, kind, value) => {
    const result = artifact(id, kind, value);
    artifacts.push(result);
    return result;
  };
  const sourceCommit = "a".repeat(40);
  const sourceTreeDigest = digest("source-tree");
  const source = add("source", "source-lock", {
    schemaVersion: 1,
    sourceCommit,
    sourceTreeDigest,
    dirtyWorktree: false,
  });
  const packageLock = add("package-lock", "package-lock", {
    schemaVersion: 1,
    value: "package-lock",
  });
  const fixture = add("fixture", "fixture", {
    schemaVersion: 1,
    value: "fixture",
  });
  const policy = add("policy", "policy", { schemaVersion: 1, value: "policy" });
  const environment = add("environment", "environment", {
    schemaVersion: 1,
    value: "environment",
  });
  const monitor = add("monitor", "monitor", {
    schemaVersion: 1,
    value: "monitor",
  });
  const observationPolicy = add("observation-policy", "observation-policy", {
    schemaVersion: 1,
    value: "observation-policy",
  });
  const hiddenCanary = add("hidden-canary", "hidden-canary", {
    schemaVersion: 1,
    value: "hidden-canary-commitment",
  });
  const campaignId = "campaign:bundle-preflight";
  const registration = makeRegistration({
    campaignId,
    sourceDigest: source.index.canonicalDigest,
    packageDigest: packageLock.index.canonicalDigest,
    fixtureDigest: fixture.index.canonicalDigest,
    policyDigest: policy.index.canonicalDigest,
    environmentDigest: environment.index.canonicalDigest,
    observationPolicyDigest: observationPolicy.index.canonicalDigest,
    monitorDigest: monitor.index.canonicalDigest,
    hiddenCanaryDigest: hiddenCanary.index.canonicalDigest,
  });
  const registrationArtifact = add(
    "registration",
    "registration",
    registration,
  );
  const expectedArtifacts = [
    expected(source),
    expected(packageLock),
    expected(fixture),
    expected(policy),
    expected(environment),
    expected(monitor),
    expected(observationPolicy),
    expected(hiddenCanary),
    expected(registrationArtifact),
  ];
  const cells = [];
  const comparisonArtifacts = [];
  const comparisonsByCell = new Map();
  const firstAttempts = new Map();
  for (const registeredCell of registration.cells) {
    const samples = [];
    for (const runner of ["adaptive_collective", "centralized_planner"]) {
      for (const attempt of ["first", "replay"]) {
        const sampleId = `sample:${registeredCell.cellId}:${runner}:${attempt}`;
        const traceId = `trace:${registeredCell.cellId}:${runner}:${attempt}`;
        const evidenceId = `evidence:${registeredCell.cellId}:${runner}:${attempt}`;
        const ledgerId = `ledger:${registeredCell.cellId}:${runner}:${attempt}`;
        const sampleBody = {
          schemaVersion: 1,
          cellId: registeredCell.cellId,
          seed: registeredCell.seed,
          runner,
          attempt,
          status: "passed",
          traceArtifactId: traceId,
          evidenceArtifactId: evidenceId,
          ledgerArtifactId: ledgerId,
          outcome: { committed: true, cellId: registeredCell.cellId },
        };
        const sample = {
          ...sampleBody,
          sampleDigest: digestCollectiveStatisticalCampaignSampleV1(sampleBody),
        };
        const sampleArtifact = add(sampleId, "sample", sample);
        const traceBody = {
          schemaVersion: 1,
          sampleArtifactId: sampleId,
          records: [{ sequence: 1 }],
        };
        const trace = {
          ...traceBody,
          traceDigest: digestCollectiveStatisticalCampaignTraceV1(traceBody),
        };
        const traceArtifact = add(traceId, "trace", trace);
        const evidenceBody = {
          schemaVersion: 1,
          sampleArtifactId: sampleId,
          sampleDigest: sample.sampleDigest,
          observations: [{ observation: "ok" }],
        };
        const evidence = {
          ...evidenceBody,
          evidenceDigest:
            digestCollectiveStatisticalCampaignEvidenceV1(evidenceBody),
        };
        const evidenceArtifact = add(evidenceId, "evidence", evidence);
        const ledgerBody = {
          schemaVersion: 1,
          sampleArtifactId: sampleId,
          records: [{ interactions: 1 }],
        };
        const ledger = {
          ...ledgerBody,
          ledgerDigest: digestCollectiveStatisticalCampaignLedgerV1(ledgerBody),
        };
        const ledgerArtifact = add(ledgerId, "ledger", ledger);
        const execution = {
          sample,
          sampleArtifact,
          trace,
          traceArtifact,
          evidence,
          evidenceArtifact,
          ledger,
          ledgerArtifact,
          runner,
          attempt,
        };
        samples.push(execution);
        if (attempt === "first") {
          const first = firstAttempts.get(registeredCell.cellId) ?? {};
          first[runner === "adaptive_collective" ? "adaptive" : "centralized"] =
            execution;
          firstAttempts.set(registeredCell.cellId, first);
        }
        expectedArtifacts.push(
          expected(
            sampleArtifact,
            registeredCell.cellId,
            registeredCell.seed,
            runner,
            attempt,
          ),
          expected(
            traceArtifact,
            registeredCell.cellId,
            registeredCell.seed,
            runner,
            attempt,
          ),
          expected(
            evidenceArtifact,
            registeredCell.cellId,
            registeredCell.seed,
            runner,
            attempt,
          ),
          expected(
            ledgerArtifact,
            registeredCell.cellId,
            registeredCell.seed,
            runner,
            attempt,
          ),
        );
      }
    }
    const adaptive = samples.filter(
      (sample) =>
        sample.runner === "adaptive_collective" && sample.attempt === "first",
    );
    const centralized = samples.filter(
      (sample) =>
        sample.runner === "centralized_planner" && sample.attempt === "first",
    );
    const bootstrap = { schemaVersion: 1, seed: 202, resamples: 10_000 };
    const comparisonBody = {
      schemaVersion: 1,
      cellId: registeredCell.cellId,
      adaptiveSampleArtifactIds: adaptive.map(
        (sample) => sample.sampleArtifact.id,
      ),
      centralizedSampleArtifactIds: centralized.map(
        (sample) => sample.sampleArtifact.id,
      ),
      bootstrap,
      statistics: { delta: 0 },
      inputDigest: digestCollectiveStatisticalCampaignComparisonInputV1({
        cellId: registeredCell.cellId,
        adaptiveSampleDigests: adaptive.map(
          (sample) => JSON.parse(sample.sampleArtifact.bytes).sampleDigest,
        ),
        centralizedSampleDigests: centralized.map(
          (sample) => JSON.parse(sample.sampleArtifact.bytes).sampleDigest,
        ),
        bootstrap,
      }),
    };
    const comparison = add(
      `comparison:${registeredCell.cellId}`,
      "comparison",
      {
        ...comparisonBody,
        comparisonDigest:
          digestCollectiveStatisticalCampaignComparisonV1(comparisonBody),
      },
    );
    comparisonArtifacts.push(comparison);
    comparisonsByCell.set(registeredCell.cellId, JSON.parse(comparison.bytes));
    expectedArtifacts.push(expected(comparison, registeredCell.cellId));
    cells.push({
      schemaVersion: 1,
      cellId: registeredCell.cellId,
      comparisonArtifactId: comparison.id,
    });
  }
  const manifest = makeManifest(registration, firstAttempts, comparisonsByCell);
  const manifestArtifact = add("manifest", "manifest", manifest);
  expectedArtifacts.push(expected(manifestArtifact));
  const summaryBody = {
    schemaVersion: 1,
    comparisonArtifactIds: comparisonArtifacts.map(
      (comparison) => comparison.id,
    ),
    status: "passed",
    statistics: { total: cells.length },
  };
  const summary = add("summary", "summary", {
    ...summaryBody,
    summaryDigest: digestCollectiveStatisticalCampaignSummaryV1(summaryBody),
  });
  expectedArtifacts.push(expected(summary));
  const body = {
    schemaVersion: 1,
    campaignId,
    sourceLockArtifactId: source.id,
    registrationArtifactId: registrationArtifact.id,
    manifestArtifactId: manifestArtifact.id,
    cells,
    expectedArtifacts,
    artifacts: artifacts.map((item) => item.index),
    summaryArtifactId: summary.id,
  };
  return {
    bundle: {
      ...body,
      bundleDigest: digestCollectiveStatisticalCampaignBundleV1(body),
    },
    bytes: Object.fromEntries(artifacts.map((item) => [item.id, item.bytes])),
    hooks: {
      validateArtifact: (kind, value) => {
        if (kind === "trace" && value.records.length !== 1) {
          throw new TypeError("trace was truncated");
        }
      },
      recomputeComparisonStatistics: (comparison) =>
        comparison.bootstrap.resamples === 10_000 ? { delta: 0 } : { delta: 1 },
      recomputeSummaryStatistics: () => ({ total: cells.length }),
      expectedSourceLock: { sourceCommit, sourceTreeDigest },
    },
  };
}

function reindex(fixture, artifactId) {
  const value = JSON.parse(fixture.bytes[artifactId]);
  const entry = fixture.bundle.artifacts.find(
    (item) => item.artifactId === artifactId,
  );
  entry.byteLength = Buffer.byteLength(fixture.bytes[artifactId]);
  entry.sha256 = sha256(fixture.bytes[artifactId]);
  entry.canonicalDigest = digestCollectiveStatisticalCampaignArtifactV1(
    entry.kind,
    value,
  );
}

function reseal(fixture) {
  const { bundleDigest, ...body } = fixture.bundle;
  fixture.bundle.bundleDigest =
    digestCollectiveStatisticalCampaignBundleV1(body);
}

async function rejects(mutator, expression) {
  const fixture = makeBundle();
  await assert.rejects(
    async () =>
      verifyCollectiveStatisticalCampaignBundleV1(...mutator(fixture)),
    expression,
  );
}

test("verifies the public registered preflight schedule and its terminal manifest", async () => {
  const fixture = makeBundle();
  const result = await verifyCollectiveStatisticalCampaignBundleV1(
    fixture.bundle,
    fixture.bytes,
    fixture.hooks,
  );
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.campaignId, "campaign:bundle-preflight");
  assert.equal(result.artifactCount, fixture.bundle.artifacts.length);
  assert.equal(result.sampleCount, 32);
  assert.equal(result.comparisonCount, 8);
  assert.equal(result.status, "passed");
  assert.match(result.registrationDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.manifestDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("requires exactly one canonical public registration and manifest", async () => {
  await rejects((fixture) => {
    fixture.bundle.registrationArtifactId = "registration:missing";
    reseal(fixture);
    return [fixture.bundle, fixture.bytes, fixture.hooks];
  }, /registration.*(?:missing|bind|expectation)|closure/u);
  await rejects((fixture) => {
    const manifest = JSON.parse(fixture.bytes.manifest);
    manifest.registrationDigest = digest("other-registration");
    fixture.bytes.manifest = encode(manifest);
    reindex(fixture, "manifest");
    reseal(fixture);
    return [fixture.bundle, fixture.bytes, fixture.hooks];
  }, /manifest.*registration|registration.*bind|does not bind/u);
  await rejects((fixture) => {
    const registration = JSON.parse(fixture.bytes.registration);
    registration.maximumInteractions = 5_001;
    fixture.bytes.registration = encode(registration);
    reindex(fixture, "registration");
    reseal(fixture);
    return [fixture.bundle, fixture.bytes, fixture.hooks];
  }, /registration|maximumInteractions|bounded safe integer/u);
});

test("rejects extra or unreferenced registration artifacts", async () => {
  await rejects((fixture) => {
    const extra = artifact(
      "registration:extra",
      "registration",
      JSON.parse(fixture.bytes.registration),
    );
    fixture.bundle.expectedArtifacts.push(expected(extra, "orphan-cell"));
    fixture.bundle.artifacts.push(extra.index);
    fixture.bytes[extra.id] = extra.bytes;
    reseal(fixture);
    return [fixture.bundle, fixture.bytes, fixture.hooks];
  }, /registration.*(?:closure|unreferenced)|expected artifact|global artifact/u);
});

test("rejects byte declarations above per-artifact and total bundle limits before parsing", async () => {
  await rejects((fixture) => {
    fixture.bundle.artifacts[0].byteLength =
      COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1 + 1;
    reseal(fixture);
    return [fixture.bundle, fixture.bytes, fixture.hooks];
  }, /artifact.*(?:byte|limit)|byteLength.*(?:limit|maximum|exceeds)/iu);
  await rejects((fixture) => {
    const each =
      Math.floor(
        COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1 /
          fixture.bundle.artifacts.length,
      ) + 1;
    for (const entry of fixture.bundle.artifacts) entry.byteLength = each;
    reseal(fixture);
    return [fixture.bundle, fixture.bytes, fixture.hooks];
  }, /(?:total|bundle).*(?:byte|limit)|byte.*(?:total|bundle)/iu);
});

test("rejects excessive snapshot depth and record cardinality before contract reads", async () => {
  const fixture = makeBundle();
  let deeplyNested = { leaf: true };
  for (let depth = 0; depth <= 64; depth += 1) {
    deeplyNested = { nested: deeplyNested };
  }
  await assert.rejects(
    () =>
      verifyCollectiveStatisticalCampaignBundleV1(
        deeplyNested,
        fixture.bytes,
        fixture.hooks,
      ),
    /depth|maximum|limit|collective_statistical_campaign_bundle_invalid/u,
  );

  const tooManyFields = Object.create(null);
  for (let index = 0; index <= 16_384; index += 1) {
    tooManyFields[`field-${index}`] = index;
  }
  await assert.rejects(
    () =>
      verifyCollectiveStatisticalCampaignBundleV1(
        tooManyFields,
        fixture.bytes,
        fixture.hooks,
      ),
    /key|field|maximum|limit|collective_statistical_campaign_bundle_invalid/u,
  );
});

test("rejects an oversized byte map without reading accessor values or encoding bytes", async () => {
  const fixture = makeBundle();
  const tooManyBytes = Object.create(null);
  for (let index = 0; index <= 16_384; index += 1) {
    tooManyBytes[`artifact-${index}`] = "";
  }
  let accessorRead = false;
  Object.defineProperty(tooManyBytes, "poison", {
    enumerable: true,
    get() {
      accessorRead = true;
      throw new Error("byte map value must not be read");
    },
  });
  await assert.rejects(
    () =>
      verifyCollectiveStatisticalCampaignBundleV1(
        fixture.bundle,
        tooManyBytes,
        fixture.hooks,
      ),
    /artifact bytes|key|field|maximum|limit|collective_statistical_campaign_bundle_invalid/u,
  );
  assert.equal(accessorRead, false);
});

test("rejects accessors and snapshots a TOCTOU proxy before mutable reads", async () => {
  const fixture = makeBundle();
  const accessorBundle = { ...fixture.bundle };
  Object.defineProperty(accessorBundle, "campaignId", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  await assert.rejects(
    () =>
      verifyCollectiveStatisticalCampaignBundleV1(
        accessorBundle,
        fixture.bytes,
        fixture.hooks,
      ),
    /plain data object|accessor/u,
  );

  let campaignIdReads = 0;
  const mutableBundle = new Proxy(fixture.bundle, {
    get(target, property, receiver) {
      if (property === "campaignId") {
        campaignIdReads += 1;
        return campaignIdReads > 2
          ? "campaign:mutated-after-validation"
          : Reflect.get(target, property, receiver);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const result = await verifyCollectiveStatisticalCampaignBundleV1(
    mutableBundle,
    fixture.bytes,
    fixture.hooks,
  );
  assert.equal(result.campaignId, fixture.bundle.campaignId);
  assert.equal(campaignIdReads, 0);
});

test("retains independent recomputation and rejects malformed provenance or execution scope", async () => {
  await rejects((fixture) => {
    const registration = JSON.parse(fixture.bytes.registration);
    registration.fixtureManifestDigest = digest("substituted-fixture");
    fixture.bytes.registration = encode(registration);
    reindex(fixture, "registration");
    reseal(fixture);
    return [fixture.bundle, fixture.bytes, fixture.hooks];
  }, /registration|provenance|does not bind/u);
  await rejects((fixture) => {
    const traceId = fixture.bundle.expectedArtifacts.find(
      (entry) => entry.kind === "trace",
    ).artifactId;
    fixture.bundle.expectedArtifacts.find(
      (entry) => entry.artifactId === traceId,
    ).runner = "centralized_planner";
    reseal(fixture);
    return [fixture.bundle, fixture.bytes, fixture.hooks];
  }, /expected artifact scopes are not unique|trace expectation is not bound/u);
});
