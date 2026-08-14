#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicKey, verify as verifyBytes } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

import {
  validateCollectiveEvaluationCampaignRegistrationV1,
  validateNormativeOperationAuthorizationV1,
  validateNormativeOperationPlanV1,
  validateNormativeRunnerDescriptorV1,
} from '../packages/collective-planning/dist/evaluation.js';
import {
  createCollectiveStatisticalCampaignNormativeAdapterResolverV1,
  createCollectiveStatisticalCampaignRegisteredProjectorV1,
  createCollectiveStatisticalCampaignRegisteredRunnerV1,
  runCollectiveStatisticalCampaignNormativeOperationV1,
  verifyCollectiveStatisticalCampaignArtifactStreamV1,
} from '../packages/mesh-sim/dist/index.js';
import {
  createLocalCollectiveStatisticalCampaignArtifactReaderV1,
  createLocalCollectiveStatisticalCampaignDeadlineArtifactWriterV1,
  createLocalCollectiveStatisticalCampaignExecutionStoreV1,
  openCollectiveStatisticalCampaignLocalStoreV1,
} from '../packages/mesh-sim-local/dist/index.js';

const registrationRoot = '/Users/douglasrodriguez/Dev/agentplat-release-evidence/empirical-study-preregistration-v28-f041284/registered-operation';
const authorizationRoot = '/Users/douglasrodriguez/Dev/agentplat-release-evidence/full-campaign-v28-f041284/authorization';
const audience = 'agentplat:local-empirical-campaign-v1';

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const registration = validateCollectiveEvaluationCampaignRegistrationV1(
  await json(path.join(registrationRoot, 'registration.json')),
);
const descriptor = validateNormativeRunnerDescriptorV1(
  await json(path.join(registrationRoot, 'adapter-descriptor.json')),
);
const plan = validateNormativeOperationPlanV1(
  await json(path.join(registrationRoot, 'operation-plan.json')),
  registration,
  descriptor,
);
const authorization = validateNormativeOperationAuthorizationV1(
  await json(path.join(authorizationRoot, 'authorization.json')),
);
const publicKeyPem = await readFile(
  path.join(authorizationRoot, 'authorization-public-key.pem'),
  'utf8',
);
const publicKey = createPublicKey(publicKeyPem);
assert.equal(authorization.planDigest, plan.planDigest);
assert.equal(authorization.registrationDigest, registration.registrationDigest);
assert.equal(authorization.adapterDigest, descriptor.descriptorDigest);

const runner = createCollectiveStatisticalCampaignRegisteredRunnerV1();
const projector = createCollectiveStatisticalCampaignRegisteredProjectorV1(
  descriptor.digests.evaluatorDigest,
);
const resolver = createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
  schemaVersion: 1,
  registrations: [{
    schemaVersion: 1,
    descriptor,
    runner,
    projector,
    planDigests: [plan.planDigest],
    authorizationDigests: [authorization.authorizationDigest],
  }],
});
const resolved = await resolver.resolveRegisteredAdapterV1({
  schemaVersion: 1,
  purpose: 'collective-statistical-campaign-normative-adapter-v1',
  descriptorDigest: descriptor.descriptorDigest,
  implementationDigest: descriptor.digests.implementationDigest,
  evaluatorDigest: descriptor.digests.evaluatorDigest,
  planDigest: plan.planDigest,
  authorizationDigest: authorization.authorizationDigest,
});
assert.equal(resolved.descriptorDigest, descriptor.descriptorDigest);

const storeRoot = await os.tmpdir();
const local = await openCollectiveStatisticalCampaignLocalStoreV1({
  root: path.join(storeRoot, `agentplat-convergence-preflight-${process.pid}`),
});
const now = () => Date.now();
const store = createLocalCollectiveStatisticalCampaignExecutionStoreV1(local, now);
const artifacts = createLocalCollectiveStatisticalCampaignDeadlineArtifactWriterV1(local, now);
const result = await runCollectiveStatisticalCampaignNormativeOperationV1({
  schemaVersion: 1,
  registration,
  descriptor,
  plan,
  authorization,
  authorizationAudience: audience,
  authorizationVerifier: {
    schemaVersion: 1,
    verifyDetachedAuthorizationV1(input) {
      return input.authorizationDigest === authorization.authorizationDigest &&
        verifyBytes(null, Buffer.from(input.authorizationDigest, 'utf8'), publicKey,
          Buffer.from(input.authentication.signature, 'base64url'));
    },
  },
  source: {
    commit: 'f041284000672b2035138769da7589a6ce89e3f3',
    treeDigest: (await json(path.join(registrationRoot, 'source-lock.json'))).sourceTreeDigest,
    clean: true,
  },
  shardIndex: 0,
  workerId: `convergence-preflight-${process.pid}`,
  leaseDurationMs: 30 * 60 * 1_000,
  store,
  artifacts,
  adapterResolver: resolver,
  now,
});
const verification = await verifyCollectiveStatisticalCampaignArtifactStreamV1({
  schemaVersion: 1,
  artifacts: result.projectionArtifactIndexes,
  reader: createLocalCollectiveStatisticalCampaignArtifactReaderV1(local, result.projectionArtifactIndexes),
});
for (const projection of result.projections) {
  assert.equal(projection.roleCoherence.decisionCount, 1_000);
  assert.equal(projection.roleCoherence.unsafeExecutableCount, 0);
  assert.ok(
    projection.convergence.healthyParticipantCount > 0 &&
      projection.convergence.agreeingParticipantCount /
        projection.convergence.healthyParticipantCount >=
        0.95,
  );
}
const convergence = result.projections.map((projection) => ({
  cellId: projection.cellId,
  runner: projection.runner,
  attempt: projection.attempt,
  healthyParticipantCount: projection.convergence.healthyParticipantCount,
  agreeingParticipantCount: projection.convergence.agreeingParticipantCount,
  interactionsToAgreement: projection.convergence.interactionsToAgreement,
  agreementEventId: projection.convergence.agreementEventId,
  healOrQuiescenceEventId: projection.convergence.healOrQuiescenceEventId,
}));
process.stdout.write(`${JSON.stringify({
  status: 'passed',
  releaseEvidence: false,
  v28EvidenceModified: false,
  shardIndex: result.shardIndex,
  selectedCellCount: result.selectedCellCount,
  projectionCount: result.projectionCount,
  verifiedArtifactCount: verification.artifactCount,
  roleDecisionCount: result.projections[0]?.roleCoherence.decisionCount ?? 0,
  unsafeExecutableCount: result.projections[0]?.roleCoherence.unsafeExecutableCount ?? 0,
  convergence,
}, null, 2)}\n`);
