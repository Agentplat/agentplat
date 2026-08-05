import assert from "node:assert/strict";
import test from "node:test";

import {
  CertifiedExecutionCheckpointAvailabilityV1,
  ExecutionCheckpointReplicationPeerV1,
  InMemoryExecutionCheckpointArtifactRepositoryV1,
  InMemoryExecutionCheckpointEvidenceRepositoryV1,
  InMemoryExecutionCheckpointTransportV1,
  selectExecutionCheckpointReplicasV1,
} from "@agentplat/collective-runtime/checkpoints";
import {
  PortableAgentAdapterRegistryV1,
  PortableAgentSessionRuntimeV1,
} from "@agentplat/runtime/adapter";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";

const wallTime = "2030-01-01T00:00:00.000Z";
const peerIds = [
  "peer:alpha",
  "peer:beta",
  "peer:delta",
  "peer:epsilon",
  "peer:gamma",
];
const binding = Object.freeze({
  schemaVersion: 1,
  epoch: 1,
  configurationDigest: `sha256:${"a".repeat(64)}`,
  memberInstances: Object.freeze(
    peerIds.map((peerId) => ({ peerId, instanceId: instanceId(peerId) })),
  ),
});
const policy = Object.freeze({
  schemaVersion: 1,
  replicaCount: 2,
  writeThreshold: 2,
  certificateCustodyThreshold: 2,
  evidenceLifetimeMs: 10_000,
  maximumArtifactBytes: 1_048_576,
});

test("portable sessions export and import a checkpoint without copying credentials", async () => {
  const imported = [];
  const restored = [];
  const registry = transferRegistry(imported, restored);
  const source = new PortableAgentSessionRuntimeV1({
    registry,
    control: allowControl(),
    clock: () => new Date(wallTime),
  });
  await source.createSession(sessionInput("session:source", "agent:source"));
  await source.step("session:source", stepRequest("step:source"));
  const transfer = await source.exportCheckpoint("session:source", {
    credentials: { ephemeral: "never-exported" },
  });
  assert.deepEqual(transfer.state, { counter: 1, phase: "ready" });
  assert.equal(JSON.stringify(transfer).includes("never-exported"), false);

  const target = new PortableAgentSessionRuntimeV1({
    registry,
    control: allowControl(),
    clock: () => new Date(wallTime),
  });
  const created = await target.createSession(
    sessionInput("session:target", "agent:target"),
  );
  const paused = await target.importCheckpoint(
    "session:target",
    transfer,
    created.revision,
  );
  assert.equal(paused.status, "paused");
  assert.equal(paused.checkpoint.stateDigest, transfer.checkpoint.stateDigest);
  const retried = await target.importCheckpoint(
    "session:target",
    transfer,
    created.revision,
  );
  assert.equal(retried.revision, paused.revision);
  assert.deepEqual(imported, ["session:source->session:target"]);
  const resumed = await target.resume("session:target");
  assert.equal(resumed.status, "active");
  assert.deepEqual(imported, ["session:source->session:target"]);
  assert.deepEqual(restored, ["session:target"]);
});

test("adapter registration rejects partial checkpoint transfer support", () => {
  assert.throws(
    () =>
      new PortableAgentAdapterRegistryV1().register({
        manifest: manifest(),
        adapter: {
          async step() {
            throw new Error("unused");
          },
          async checkpoint() {
            throw new Error("unused");
          },
          async restore() {},
          async exportCheckpoint() {
            return {
              schemaVersion: 1,
              contentClass: "portable_application_state",
              state: {},
            };
          },
        },
      }),
    /checkpoint transfer requires export, import, checkpoint, and restore/,
  );
});

test("a replacement resolves a certified checkpoint after source loss", async () => {
  const keys = await keyPairs();
  const membership = membershipFor(keys);
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  const states = new Map(
    peerIds.map((peerId) => [
      peerId,
      {
        artifacts: new InMemoryExecutionCheckpointArtifactRepositoryV1(),
        evidence: new InMemoryExecutionCheckpointEvidenceRepositoryV1(),
      },
    ]),
  );
  const transport = new InMemoryExecutionCheckpointTransportV1();
  for (const peerId of peerIds.filter((value) => value !== "peer:alpha")) {
    const state = states.get(peerId);
    transport.register(
      peerId,
      new ExecutionCheckpointReplicationPeerV1({
        scope: scope(peerId),
        policy,
        artifacts: state.artifacts,
        evidence: state.evidence,
        membership,
        signing: signing(peerId, keys),
        clock,
      }),
    );
  }
  const sourceState = states.get("peer:alpha");
  const producer = new CertifiedExecutionCheckpointAvailabilityV1({
    scope: scope("peer:alpha"),
    policy,
    artifacts: sourceState.artifacts,
    evidence: sourceState.evidence,
    membership,
    signing: signing("peer:alpha", keys),
    clock,
    transport,
  });
  const transfer = checkpointTransfer();
  const selected = await selectExecutionCheckpointReplicasV1({
    membership: binding,
    checkpointId: transfer.checkpoint.checkpointId,
    sourcePeerId: "peer:alpha",
    replicaCount: 2,
  });
  const certificate = await producer.publish({
    transfer,
    objectiveId: "objective:a",
    workItemId: "work:a",
    workItemRevision: 1,
    assignmentEpoch: 1,
    assignmentAuthorityId: "authority:1",
    fencingToken: "fence:1",
    workContractDigest: `sha256:${"b".repeat(64)}`,
    roleBindingDigest: `sha256:${"c".repeat(64)}`,
  });
  assert.equal(certificate.receipts.length, 2);
  const receiverId = peerIds.find(
    (peerId) =>
      peerId !== "peer:alpha" &&
      !selected.some((replica) => replica.peerId === peerId),
  );
  assert.ok(receiverId);
  const receiverState = states.get(receiverId);
  const receiver = new CertifiedExecutionCheckpointAvailabilityV1({
    scope: scope(receiverId),
    policy,
    artifacts: receiverState.artifacts,
    evidence: receiverState.evidence,
    membership,
    signing: signing(receiverId, keys),
    clock,
    transport,
  });
  const resolved = await receiver.resolve({
    checkpointId: transfer.checkpoint.checkpointId,
    tenantId: "tenant:a",
    meshId: "mesh:a",
    policyDomainId: "policy-domain:a",
    objectiveId: "objective:a",
    workItemId: "work:a",
    workItemRevision: 1,
    previousAssignmentEpoch: 1,
  });
  assert.ok(resolved);
  assert.deepEqual(resolved.transfer, transfer);
  assert.equal(resolved.artifactDigest, certificate.artifactDigest);
});

test("checkpoint publication rejects prohibited transfer keys", async () => {
  const keys = await keyPairs();
  const membership = membershipFor(keys);
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  const source = {
    artifacts: new InMemoryExecutionCheckpointArtifactRepositoryV1(),
    evidence: new InMemoryExecutionCheckpointEvidenceRepositoryV1(),
  };
  const availability = new CertifiedExecutionCheckpointAvailabilityV1({
    scope: scope("peer:alpha"),
    policy,
    ...source,
    membership,
    signing: signing("peer:alpha", keys),
    clock,
    transport: new InMemoryExecutionCheckpointTransportV1(),
  });
  const transfer = structuredClone(checkpointTransfer());
  transfer.state = { apiToken: "must-not-cross" };
  await assert.rejects(
    availability.publish({
      transfer,
      objectiveId: "objective:a",
      workItemId: "work:a",
      workItemRevision: 1,
      assignmentEpoch: 1,
      assignmentAuthorityId: "authority:1",
      fencingToken: "fence:1",
      workContractDigest: `sha256:${"b".repeat(64)}`,
      roleBindingDigest: `sha256:${"c".repeat(64)}`,
    }),
    /execution_checkpoint_state_key_prohibited/,
  );
});

function transferRegistry(imported, restored) {
  return new PortableAgentAdapterRegistryV1().register({
    manifest: manifest(),
    adapter: {
      async checkpoint(input) {
        return {
          schemaVersion: 1,
          checkpointId: `checkpoint:pause:${input.sessionId}`,
          sessionId: input.sessionId,
          adapterId: "adapter:portable",
          adapterVersion: "1.0.0",
          implementationId: "adapter:portable:build:1",
          throughStepSequence: input.throughStepSequence,
          stateReference: `local://${input.sessionId}/pause`,
          stateDigest: `sha256:${"d".repeat(64)}`,
          createdAt: wallTime,
        };
      },
      async step(input) {
        return {
          schemaVersion: 1,
          sessionId: input.sessionId,
          stepId: input.request.stepId,
          stepSequence: input.stepSequence,
          status: "completed",
          outputs: [
            {
              schemaVersion: 1,
              outputId: `output:${input.request.stepId}`,
              modality: "structured",
              content: { ok: true },
              contentReference: null,
              metadata: {},
            },
          ],
          actionProposals: [],
          checkpoint: {
            schemaVersion: 1,
            checkpointId: "checkpoint:portable:1",
            sessionId: input.sessionId,
            adapterId: "adapter:portable",
            adapterVersion: "1.0.0",
            implementationId: "adapter:portable:build:1",
            throughStepSequence: input.stepSequence,
            stateReference: `local://${input.sessionId}/1`,
            stateDigest: `sha256:${"d".repeat(64)}`,
            createdAt: wallTime,
          },
          reasonCode: null,
          metadata: {},
        };
      },
      async exportCheckpoint() {
        return {
          schemaVersion: 1,
          contentClass: "portable_application_state",
          state: { counter: 1, phase: "ready" },
        };
      },
      async importCheckpoint(input) {
        imported.push(
          `${input.transfer.sourceSessionId}->${input.targetSessionId}`,
        );
        return {
          schemaVersion: 1,
          checkpointId: `checkpoint:imported:${input.targetSessionId}`,
          sessionId: input.targetSessionId,
          adapterId: input.transfer.adapterId,
          adapterVersion: input.transfer.adapterVersion,
          implementationId: input.transfer.implementationId,
          throughStepSequence: 0,
          stateReference: `local://${input.targetSessionId}/imported`,
          stateDigest: input.transfer.checkpoint.stateDigest,
          createdAt: wallTime,
        };
      },
      async restore(input) {
        restored.push(input.sessionId);
      },
    },
  });
}

function manifest() {
  return {
    schemaVersion: 1,
    adapterId: "adapter:portable",
    adapterVersion: "1.0.0",
    implementationId: "adapter:portable:build:1",
    agentKinds: ["custom"],
    inputModalities: ["structured"],
    outputModalities: ["structured"],
    interactionModes: ["invoke"],
    controlPoints: ["pre_step", "post_output"],
    supportsCancellation: true,
    supportsCheckpoint: true,
    supportsRestore: true,
    maximumObservationBytes: 10_000,
    maximumOutputBytes: 10_000,
    maximumActionBytes: 10_000,
    maximumStepsPerSession: 10,
  };
}

function sessionInput(sessionId, agentId) {
  return {
    sessionId,
    tenant: { tenantId: "tenant:a" },
    agentId,
    adapterId: "adapter:portable",
    adapterVersion: "1.0.0",
    requirements: {
      inputModalities: ["structured"],
      outputModalities: ["structured"],
      interactionMode: "invoke",
      controlPoints: ["pre_step", "post_output"],
      requireCheckpoint: true,
      requireRestore: true,
    },
    role: {
      schemaVersion: 1,
      roleBindingId: `role:${sessionId}`,
      roleRevision: 1,
      predecessorRoleBindingId: null,
      objectiveId: "objective:a",
      roleKey: "worker",
      instructions: ["Continue accepted work"],
      constraints: {},
      validFromLogicalMs: 0,
      validUntilLogicalMs: 1_000,
    },
  };
}

function stepRequest(stepId) {
  return {
    schemaVersion: 1,
    stepId,
    expectedSessionRevision: 0,
    interactionMode: "invoke",
    observations: [],
    input: {},
    requestedOutputModalities: ["structured"],
    logicalTimeMs: 100,
  };
}

function allowControl() {
  return {
    controlId: "control:a",
    controlVersion: 1,
    implementationId: "control:build:1",
    evaluate: async () => ({ disposition: "allow", reasonCode: "allowed" }),
  };
}

function checkpointTransfer() {
  return {
    schemaVersion: 1,
    contentClass: "portable_application_state",
    tenantId: "tenant:a",
    objectiveId: "objective:a",
    sourceSessionId: "session:source",
    sourceAgentId: "agent:source",
    sourceSessionRevision: 1,
    roleBindingId: "role:source",
    adapterId: "adapter:portable",
    adapterVersion: "1.0.0",
    implementationId: "adapter:portable:build:1",
    checkpoint: {
      schemaVersion: 1,
      checkpointId: "checkpoint:portable:1",
      sessionId: "session:source",
      adapterId: "adapter:portable",
      adapterVersion: "1.0.0",
      implementationId: "adapter:portable:build:1",
      throughStepSequence: 1,
      stateReference: "local://source/checkpoint/1",
      stateDigest: `sha256:${"d".repeat(64)}`,
      createdAt: wallTime,
    },
    state: { counter: 1, phase: "ready" },
    exportedAt: wallTime,
  };
}

function scope(peerId) {
  return {
    tenantId: "tenant:a",
    meshId: "mesh:a",
    policyDomainId: "policy-domain:a",
    peerId,
    instanceId: instanceId(peerId),
  };
}
function instanceId(peerId) {
  return `instance:${peerId.slice(5)}:1`;
}
async function keyPairs() {
  return new Map(
    await Promise.all(
      peerIds.map(async (peerId) => [
        peerId,
        await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
          "sign",
          "verify",
        ]),
      ]),
    ),
  );
}
function signing(peerId, keys) {
  return {
    privateKey: keys.get(peerId).privateKey,
    keyId: `key.${peerId}`,
    algorithm: MESH_SIGNATURE_ALGORITHM,
  };
}
function membershipFor(keys) {
  return {
    currentBinding: async () => binding,
    resolveBinding: async ({ epoch, configurationDigest }) =>
      epoch === binding.epoch &&
      configurationDigest === binding.configurationDigest
        ? binding
        : null,
    resolve: ({ tenantId, meshId, peerId, keyId, algorithm }) => {
      const pair = keys.get(peerId);
      if (
        !pair ||
        tenantId !== "tenant:a" ||
        meshId !== "mesh:a" ||
        keyId !== `key.${peerId}` ||
        algorithm !== MESH_SIGNATURE_ALGORITHM
      )
        return undefined;
      return {
        tenantId,
        meshId,
        peerId,
        keyId,
        algorithm,
        publicKey: pair.publicKey,
        validFrom: "2029-01-01T00:00:00.000Z",
        validUntil: "2031-01-01T00:00:00.000Z",
        status: "active",
      };
    },
  };
}
