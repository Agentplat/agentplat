import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  COLLECTIVE_MEMBERSHIP_PROTOCOL_V1,
  createCollectiveMembershipConfigurationV1,
  exportCollectiveMembershipPublicKeyV1,
  signCollectiveMembershipEnvelopeV1,
} from "@agentplat/collective-membership";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { Pool } from "pg";
import {
  PostgresCollectiveMembershipRepositoryV1,
  getMigrationStatus,
  runMigrations,
} from "../dist/index.js";

const integration = process.env.AGENTPLAT_POSTGRES_TEST === "1";
const digest = (character) => `sha256:${character.repeat(64)}`;

test("repository construction and migration import perform no I/O", async () => {
  const pool = new Pool({
    connectionString: "postgresql://invalid.invalid/unused",
  });
  assert.doesNotThrow(
    () =>
      new PostgresCollectiveMembershipRepositoryV1(pool, {
        schema: "membership_import_test",
        tenantId: "tenant.1",
        meshId: "mesh.1",
        peerId: "peer.1",
        policyDomainId: "policy.1",
      }),
  );
  await pool.end();
});

test(
  "PostgreSQL restores epochs, certificates, and non-equivocation state",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `membership_${randomUUID().replaceAll("-", "")}`;
    const options = {
      schema,
      tenantId: "tenant.1",
      meshId: "mesh.1",
      peerId: "peer.1",
      policyDomainId: "policy.1",
    };
    const keys = await crypto.subtle.generateKey(
      MESH_SIGNATURE_ALGORITHM,
      true,
      ["sign", "verify"],
    );
    const memberPublicKeys = await Promise.all(
      [0, 1, 2].map(async () => {
        const pair = await crypto.subtle.generateKey(
          MESH_SIGNATURE_ALGORITHM,
          true,
          ["sign", "verify"],
        );
        return pair.publicKey;
      }),
    );
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        2,
      );
      assert.equal(
        (await getMigrationStatus(pool, { schema })).pendingVersions.length,
        0,
      );
      const initial = await configuration(memberPublicKeys, 1, null);
      const first = new PostgresCollectiveMembershipRepositoryV1(pool, options);
      await first.initialize(initial);

      let createCount = 0;
      const voteInput = {
        fromEpoch: 1,
        proposalDigest: digest("a"),
        requestMessageId: "request.vote.1",
        create: async () => {
          createCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 25));
          return signedVote(keys.privateKey, "request.vote.1", digest("a"));
        },
      };
      const restarted = new PostgresCollectiveMembershipRepositoryV1(
        pool,
        options,
      );
      const [left, right] = await Promise.all([
        first.voteTransition(voteInput),
        restarted.voteTransition(voteInput),
      ]);
      assert.equal(createCount, 1);
      assert.equal(left?.messageId, right?.messageId);

      let conflictInvoked = false;
      assert.equal(
        await restarted.voteTransition({
          ...voteInput,
          proposalDigest: digest("b"),
          requestMessageId: "request.vote.conflict",
          create: async () => {
            conflictInvoked = true;
            return signedVote(
              keys.privateKey,
              "request.vote.conflict",
              digest("b"),
            );
          },
        }),
        null,
      );
      assert.equal(conflictInvoked, false);

      const next = await configuration(
        memberPublicKeys,
        2,
        initial.configurationDigest,
      );
      const certificate = await structuralCertificate(
        keys.privateKey,
        initial,
        next,
      );
      assert.equal(
        await restarted.commitTransition({
          expectedEpoch: 1,
          certificate,
        }),
        true,
      );
      const restored = new PostgresCollectiveMembershipRepositoryV1(
        pool,
        options,
      );
      assert.deepEqual(
        (await restored.configurations()).map(({ epoch }) => epoch),
        [1, 2],
      );
      assert.equal(
        (await restored.getCertificate(certificate.certificateId))
          ?.certificateDigest,
        certificate.certificateDigest,
      );
    } finally {
      await pool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await pool.end();
    }
  },
);

async function configuration(publicKeys, epoch, previousConfigurationDigest) {
  const portable = await Promise.all(
    publicKeys.map((publicKey) =>
      exportCollectiveMembershipPublicKeyV1(publicKey),
    ),
  );
  return createCollectiveMembershipConfigurationV1({
    tenantId: "tenant.1",
    meshId: "mesh.1",
    policyDomainId: "policy.1",
    epoch,
    previousConfigurationDigest,
    effectiveAt: `2030-01-01T00:0${epoch - 1}:00.000Z`,
    effectiveAtLogicalMs: (epoch - 1) * 100,
    members: ["peer.1", "peer.2", "peer.3"].map((peerId, index) => ({
      peerId,
      instanceId: `instance.${peerId}`,
      activeKeyId: `key.${peerId}`,
      keys: [
        {
          keyId: `key.${peerId}`,
          algorithm: MESH_SIGNATURE_ALGORITHM,
          publicKey: portable[index],
          validFrom: "2029-01-01T00:00:00.000Z",
          validUntil: "2031-01-01T00:00:00.000Z",
        },
      ],
    })),
  });
}

async function structuralCertificate(privateKey, current, next) {
  const proposal = {
    schemaVersion: 1,
    proposalId: "membership.transition.fixture",
    fromEpoch: current.epoch,
    toEpoch: next.epoch,
    previousConfigurationDigest: current.configurationDigest,
    nextConfiguration: next,
    change: { kind: "leave", peerId: "peer.3" },
    proposedAtLogicalMs: 10,
    expiresAtLogicalMs: 90,
    proposalDigest: digest("c"),
  };
  const requests = await Promise.all(
    ["peer.1", "peer.2"].map((peerId) =>
      signedEnvelope(privateKey, peerId, `request.${peerId}`, {
        type: "membership.transition.vote.request",
        proposal,
        requestedAtLogicalMs: 10,
      }),
    ),
  );
  const votes = await Promise.all(
    ["peer.1", "peer.2"].map((peerId) =>
      signedEnvelope(
        privateKey,
        "peer.1",
        `vote.${peerId}`,
        {
          type: "membership.transition.vote",
          requestMessageId: `request.${peerId}`,
          proposalId: proposal.proposalId,
          proposalDigest: proposal.proposalDigest,
          voterPeerId: peerId,
          fromEpoch: 1,
          toEpoch: 2,
          previousConfigurationDigest: current.configurationDigest,
          nextConfigurationDigest: next.configurationDigest,
          approvedAtLogicalMs: 10,
        },
        peerId,
      ),
    ),
  );
  return {
    schemaVersion: 1,
    kind: "membership_transition",
    certificateId: "membership.certificate.fixture",
    proposal,
    requests,
    votes,
    previousQuorumPeerIds: ["peer.1", "peer.2"],
    nextQuorumPeerIds: ["peer.1", "peer.2"],
    certifiedAt: "2030-01-01T00:00:10.000Z",
    certifiedAtLogicalMs: 10,
    certificateDigest: digest("d"),
  };
}

function signedVote(privateKey, requestMessageId, proposalDigest) {
  return signedEnvelope(privateKey, "peer.1", "response.vote.1", {
    type: "membership.transition.vote",
    requestMessageId,
    proposalId: "membership.transition.fixture",
    proposalDigest,
    voterPeerId: "peer.1",
    fromEpoch: 1,
    toEpoch: 2,
    previousConfigurationDigest: digest("e"),
    nextConfigurationDigest: digest("f"),
    approvedAtLogicalMs: 10,
  });
}

function signedEnvelope(
  privateKey,
  audiencePeerId,
  messageId,
  payload,
  senderPeerId = "peer.1",
) {
  return signCollectiveMembershipEnvelopeV1({
    envelope: {
      protocol: COLLECTIVE_MEMBERSHIP_PROTOCOL_V1,
      schemaVersion: 1,
      messageId,
      tenantId: "tenant.1",
      meshId: "mesh.1",
      senderPeerId,
      senderInstanceId: `instance.${senderPeerId}`,
      audiencePeerId,
      issuedAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:01:00.000Z",
      payload,
      proof: {
        algorithm: MESH_SIGNATURE_ALGORITHM,
        keyId: `key.${senderPeerId}`,
      },
    },
    privateKey,
  });
}
