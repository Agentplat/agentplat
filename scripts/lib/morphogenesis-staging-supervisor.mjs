import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const faultRequirements = Object.freeze({
  "network-partition": "minimumNetworkPartitionCycles",
  "host-loss": "minimumHostLossCycles",
  "postgres-failover": "minimumPostgresFailoverCycles",
  "temporal-worker-loss": "minimumTemporalWorkerLossCycles",
});

export function createStagingSupervisorConfigV1({
  profile,
  sourceCommit,
  inventoryDigest,
  deploymentReceiptDigest,
  campaignKeyId,
  campaignPublicKeyFingerprint,
  operationalScenarioIds,
}) {
  assert.equal(profile.status, "frozen-before-staging-execution");
  assert.match(sourceCommit, /^[0-9a-f]{40}$/u);
  sha(inventoryDigest);
  sha(deploymentReceiptDigest);
  text(campaignKeyId);
  sha(campaignPublicKeyFingerprint);
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-supervisor-config-v1",
    profileId: profile.profileId,
    profileDigest: digest("agentplat-agent-morphogenesis-beta1-staging-profile-v1", profile),
    sourceCommit,
    inventoryDigest,
    deploymentReceiptDigest,
    campaignKeyId,
    campaignPublicKeyFingerprint,
    operationalScenarioIds: [...operationalScenarioIds],
    partitionAuthorityScenarioIds: [...profile.partitionAuthorityScenarioIds],
    requiredScenarioCount: profile.requiredScenarioCoverage.exactCanonicalScenarioCount,
    requiredInfrastructure: profile.requiredInfrastructure,
    executionGeometry: profile.executionGeometry,
    isolationRequirements: profile.isolationRequirements,
    serviceLevelObjectives: profile.serviceLevelObjectives,
    claimBoundary: profile.claimBoundary,
  };
  assert.equal(body.operationalScenarioIds.length, body.requiredScenarioCount);
  assert.equal(new Set(body.operationalScenarioIds).size, body.requiredScenarioCount);
  assert.equal(
    new Set(body.partitionAuthorityScenarioIds).size,
    body.partitionAuthorityScenarioIds.length,
  );
  for (const scenarioId of body.partitionAuthorityScenarioIds)
    assert.ok(body.operationalScenarioIds.includes(scenarioId));
  return Object.freeze({
    ...body,
    configDigest: digest("agentplat-agent-morphogenesis-beta1-staging-supervisor-config-v1", body),
  });
}

export function createInitialStagingSupervisorStateV1(config) {
  return Object.freeze({
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-supervisor-state-v1",
    configDigest: config.configDigest,
    sourceCommit: config.sourceCommit,
    status: "planned",
    revision: 0,
    nextReceiptSequence: 1,
    nextEventSequence: 1,
    acceptedOperationIds: [],
    acceptedReceiptDigests: [],
    baselineScenarioIds: [],
    postUpgradeScenarioIds: [],
    partitionAuthorityScenarioIds: [],
    faultCycles: {
      "network-partition": 0,
      "host-loss": 0,
      "postgres-failover": 0,
      "temporal-worker-loss": 0,
    },
    rollingDeploymentCycles: 0,
    schemaUpgradeCycles: 0,
    backupRestoreCycles: 0,
    keyRotationCycles: 0,
    isolationPassed: false,
    alertDeliveryPassed: false,
    soak: null,
    duplicateMaterialEffects: 0,
    unauthorizedActivations: 0,
    lostCommittedReceipts: 0,
    morphologyHeadForks: 0,
    crossTenantEffects: 0,
    crossMissionEffects: 0,
    missionContinuityRatio: 1,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
    lastEventDigest: null,
  });
}

export function acceptStagingOperationReceiptV1(config, current, input) {
  assert.equal(current.configDigest, config.configDigest);
  const receipt = validateReceipt(config, input);
  assert.equal(receipt.sequence, current.nextReceiptSequence);
  assert.equal(current.acceptedOperationIds.includes(receipt.operationId), false);
  const next = structuredClone(current);
  next.status = "running";
  next.revision += 1;
  next.nextReceiptSequence += 1;
  next.acceptedOperationIds.push(receipt.operationId);
  next.duplicateMaterialEffects += receipt.invariants.duplicateMaterialEffects;
  next.unauthorizedActivations += receipt.invariants.unauthorizedActivations;
  next.lostCommittedReceipts += receipt.invariants.lostCommittedReceipts;
  next.morphologyHeadForks += receipt.invariants.morphologyHeadForks;
  next.crossTenantEffects += receipt.invariants.crossTenantEffects;
  next.crossMissionEffects += receipt.invariants.crossMissionEffects;
  next.missionContinuityRatio = Math.min(
    next.missionContinuityRatio,
    receipt.invariants.missionContinuityRatio,
  );
  switch (receipt.operationType) {
    case "canonical-scenario": {
      assert.ok(config.operationalScenarioIds.includes(receipt.detail.scenarioId));
      const target = receipt.detail.phase === "baseline"
        ? next.baselineScenarioIds
        : receipt.detail.phase === "post-upgrade"
          ? next.postUpgradeScenarioIds
          : receipt.detail.phase === "partition"
            ? next.partitionAuthorityScenarioIds
            : null;
      assert.ok(target);
      if (receipt.detail.phase === "partition")
        assert.ok(config.partitionAuthorityScenarioIds.includes(receipt.detail.scenarioId));
      assert.equal(target.includes(receipt.detail.scenarioId), false);
      target.push(receipt.detail.scenarioId);
      target.sort();
      break;
    }
    case "fault-cycle":
      assert.ok(receipt.detail.faultClass in faultRequirements);
      next.faultCycles[receipt.detail.faultClass] += 1;
      break;
    case "rolling-deployment":
      validateMaintenanceDetail(config, receipt.operationType, receipt.detail);
      next.rollingDeploymentCycles += 1;
      break;
    case "schema-upgrade":
      validateMaintenanceDetail(config, receipt.operationType, receipt.detail);
      next.schemaUpgradeCycles += 1;
      break;
    case "backup-restore":
      validateMaintenanceDetail(config, receipt.operationType, receipt.detail);
      next.backupRestoreCycles += 1;
      break;
    case "key-rotation":
      validateMaintenanceDetail(config, receipt.operationType, receipt.detail);
      next.keyRotationCycles += 1;
      break;
    case "tenant-mission-isolation":
      assert.equal(receipt.detail.tenantCount >= config.executionGeometry.minimumTenants, true);
      assert.equal(receipt.detail.missionsPerTenant >= 2, true);
      assert.ok(receipt.detail.completedExecutions >= 6);
      assert.ok(receipt.detail.attemptedCrossTenantReads >= 24);
      assert.ok(receipt.detail.attemptedCrossMissionReads >= 6);
      assert.ok(receipt.detail.failureDomainCount >= 3);
      assert.equal(receipt.detail.crossTenantReadsAccepted, 0);
      assert.equal(receipt.detail.crossTenantWritesAccepted, 0);
      assert.equal(receipt.detail.crossMissionAuthorityUsesAccepted, 0);
      assert.equal(receipt.detail.crossScopeReceiptsAccepted, 0);
      sha(receipt.detail.durableStateRoot);
      sha(receipt.detail.externalIsolationReceiptDigest);
      next.isolationPassed = true;
      break;
    case "alert-delivery":
      assert.match(receipt.detail.externalReceiptDigest, /^sha256:[0-9a-f]{64}$/u);
      next.alertDeliveryPassed = true;
      break;
    case "soak-summary":
      assert.equal(next.soak, null);
      next.soak = validateSoak(config, receipt.detail);
      break;
    default: throw new TypeError("staging operation receipt type is invalid");
  }
  if (completionSatisfied(config, next)) {
    next.status = "completed";
    next.stagingQualification = "beta1-distributed-staging-profile-established";
  }
  assert.equal(next.productionReadiness, "not-established");
  assert.equal(next.productionClaimPermitted, false);
  return Object.freeze(next);
}

export function completionSatisfied(config, state) {
  const exact = (values) =>
    values.length === config.requiredScenarioCount &&
    values.every((value, index) => value === [...config.operationalScenarioIds].sort()[index]);
  return exact(state.baselineScenarioIds) &&
    exact(state.postUpgradeScenarioIds) &&
    state.partitionAuthorityScenarioIds.length === config.partitionAuthorityScenarioIds.length &&
    state.partitionAuthorityScenarioIds.every(
      (value, index) => value === [...config.partitionAuthorityScenarioIds].sort()[index],
    ) &&
    Object.entries(faultRequirements).every(([faultClass, geometryKey]) =>
      state.faultCycles[faultClass] >= config.executionGeometry[geometryKey]) &&
    state.rollingDeploymentCycles >= config.executionGeometry.minimumRollingDeploymentCycles &&
    state.schemaUpgradeCycles >= config.executionGeometry.minimumSchemaUpgradeCycles &&
    state.backupRestoreCycles >= config.executionGeometry.minimumBackupRestoreCycles &&
    state.keyRotationCycles >= config.executionGeometry.minimumKeyRotationCycles &&
    state.isolationPassed &&
    state.alertDeliveryPassed &&
    state.soak !== null &&
    state.duplicateMaterialEffects === 0 &&
    state.unauthorizedActivations === 0 &&
    state.lostCommittedReceipts === 0 &&
    state.morphologyHeadForks === 0 &&
    state.crossTenantEffects === 0 &&
    state.crossMissionEffects === 0 &&
    state.missionContinuityRatio >= config.serviceLevelObjectives.minimumMissionContinuityRatio;
}

function validateReceipt(config, input) {
  assert.equal(input.schemaVersion, 1);
  assert.equal(input.kind, "agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1");
  assert.equal(input.configDigest, config.configDigest);
  assert.equal(input.sourceCommit, config.sourceCommit);
  assert.equal(input.status, "passed");
  assert.equal(input.productionReadiness, "not-established");
  assert.equal(input.productionClaimPermitted, false);
  assert.ok(Number.isSafeInteger(input.sequence) && input.sequence >= 1);
  text(input.operationId);
  assert.equal(typeof input.detail, "object");
  const invariants = input.invariants;
  for (const key of [
    "duplicateMaterialEffects", "unauthorizedActivations", "lostCommittedReceipts",
    "morphologyHeadForks", "crossTenantEffects", "crossMissionEffects",
  ]) assert.equal(invariants[key], 0);
  assert.equal(invariants.missionContinuityRatio, 1);
  return input;
}

function validateSoak(config, input) {
  assert.ok(input.durationMs >= config.executionGeometry.minimumSoakDurationMs);
  assert.ok(input.completedMorphogenesisRuns >= config.executionGeometry.minimumCompletedMorphogenesisRuns);
  assert.ok(input.minimumRunsPerTenant >= config.executionGeometry.minimumRunsPerTenant);
  assert.ok(input.tenantCount >= config.executionGeometry.minimumTenants);
  assert.ok(input.maximumConcurrentMissions >= config.executionGeometry.minimumConcurrentMissions);
  assert.ok(input.cumulativeMeshProcessStarts >= config.requiredInfrastructure.minimumCumulativeAgentMeshProcessStarts);
  assert.equal(input.resourceSampleCount > 0, true);
  assert.ok(input.nominalP95WallTimeMs <= config.serviceLevelObjectives.maximumNominalP95WallTimeMs);
  assert.ok(input.recoveryP95WallTimeMs <= config.serviceLevelObjectives.maximumRecoveryP95WallTimeMs);
  assert.ok(input.rollbackP95WallTimeMs <= config.serviceLevelObjectives.maximumRollbackP95WallTimeMs);
  assert.ok(input.restorePointLossMs <= config.serviceLevelObjectives.maximumRestorePointLossMs);
  assert.ok(input.restoreTimeMs <= config.serviceLevelObjectives.maximumRestoreTimeMs);
  assert.ok(input.peakWorkerRssBytes <= config.serviceLevelObjectives.maximumPeakWorkerRssBytes);
  assert.ok(input.aggregateWorkerCpuPercent <= config.serviceLevelObjectives.maximumAggregateWorkerCpuPercent);
  assert.equal(input.finalPendingMeshInboxRows, 0);
  assert.equal(input.finalPendingMeshOutboxRows, 0);
  assert.ok(input.externalSpendUsd <= config.requiredInfrastructure.maximumExternalSpendUsd);
  sha(input.resourceSampleRoot);
  sha(input.operationReceiptRoot);
  return Object.freeze({ ...input });
}

function validateMaintenanceDetail(config, operationType, input) {
  assert.ok(Number.isSafeInteger(input.cycle) && input.cycle >= 1);
  sha(input.externalMaintenanceReceiptDigest);
  if (operationType === "rolling-deployment") {
    assert.match(input.predecessorImage, /@sha256:[0-9a-f]{64}$/u);
    assert.match(input.successorImage, /@sha256:[0-9a-f]{64}$/u);
    assert.notEqual(input.predecessorImage, input.successorImage);
    assert.ok(input.failureDomainCount >= 3);
    assert.equal(input.allPeersReady, true);
    assert.equal(input.versionSkewObserved, true);
  } else if (operationType === "schema-upgrade") {
    assert.ok(Number.isSafeInteger(input.previousMigration) && input.previousMigration >= 0);
    assert.ok(Number.isSafeInteger(input.successorMigration) && input.successorMigration > input.previousMigration);
    assert.equal(input.backwardRestoreTested, true);
    sha(input.migrationReceiptDigest);
  } else if (operationType === "backup-restore") {
    sha(input.backupDigest);
    sha(input.sourceCanonicalRoot);
    assert.equal(input.restoredCanonicalRoot, input.sourceCanonicalRoot);
    text(input.cleanRestoreResourceId);
    assert.ok(input.restorePointLossMs <= config.serviceLevelObjectives.maximumRestorePointLossMs);
    assert.ok(input.restoreTimeMs <= config.serviceLevelObjectives.maximumRestoreTimeMs);
  } else {
    text(input.predecessorKeyId);
    text(input.successorKeyId);
    assert.notEqual(input.predecessorKeyId, input.successorKeyId);
    assert.equal(input.activeSignerKeyId, input.successorKeyId);
    assert.equal(input.predecessorSigningDenied, true);
    assert.equal(input.predecessorHistoricalVerificationPassed, true);
    sha(input.rotationReceiptDigest);
  }
}

function sha(value) {
  assert.match(value, /^sha256:[0-9a-f]{64}$/u);
}

function text(value) {
  assert.match(value, /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u);
}

export function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\n${JSON.stringify(value)}`).digest("hex")}`;
}
