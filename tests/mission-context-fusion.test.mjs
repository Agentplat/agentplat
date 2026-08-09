import assert from "node:assert/strict";
import test from "node:test";

import { collectiveAgreementDigestV1 } from "@agentplat/collective-quorum/agreement";
import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum";
import {
  InMemoryMissionContextFusionRepositoryV1,
  createCertifiedMissionContextPlanningPortV1,
} from "@agentplat/collective-quorum/mission-context-fusion";

const trust = (character) => character.repeat(64);
const sha = (value) => collectiveQuorumDigestV1({ value });

async function certifiedFixture() {
  const membershipConfigurationDigest = await sha("membership");
  const sourceCommitDigest = await sha("commit");
  const intentDigest = await sha("intent");
  const contextReferenceDigest = await sha("context-reference");
  const requestDigest = await sha("request");
  const candidateBody = {
    schemaVersion: 1,
    tenantId: "tenant",
    subjectDigest: trust("a"),
    scopeDigest: trust("b"),
    policyId: "trust-policy",
    policyVersion: 1,
    policyDigest: trust("c"),
    profileDigest: trust("d"),
    fusionDecisionDigest: trust("e"),
    eligibilityDecisionDigest: trust("f"),
    evidenceSetDigest: trust("1"),
    recoveryDecisionDigest: null,
    disposition: "eligible",
    previousCertifiedDecisionDigest: null,
    observedAtLogicalMs: 10,
    validUntilLogicalMs: 30,
  };
  const candidateDigest = await collectiveAgreementDigestV1({
    domain: "agentplat.collective-trust.candidate.v1",
    value: candidateBody,
  });
  const candidateId = `collective-trust-candidate:${candidateDigest.slice(7)}`;
  const decisionBody = {
    ...candidateBody,
    candidateId,
    candidateDigest,
    witnessPeerIds: ["peer-a"],
    membershipEpoch: 1,
    membershipConfigurationDigest,
    sourceCommitDigest,
    certifiedAtLogicalMs: 11,
  };
  const decisionDigest = await collectiveAgreementDigestV1({
    domain: "agentplat.collective-trust.decision.v1",
    value: decisionBody,
  });
  const decision = Object.freeze({
    ...decisionBody,
    decisionId: `collective-trust-decision:${decisionDigest.slice(7)}`,
    decisionDigest,
  });
  const resolutionBody = {
    schemaVersion: 1,
    requestId: "context-request",
    requestDigest,
    scope: Object.freeze({
      tenantId: "tenant",
      meshId: "mesh",
      missionIntentId: "mission",
      intentRevision: 1,
      intentDigest,
      policyDomainId: "policy-domain",
      scopeDigest: candidateBody.scopeDigest,
    }),
    contextSubjectDigest: candidateBody.subjectDigest,
    contextReferenceDigest,
    observerPeerId: "peer-a",
    observerInstanceId: "instance-a",
    environmentCursor: "cursor-a",
    evidenceSetDigest: candidateBody.evidenceSetDigest,
    profileDigest: candidateBody.profileDigest,
    fusionDecisionDigest: candidateBody.fusionDecisionDigest,
    certifiedTrustDecisionDigest: decision.decisionDigest,
    trustPolicyId: candidateBody.policyId,
    trustPolicyVersion: candidateBody.policyVersion,
    trustPolicyDigest: candidateBody.policyDigest,
    disposition: "admitted",
    conservativeScoreBps: 9_000,
    maximumUncertaintyBps: 1_000,
    maximumContradictionPressureBps: 500,
    consideredRecordCount: 3,
    includedRecordCount: 3,
    independentSourceGroupCount: 3,
    requiredDimensionIds: ["mission-alignment"],
    witnessPeerIds: decision.witnessPeerIds,
    membershipEpoch: decision.membershipEpoch,
    membershipConfigurationDigest: decision.membershipConfigurationDigest,
    previousResolutionDigest: null,
    observedAtLogicalMs: decision.observedAtLogicalMs,
    certifiedAtLogicalMs: decision.certifiedAtLogicalMs,
    validUntilLogicalMs: decision.validUntilLogicalMs,
  };
  const resolutionDigest = await collectiveQuorumDigestV1({
    domain: "mission-context-resolution",
    body: resolutionBody,
  });
  const resolution = Object.freeze({
    ...resolutionBody,
    resolutionId: `mission-context:${resolutionDigest.slice(7, 47)}`,
    resolutionDigest,
  });
  return { decision, resolution };
}

async function planningPort(overrides = {}) {
  const fixture = await certifiedFixture();
  const repository = new InMemoryMissionContextFusionRepositoryV1();
  await repository.save({ resolution: fixture.resolution, expectedHeadDigest: null });
  let reauthenticationCount = 0;
  const options = {
    repository,
    certifiedDecisions: {
      async get(digest) {
        return digest === fixture.decision.decisionDigest
          ? fixture.decision
          : null;
      },
    },
    certification: {
      async reauthenticate({ resolution, decision, logicalTimeMs }) {
        reauthenticationCount += 1;
        assert.equal(resolution.resolutionDigest, fixture.resolution.resolutionDigest);
        assert.equal(decision.decisionDigest, fixture.decision.decisionDigest);
        assert.equal(logicalTimeMs, 12);
        return true;
      },
    },
    scopeBinding: { async verify() { return true; } },
    ...overrides,
  };
  const port = createCertifiedMissionContextPlanningPortV1(options);
  return {
    fixture,
    options,
    port,
    repository,
    reauthenticationCount: () => reauthenticationCount,
  };
}

test("resolves an opaque context digest and reauthenticates its exact certificate", async () => {
  const setup = await planningPort();
  const observation = await setup.port.observation({
    resolutionDigest: setup.fixture.resolution.resolutionDigest,
    observationId: "planning-observation",
    observationKind: "certified-context",
    logicalTimeMs: 12,
  });
  assert.ok(observation);
  assert.equal(observation.missionIntentId, "mission");
  assert.equal(
    observation.contentReferenceDigest,
    setup.fixture.resolution.contextReferenceDigest,
  );
  assert.equal(setup.reauthenticationCount(), 1);
});

test("rejects retained bytes whose resolution digest no longer binds", async () => {
  const setup = await planningPort();
  const port = createCertifiedMissionContextPlanningPortV1({
    ...setup.options,
    repository: {
      async get() {
        return { ...setup.fixture.resolution, observerPeerId: "peer-attacker" };
      },
      head: (input) => setup.repository.head(input),
    },
  });
  assert.equal(
    await port.observation({
      resolutionDigest: setup.fixture.resolution.resolutionDigest,
      observationId: "planning-observation",
      observationKind: "certified-context",
      logicalTimeMs: 12,
    }),
    null,
  );
});

test("fails closed when the configured certificate authenticator rejects", async () => {
  const setup = await planningPort({
    certification: { async reauthenticate() { return false; } },
  });
  assert.equal(
    await setup.port.observation({
      resolutionDigest: setup.fixture.resolution.resolutionDigest,
      observationId: "planning-observation",
      observationKind: "certified-context",
      logicalTimeMs: 12,
    }),
    null,
  );
});
