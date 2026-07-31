import assert from "node:assert/strict";
import test from "node:test";

import {
  createMeshEvidenceInboundProcessorV1,
  createMeshEvidenceTrustAdapterV1,
  encodeMeshTrustObservationV1,
  filterMeshCapabilityMatchesWithTrustV1,
  validateMeshEvidenceOriginJournalEntryV1,
} from "@agentplat/mesh/trust";
import {
  createStaticMeshKeyResolver,
  signMeshEnvelope,
} from "@agentplat/mesh-crypto";
import {
  createEvidenceAttestationV1,
  createEvidenceClaimV1,
  createEvidenceTrustStateV1,
  createTrustObservationV1,
  projectEvidenceLifecycleV1,
} from "../packages/trust/dist/index.js";

test("Mesh Trust filtering only preserves candidates or returns a subset", () => {
  const candidates = Object.freeze([
    Object.freeze({ peerId: "peer-a", capabilities: Object.freeze([]) }),
    Object.freeze({ peerId: "peer-b", capabilities: Object.freeze([]) }),
  ]);
  const resolver = {
    bindingDigest: "a".repeat(64),
    evaluate: (candidate) =>
      candidate.peerId === "peer-a" ? "eligible" : "restricted",
  };
  const observe = filterMeshCapabilityMatchesWithTrustV1(
    candidates,
    "observe",
    resolver,
  );
  assert.deepEqual(observe.matches, candidates);
  assert.deepEqual(
    observe.diagnostics.map((item) => item.status),
    ["eligible", "restricted"],
  );

  const restrict = filterMeshCapabilityMatchesWithTrustV1(
    candidates,
    "restrict",
    resolver,
  );
  assert.deepEqual(restrict.matches, [candidates[0]]);
  assert.equal(restrict.matches.includes(candidates[1]), false);

  const unavailable = filterMeshCapabilityMatchesWithTrustV1(
    candidates,
    "restrict",
    { bindingDigest: "b".repeat(64), evaluate: () => "unavailable" },
  );
  assert.deepEqual(unavailable.matches, []);
  assert.equal(unavailable.unavailable, true);
});

test("Mesh Trust rejects a direct payload before it can reach the adapter", async () => {
  let called = false;
  const processor = createMeshEvidenceInboundProcessorV1({
    resolver: { resolve: () => undefined },
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    adapter: {
      bindingDigest: "a".repeat(64),
      prepare: () => ({ accepted: false, code: "authorization_rejected" }),
      process: () => {
        called = true;
        throw new Error("must not be called");
      },
    },
    originVerifierBindingDigest: "b".repeat(64),
  });
  const state = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({}),
  };
  const decision = await processor.process(state, {
    envelope: { type: "evidence.claim" },
    verifiedAt: "2026-07-30T00:00:00.000Z",
    receivedAt: 1,
  });
  assert.equal(decision.accepted, false);
  assert.equal(called, false);
});

async function signedClaim(messageId = "AAAAAAAAAAAAAAAAAAAAAQ") {
  const keys = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  const claim = createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: null,
    subject: { schemaVersion: 1, kind: "peer", peerId: "peer-a" },
    scope: {
      schemaVersion: 1,
      kind: "mesh",
      tenantId: "tenant-a",
      meshId: "mesh-a",
    },
    criterionId: "criterion-a",
    outcome: "satisfied",
    content: null,
    basisReferences: [],
    observedAt: null,
  });
  const envelope = await signMeshEnvelope({
    envelope: {
      protocol: "agentplat.mesh",
      wireVersion: 0,
      messageId,
      tenantId: "tenant-a",
      meshId: "mesh-a",
      type: "evidence.claim",
      sender: { peerId: "peer-a", instanceId: "instance-a" },
      audience: { kind: "peer", peerId: "peer-b" },
      sequence: 1,
      sentAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2026-07-30T00:04:00.000Z",
      payload: {
        type: "evidence.claim",
        claimId: claim.claimId,
        subject: { kind: "peer", peerId: "peer-a" },
        scope: { kind: "mesh" },
        criterionId: "criterion-a",
        outcome: "satisfied",
        assertionDigest: claim.assertionDigest,
        content: null,
        basisReferences: [],
        observedAt: null,
      },
      proof: { algorithm: "Ed25519", keyId: "key-a" },
    },
    privateKey: keys.privateKey,
  });
  const resolver = createStaticMeshKeyResolver([
    {
      tenantId: "tenant-a",
      meshId: "mesh-a",
      peerId: "peer-a",
      keyId: "key-a",
      algorithm: "Ed25519",
      publicKey: keys.publicKey,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      status: "active",
    },
  ]);
  return { claim, envelope, keys, resolver };
}

async function signTrustPayload(keys, messageId, sequence, payload) {
  return signMeshEnvelope({
    envelope: {
      protocol: "agentplat.mesh",
      wireVersion: 0,
      messageId,
      tenantId: "tenant-a",
      meshId: "mesh-a",
      type: payload.type,
      sender: { peerId: "peer-a", instanceId: "instance-a" },
      audience: { kind: "peer", peerId: "peer-b" },
      sequence,
      sentAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2026-07-30T00:04:00.000Z",
      payload,
      proof: { algorithm: "Ed25519", keyId: "key-a" },
    },
    privateKey: keys.privateKey,
  });
}

test("signed Mesh Evidence reaches a stateful adapter only after crypto, scope and replay checks", async () => {
  const { envelope, resolver } = await signedClaim();
  const seen = new Set();
  let commits = 0;
  const processor = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: {
      bindingDigest: "d".repeat(64),
      prepare: ({ envelope: verified, receivedAt }) => {
        if (
          verified.audience.kind !== "peer" ||
          verified.audience.peerId !== "peer-b"
        )
          return { accepted: false, code: "authorization_rejected" };
        if (seen.has(verified.messageId))
          return { accepted: false, code: "replay_rejected" };
        return {
          accepted: true,
          admissionStateDigest: "e".repeat(64),
          coordinationAuthorityDigests: ["f".repeat(64)],
          replayStateDigest: "a".repeat(64),
          observationCorrelated: false,
          effectiveAtLogicalMs: receivedAt,
        };
      },
      process: ({ envelope: verified, state }) => {
        seen.add(verified.messageId);
        commits += 1;
        return {
          accepted: true,
          duplicate: false,
          state: Object.freeze({ ...state, commits }),
        };
      },
    },
  });
  const initial = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({ commits: 0 }),
  };
  const request = {
    envelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 1,
  };
  const accepted = await processor.process(initial, request);
  assert.equal(accepted.accepted, true, JSON.stringify(accepted));
  assert.equal(commits, 1);
  const replay = await processor.process(accepted.state, request);
  assert.deepEqual(replay.accepted, false);
  assert.equal(replay.code, "replay_rejected");
  assert.equal(commits, 1);

  const forged = {
    ...envelope,
    proof: {
      ...envelope.proof,
      value: `${envelope.proof.value.slice(0, -1)}A`,
    },
  };
  const forgedResult = await processor.process(initial, {
    ...request,
    envelope: forged,
  });
  assert.equal(forgedResult.accepted, false);
  assert.equal(commits, 1);
  const wrongTenant = await processor.process(
    { ...initial, identity: { ...initial.identity, tenantId: "tenant-b" } },
    request,
  );
  assert.equal(wrongTenant.accepted, false);
});

test("concrete adapter rolls back provisional replay state when Trust rejects", async () => {
  const { envelope, resolver } = await signedClaim("AAAAAAAAAAAAAAAAAAAAAg");
  const authorization = {
    prepare: ({ authorizationState, receivedAt }) => ({
      accepted: true,
      nextAuthorizationState: { attempts: authorizationState.attempts + 1 },
      admissionStateDigest: "a".repeat(64),
      coordinationAuthorityDigests: [],
      replayStateDigest: "b".repeat(64),
      observationCorrelated: false,
      effectiveAtLogicalMs: receivedAt,
    }),
  };
  const initialComposite = Object.freeze({
    authorizationState: Object.freeze({ attempts: 0 }),
    trust: createEvidenceTrustStateV1({ stateId: "trust-mesh-atomic" }),
    originProofs: Object.freeze({}),
    remoteObservations: Object.freeze({}),
  });
  const state = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: initialComposite,
  };
  const rejected = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "e".repeat(64),
    adapter: createMeshEvidenceTrustAdapterV1(
      "d".repeat(64),
      "c".repeat(64),
      authorization,
    ),
  });
  const request = {
    envelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 3,
  };
  const failed = await rejected.process(state, request);
  assert.equal(failed.accepted, false);
  assert.equal(failed.code, "trust_transition_rejected");
  assert.equal(failed.state, state);
  assert.equal(failed.state.state.authorizationState.attempts, 0);
  assert.throws(
    () =>
      createMeshEvidenceTrustAdapterV1(
        "not-a-digest",
        "c".repeat(64),
        authorization,
      ),
    /bindings/u,
  );

  const concreteAdapter = createMeshEvidenceTrustAdapterV1(
    "d".repeat(64),
    "c".repeat(64),
    authorization,
  );
  const acceptedProcessor = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: concreteAdapter,
  });
  const accepted = await acceptedProcessor.process(state, request);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.state.state.authorizationState.attempts, 1);
  assert.equal(accepted.state.state.trust.records.length, 1);
  const [originEntry] = Object.values(accepted.state.state.originProofs);
  assert.equal(validateMeshEvidenceOriginJournalEntryV1(originEntry), true);
  assert.equal(
    JSON.parse(originEntry.canonicalSignedEnvelope).proof.value,
    envelope.proof.value,
  );
  assert.equal(
    validateMeshEvidenceOriginJournalEntryV1({
      ...originEntry,
      canonicalSignedEnvelope: `${originEntry.canonicalSignedEnvelope} `,
    }),
    false,
  );
  const directBypass = concreteAdapter.process({ state: initialComposite });
  assert.equal(directBypass.accepted, false);
  assert.equal(directBypass.code, "trust_transition_rejected");
  assert.equal(directBypass.state, initialComposite);

  const rejectingAdapter = createMeshEvidenceTrustAdapterV1(
    "d".repeat(64),
    "c".repeat(64),
    { prepare: () => ({ accepted: false, code: "authorization_rejected" }) },
  );
  const mismatchedWrapper = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: {
      bindingDigest: rejectingAdapter.bindingDigest,
      prepare: concreteAdapter.prepare,
      process: rejectingAdapter.process,
    },
  });
  const bypassedAuthorization = await mismatchedWrapper.process(state, request);
  assert.equal(bypassedAuthorization.accepted, false);
  assert.equal(bypassedAuthorization.code, "trust_transition_rejected");
  assert.equal(bypassedAuthorization.state, state);
});

test("signed Attestation can arrive before its Claim and later becomes active", async () => {
  const {
    claim,
    envelope: claimEnvelope,
    keys,
    resolver,
  } = await signedClaim("AAAAAAAAAAAAAAAAAAAABQ");
  const claimDigest = claim.claimId.slice("claim:".length);
  const attestation = createEvidenceAttestationV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: null,
    scope: claim.scope,
    claimId: claim.claimId,
    claimDigest,
    disposition: "support",
    confidenceBasisPoints: 10_000,
    basisReferences: [],
    observedAt: null,
  });
  const attestationEnvelope = await signTrustPayload(
    keys,
    "AAAAAAAAAAAAAAAAAAAABg",
    2,
    {
      type: "evidence.attest",
      attestationId: attestation.attestationId,
      scope: { kind: "mesh" },
      claimId: claim.claimId,
      claimDigest,
      disposition: "support",
      confidenceBasisPoints: 10_000,
      basisReferences: [],
      observedAt: null,
    },
  );
  const authorization = {
    prepare: ({ authorizationState, receivedAt }) => {
      let correlationReads = 0;
      return Object.defineProperty(
        {
          accepted: true,
          nextAuthorizationState: {
            accepted: authorizationState.accepted + 1,
          },
          admissionStateDigest: "a".repeat(64),
          coordinationAuthorityDigests: [],
          replayStateDigest: "b".repeat(64),
          effectiveAtLogicalMs: receivedAt,
        },
        "observationCorrelated",
        {
          enumerable: true,
          get: () => {
            if (correlationReads++ === 0) return false;
            throw new Error("preparation was read more than once");
          },
        },
      );
    },
  };
  const processor = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: createMeshEvidenceTrustAdapterV1(
      "d".repeat(64),
      "c".repeat(64),
      authorization,
    ),
  });
  const initial = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({
      authorizationState: Object.freeze({ accepted: 0 }),
      trust: createEvidenceTrustStateV1({ stateId: "trust-mesh-reorder" }),
      originProofs: Object.freeze({}),
      remoteObservations: Object.freeze({}),
    }),
  };
  const pending = await processor.process(initial, {
    envelope: attestationEnvelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 6,
  });
  assert.equal(pending.accepted, true, JSON.stringify(pending));
  assert.equal(
    projectEvidenceLifecycleV1(pending.state.state.trust).records[0].status,
    "pending",
  );
  const resolved = await processor.process(pending.state, {
    envelope: claimEnvelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 7,
  });
  assert.equal(resolved.accepted, true, JSON.stringify(resolved));
  const statuses = projectEvidenceLifecycleV1(
    resolved.state.state.trust,
  ).records.map((record) => record.status);
  assert.deepEqual(statuses, ["active", "active"]);
  assert.equal(resolved.state.state.authorizationState.accepted, 2);
});

test("signed TrustObservation stays isolated from local Evidence and Fusion state", async () => {
  const { claim, envelope, keys, resolver } = await signedClaim(
    "AAAAAAAAAAAAAAAAAAAABw",
  );
  const authorization = {
    prepare: ({ authorizationState, receivedAt }) => {
      let correlationReads = 0;
      return Object.defineProperty(
        {
          accepted: true,
          nextAuthorizationState: {
            accepted: authorizationState.accepted + 1,
          },
          admissionStateDigest: "a".repeat(64),
          coordinationAuthorityDigests: [],
          replayStateDigest: "b".repeat(64),
          effectiveAtLogicalMs: receivedAt,
        },
        "observationCorrelated",
        {
          enumerable: true,
          get: () => {
            if (correlationReads++ === 0) return false;
            throw new Error("preparation was read more than once");
          },
        },
      );
    },
  };
  const processor = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: createMeshEvidenceTrustAdapterV1(
      "d".repeat(64),
      "c".repeat(64),
      authorization,
    ),
  });
  const initial = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({
      authorizationState: Object.freeze({ accepted: 0 }),
      trust: createEvidenceTrustStateV1({ stateId: "trust-mesh-observation" }),
      originProofs: Object.freeze({}),
      remoteObservations: Object.freeze({}),
    }),
  };
  const admitted = await processor.process(initial, {
    envelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 8,
  });
  assert.equal(admitted.accepted, true, JSON.stringify(admitted));
  const trustBefore = admitted.state.state.trust;
  const observation = createTrustObservationV1({
    schemaVersion: 1,
    observerId: "peer-a",
    observerKind: "peer",
    causationId: null,
    subject: claim.subject,
    scope: claim.scope,
    policyId: "policy-a",
    policyVersion: 1,
    policyDigest: "e".repeat(64),
    profileDigest: "f".repeat(64),
    fusionDecisionDigest: "9".repeat(64),
    dimensionId: "integrity",
    scoreBand: "high",
    uncertaintyBand: "low",
    disposition: "eligible",
    evidenceIds: [claim.claimId],
    observedAt: "2026-07-30T00:00:00.000Z",
    validUntil: "2026-07-30T00:01:00.000Z",
    reasonCodes: ["accepted"],
  });
  const observationEnvelope = await signTrustPayload(
    keys,
    "AAAAAAAAAAAAAAAAAAAACA",
    2,
    encodeMeshTrustObservationV1(observation),
  );
  const observed = await processor.process(admitted.state, {
    envelope: observationEnvelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 9,
  });
  assert.equal(observed.accepted, true, JSON.stringify(observed));
  assert.equal(observed.observation, true);
  assert.equal(observed.state.state.trust, trustBefore);
  assert.equal(observed.state.state.trust.records.length, 1);
  assert.equal(observed.state.state.trust.fusionDecisions.length, 0);
  assert.equal(observed.state.state.authorizationState.accepted, 2);
  assert.equal(
    observed.state.state.remoteObservations[observation.observationId]
      .correlated,
    false,
  );
});

test("throwing or malformed construction-bound preparation preserves state", async () => {
  const { envelope, resolver } = await signedClaim("AAAAAAAAAAAAAAAAAAAAAw");
  const state = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({ marker: 1 }),
  };
  for (const prepare of [
    () => null,
    () =>
      Object.defineProperty({}, "accepted", {
        get: () => {
          throw new Error("closed");
        },
      }),
    () => {
      throw new Error("closed");
    },
    ({ receivedAt }) => ({
      accepted: true,
      admissionStateDigest: "not-a-digest",
      coordinationAuthorityDigests: [],
      replayStateDigest: "a".repeat(64),
      observationCorrelated: false,
      effectiveAtLogicalMs: receivedAt,
    }),
    ({ receivedAt }) => ({
      accepted: true,
      admissionStateDigest: "d".repeat(64),
      coordinationAuthorityDigests: [],
      replayStateDigest: "e".repeat(64),
      observationCorrelated: "false",
      effectiveAtLogicalMs: receivedAt,
    }),
  ]) {
    const processor = createMeshEvidenceInboundProcessorV1({
      resolver,
      cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
      originVerifierBindingDigest: "b".repeat(64),
      adapter: {
        bindingDigest: "c".repeat(64),
        prepare,
        process: () => {
          throw new Error("must not commit");
        },
      },
    });
    const result = await processor.process(state, {
      envelope,
      verifiedAt: "2026-07-30T00:00:01.000Z",
      receivedAt: 4,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.state, state);
  }
});

test("throwing or malformed adapter transitions preserve state", async () => {
  const { envelope, resolver } = await signedClaim("AAAAAAAAAAAAAAAAAAAABA");
  const state = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({ marker: 1 }),
  };
  const prepare = ({ receivedAt }) => ({
    accepted: true,
    admissionStateDigest: "a".repeat(64),
    coordinationAuthorityDigests: [],
    replayStateDigest: "b".repeat(64),
    observationCorrelated: false,
    effectiveAtLogicalMs: receivedAt,
  });
  for (const process of [
    () => {
      throw new Error("closed");
    },
    () => ({ accepted: true, duplicate: "false", state: { marker: 2 } }),
    () => ({
      accepted: false,
      code: "trust_transition_rejected",
      state: Object.freeze({ marker: 1 }),
    }),
  ]) {
    const processor = createMeshEvidenceInboundProcessorV1({
      resolver,
      cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
      originVerifierBindingDigest: "c".repeat(64),
      adapter: { bindingDigest: "d".repeat(64), prepare, process },
    });
    const result = await processor.process(state, {
      envelope,
      verifiedAt: "2026-07-30T00:00:01.000Z",
      receivedAt: 5,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.code, "trust_transition_rejected");
    assert.equal(result.state, state);
  }
});
