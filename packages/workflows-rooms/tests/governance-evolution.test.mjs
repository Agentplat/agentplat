import test from "node:test";
import assert from "node:assert/strict";
import {
  createMorphogenesisAgentGenesisActivationHandoffV6,
  createMorphogenesisOrganizationalOwnerHandoffV7,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  createEvolutionContinuityEvidenceV1,
  createGenesisGovernanceCommandV1,
} from "../dist/index.js";
const sha = "sha256:" + "a".repeat(64),
  now = Date.parse("2026-09-28T12:00:00.000Z");
test("canonical Genesis and organizational owner receipts preserve enrollment and grant no work", async () => {
  const parent = {
      tenantId: "t",
      agentId: "parent",
      configurationDigest: sha,
      configuration: { ownerId: "owner", purpose: "Preserve purpose" },
    },
    child = {
      tenantId: "t",
      agentId: "child",
      configurationDigest: sha,
      configuration: {},
    };
  const genesis = createMorphogenesisAgentGenesisActivationHandoffV6({
    handoffId: "genesis",
    logicalTimeMs: now,
    expiresAtLogicalMs: now + 1000,
    entry: {
      status: "admitted",
      externalAdmissionApplied: true,
      workGranted: false,
      actionAuthorityGranted: false,
      draft: { draftDigest: sha, profile: { profileDigest: sha } },
      lifecycleAgent: {
        agentDigest: sha,
        membershipConfigurationDigest: sha,
        membershipEpoch: 1,
        capabilityKeys: ["writer"],
        roleDefinitionDigest: sha,
      },
      attestation: { attestationDigest: sha, validUntilLogicalMs: now + 2000 },
    },
  });
  const organization = createMorphogenesisOrganizationalOwnerHandoffV7({
    handoffId: "organization",
    logicalTimeMs: now,
    expiresAtLogicalMs: now + 1000,
    stepId: "step",
    governance: {
      status: "stable",
      authorizationDigest: sha,
      plan: {
        planDigest: sha,
        sourceEpoch: 1,
        successorEpoch: 2,
        steps: [
          {
            stepId: "step",
            stepDigest: sha,
            artifactDigest: sha,
            authorityOwner: "morphogenesis",
          },
        ],
      },
    },
  });
  let loaded;
  const adapter = createEvolutionContinuityEvidenceV1({
    clock: () => new Date(now),
    load: async () => loaded,
    align: async () => ({
      compatible: true,
      explanation: "Bounded same-purpose enrollment reviewed",
    }),
  });
  for (const [kind, receipt] of [
    ["genesis", genesis],
    ["organization", organization],
  ]) {
    loaded = {
      tenantId: "t",
      parentAgentId: "parent",
      childAgentId: "child",
      parentConfigurationDigest: sha,
      childConfigurationDigest: sha,
      receipt,
    };
    const proof = await adapter.verify({
      kind,
      reference: "canonical-owner-record",
      parent,
      child,
    });
    assert.equal(proof.evidenceDigest, receipt.handoffDigest);
    assert.equal(proof.permittedTools, null);
    assert.equal(proof.expiresAt, new Date(now + 1000).toISOString());
    const valid = structuredClone(loaded);
    loaded.receipt = { ...receipt, workGranted: true };
    await assert.rejects(
      adapter.verify({ kind, reference: "x", parent, child }),
      /authority/,
    );
    loaded = structuredClone(valid);
    loaded.receipt = { ...receipt, handoffId: "forged" };
    await assert.rejects(
      adapter.verify({ kind, reference: "x", parent, child }),
      /digest/,
    );
    loaded = structuredClone(valid);
    loaded.childAgentId = "another";
    await assert.rejects(
      adapter.verify({ kind, reference: "x", parent, child }),
      /enrollment/,
    );
    loaded = structuredClone(valid);
    loaded.receipt = { ...receipt, expiresAtLogicalMs: now };
    await assert.rejects(
      adapter.verify({ kind, reference: "x", parent, child }),
      /expiry/,
    );
  }
  const command = createGenesisGovernanceCommandV1({
    parent,
    continuityId: "origin",
    governanceId: "gov",
    definitionRevisionId: "def",
  });
  assert.equal(command.ownerId, "owner");
  assert.equal(command.purpose, parent.configuration.purpose);
  assert.deepEqual(command.origin, {
    parentAgentId: "parent",
    continuityId: "origin",
    kind: "genesis",
  });
  assert.throws(
    () =>
      createGenesisGovernanceCommandV1({
        parent: {
          ...parent,
          configuration: {
            ...parent.configuration,
            origin: { kind: "delegation" },
          },
        },
      }),
    /descendants/,
  );
});
