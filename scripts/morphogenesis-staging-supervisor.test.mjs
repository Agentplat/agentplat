import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  acceptStagingOperationReceiptV1,
  completionSatisfied,
  createInitialStagingSupervisorStateV1,
  createStagingSupervisorConfigV1,
} from "./lib/morphogenesis-staging-supervisor.mjs";

const profile = JSON.parse(await readFile(
  new URL("../config/agent-morphogenesis-beta1-staging-qualification-v1.json", import.meta.url),
));
const readinessProfile = JSON.parse(await readFile(
  new URL("../config/agent-morphogenesis-beta1-operational-readiness-v1.json", import.meta.url),
));
const sha = (character) => `sha256:${character.repeat(64)}`;
const config = createStagingSupervisorConfigV1({
  profile,
  sourceCommit: "a".repeat(40),
  inventoryDigest: sha("b"),
  deploymentReceiptDigest: sha("c"),
  campaignKeyId: "kms-campaign-key",
  campaignPublicKeyFingerprint: sha("d"),
  operationalScenarioIds: readinessProfile.operationalScenarioIds,
});

function receipt(sequence, operationType, detail) {
  return {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1",
    configDigest: config.configDigest,
    sourceCommit: config.sourceCommit,
    sequence,
    operationId: `operation:${sequence}`,
    operationType,
    status: "passed",
    detail,
    invariants: {
      duplicateMaterialEffects: 0,
      unauthorizedActivations: 0,
      lostCommittedReceipts: 0,
      morphologyHeadForks: 0,
      crossTenantEffects: 0,
      crossMissionEffects: 0,
      missionContinuityRatio: 1,
    },
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
}

test("staging supervisor completes only after every frozen gate", () => {
  let state = createInitialStagingSupervisorStateV1(config);
  let sequence = 1;
  const accept = (type, detail) => {
    state = acceptStagingOperationReceiptV1(config, state, receipt(sequence, type, detail));
    sequence += 1;
  };
  for (const phase of ["baseline", "post-upgrade"])
    for (const scenarioId of config.operationalScenarioIds)
      accept("canonical-scenario", { phase, scenarioId });
  for (const [faultClass, count] of [
    ["network-partition", config.executionGeometry.minimumNetworkPartitionCycles],
    ["host-loss", config.executionGeometry.minimumHostLossCycles],
    ["postgres-failover", config.executionGeometry.minimumPostgresFailoverCycles],
    ["temporal-worker-loss", config.executionGeometry.minimumTemporalWorkerLossCycles],
  ]) for (let index = 0; index < count; index += 1) accept("fault-cycle", { faultClass });
  for (const [type, count] of [
    ["rolling-deployment", config.executionGeometry.minimumRollingDeploymentCycles],
    ["schema-upgrade", config.executionGeometry.minimumSchemaUpgradeCycles],
    ["backup-restore", config.executionGeometry.minimumBackupRestoreCycles],
    ["key-rotation", config.executionGeometry.minimumKeyRotationCycles],
  ]) for (let index = 0; index < count; index += 1) accept(type, { cycle: index + 1 });
  accept("tenant-mission-isolation", {
    tenantCount: 3,
    missionsPerTenant: 2,
    crossScopeReceiptsAccepted: 0,
  });
  accept("alert-delivery", { externalReceiptDigest: sha("e") });
  assert.equal(completionSatisfied(config, state), false);
  accept("soak-summary", {
    durationMs: config.executionGeometry.minimumSoakDurationMs,
    completedMorphogenesisRuns: config.executionGeometry.minimumCompletedMorphogenesisRuns,
    minimumRunsPerTenant: config.executionGeometry.minimumRunsPerTenant,
    tenantCount: config.executionGeometry.minimumTenants,
    maximumConcurrentMissions: config.executionGeometry.minimumConcurrentMissions,
    cumulativeMeshProcessStarts: config.requiredInfrastructure.minimumCumulativeAgentMeshProcessStarts,
    resourceSampleCount: 1,
  });
  assert.equal(state.status, "completed");
  assert.equal(state.stagingQualification, "beta1-distributed-staging-profile-established");
  assert.equal(state.productionReadiness, "not-established");
  assert.equal(state.productionClaimPermitted, false);
});

test("staging supervisor rejects sequence gaps and nonzero safety invariants", () => {
  const state = createInitialStagingSupervisorStateV1(config);
  assert.throws(
    () => acceptStagingOperationReceiptV1(
      config,
      state,
      receipt(2, "alert-delivery", { externalReceiptDigest: sha("f") }),
    ),
  );
  const unsafe = receipt(1, "alert-delivery", { externalReceiptDigest: sha("f") });
  unsafe.invariants.duplicateMaterialEffects = 1;
  assert.throws(() => acceptStagingOperationReceiptV1(config, state, unsafe));
});
