import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalTrustJsonBytesV1,
  createEvidenceAttestationV1,
  createEvidenceChallengeV1,
  createEvidenceClaimV1,
  createEvidenceRetractionV1,
  createEvidenceTrustStateV1,
  createEvidenceTrustSnapshotV1,
  digestTrustJsonV1,
  digestScopeV1,
  projectEvidenceContentStatusV1,
  reduceEvidenceTrustStateV1,
  restoreEvidenceTrustSnapshotV1,
  validateEvidenceTrustStateV1,
} from "../packages/trust/dist/index.js";

const digest = (letter) => letter.repeat(64);
const scope = {
  schemaVersion: 1,
  kind: "standalone",
  tenantId: "tenant-a",
  namespace: "test",
  scopeId: "scope-a",
};
const subject = { schemaVersion: 1, kind: "peer", peerId: "peer-a" };
const local = (
  record,
  logicalTimeMs,
  effectiveAtLogicalMs = logicalTimeMs,
) => ({
  schemaVersion: 1,
  kind: "record_admitted",
  record,
  origin: "local",
  originBindingDigest: digest("a"),
  originVerifierBindingDigest: null,
  originProofDigest: null,
  effectiveAtLogicalMs,
  logicalTimeMs,
});
const claim = (sourceId = "author-a", extras = {}) =>
  createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId,
    sourceKind: "local",
    causationId: null,
    subject,
    scope,
    criterionId: "criterion-a",
    outcome: "satisfied",
    content: null,
    basisReferences: [],
    observedAt: null,
    ...extras,
  });
const withEncodedBytes = (state) => {
  const candidate = { ...structuredClone(state), encodedBytes: 0 };
  return {
    ...candidate,
    encodedBytes: canonicalTrustJsonBytesV1(candidate).byteLength,
  };
};

test("lifecycle accepts content-bound local evidence and records idempotent duplicates", () => {
  const state = createEvidenceTrustStateV1({ stateId: "state-lifecycle-a" });
  const first = reduceEvidenceTrustStateV1(state, local(claim(), 10));
  assert.equal(first.state.records[0].status, "active");
  assert.equal(
    first.state.records[0].recordDigest,
    first.state.records[0].record.claimId.slice("claim:".length),
  );
  const duplicate = reduceEvidenceTrustStateV1(
    first.state,
    local(first.state.records[0].record, 10),
  );
  assert.equal(duplicate.state.records.length, 1);
  assert.equal(duplicate.effects[0].kind, "record_duplicate");
});

test("pending relationships resolve deterministically and retractions require original authorship", () => {
  const state = createEvidenceTrustStateV1({ stateId: "state-lifecycle-b" });
  const target = claim("author-a");
  const retraction = createEvidenceRetractionV1({
    schemaVersion: 1,
    sourceId: "author-a",
    sourceKind: "local",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: target.claimId,
    targetDigest: target.claimId.slice("claim:".length),
    reasonCode: "challenge_unresolved",
    observedAt: null,
  });
  const pending = reduceEvidenceTrustStateV1(state, local(retraction, 10));
  assert.equal(pending.state.records[0].status, "pending");
  assert.equal(pending.effects[0].reasonCode, "pending_target");
  const resolved = reduceEvidenceTrustStateV1(pending.state, local(target, 11));
  assert.equal(
    resolved.state.records.find((item) => item.recordId === target.claimId)
      .status,
    "retracted",
  );
  assert.equal(
    resolved.effects.find(
      (item) =>
        item.recordId === target.claimId && item.kind === "record_accepted",
    ).reasonCode,
    "evidence_unavailable",
  );
  assert.equal(
    resolved.state.records.find(
      (item) => item.recordId === retraction.retractionId,
    ).status,
    "active",
  );
  const invalid = createEvidenceRetractionV1({
    schemaVersion: 1,
    sourceId: "author-b",
    sourceKind: "local",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: target.claimId,
    targetDigest: target.claimId.slice("claim:".length),
    reasonCode: "challenge_unresolved",
    observedAt: null,
  });
  const rejected = reduceEvidenceTrustStateV1(
    resolved.state,
    local(invalid, 12),
  );
  assert.equal(
    rejected.state.records.find(
      (item) => item.recordId === invalid.retractionId,
    ).status,
    "unavailable",
  );
});

test("relationship equivocation, cycles, and pending expiry are retained but ineffective", () => {
  const state = createEvidenceTrustStateV1({
    stateId: "state-lifecycle-c",
    limits: {
      ...createEvidenceTrustStateV1({ stateId: "state-lifecycle-limits" })
        .limits,
      maximumPendingAgeMs: 1,
    },
  });
  const target = claim();
  const attestation = createEvidenceAttestationV1({
    schemaVersion: 1,
    sourceId: "attester-a",
    sourceKind: "local",
    causationId: null,
    scope,
    claimId: target.claimId,
    claimDigest: target.claimId.slice("claim:".length),
    disposition: "support",
    confidenceBasisPoints: 9000,
    basisReferences: [],
    observedAt: null,
  });
  const conflicting = createEvidenceAttestationV1({
    schemaVersion: 1,
    sourceId: "attester-a",
    sourceKind: "local",
    causationId: null,
    scope,
    claimId: target.claimId,
    claimDigest: target.claimId.slice("claim:".length),
    disposition: "contradict",
    confidenceBasisPoints: 9000,
    basisReferences: [],
    observedAt: null,
  });
  let next = reduceEvidenceTrustStateV1(state, local(target, 0));
  next = reduceEvidenceTrustStateV1(next.state, local(attestation, 0));
  next = reduceEvidenceTrustStateV1(next.state, local(conflicting, 0));
  assert.equal(
    next.state.records.find(
      (item) => item.recordId === attestation.attestationId,
    ).status,
    "conflicted",
  );
  assert.equal(
    next.state.records.find(
      (item) => item.recordId === conflicting.attestationId,
    ).status,
    "conflicted",
  );
  const conflictChallenge = createEvidenceChallengeV1({
    schemaVersion: 1,
    sourceId: "challenger-conflict",
    sourceKind: "local",
    causationId: null,
    scope,
    targetKind: "attestation",
    targetId: attestation.attestationId,
    targetDigest: attestation.attestationId.slice("attestation:".length),
    reasonCode: "challenge_unresolved",
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "external",
        referenceType: "case",
        referenceId: "case-conflict",
        referenceDigest: digest("d"),
      },
    ],
    observedAt: null,
  });
  next = reduceEvidenceTrustStateV1(next.state, local(conflictChallenge, 0));
  assert.equal(
    next.state.records.find(
      (item) => item.recordId === attestation.attestationId,
    ).status,
    "conflicted",
  );
  assert.equal(
    next.state.records.find(
      (item) => item.recordId === conflictChallenge.challengeId,
    ).status,
    "active",
  );
  const missing = createEvidenceChallengeV1({
    schemaVersion: 1,
    sourceId: "challenger-a",
    sourceKind: "local",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: "claim-missing",
    targetDigest: digest("b"),
    reasonCode: "challenge_unresolved",
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "external",
        referenceType: "case",
        referenceId: "case-a",
        referenceDigest: digest("c"),
      },
    ],
    observedAt: null,
  });
  next = reduceEvidenceTrustStateV1(next.state, local(missing, 0));
  next = reduceEvidenceTrustStateV1(next.state, {
    schemaVersion: 1,
    kind: "advance_logical_time",
    logicalTimeMs: 1,
  });
  assert.equal(
    next.state.records.find((item) => item.recordId === missing.challengeId)
      .status,
    "unavailable",
  );
});

test("content resolution is exact and verified Mesh admission requires the bound capability", () => {
  const reference = {
    schemaVersion: 1,
    kind: "external",
    referenceType: "document",
    referenceId: "doc-a",
    referenceDigest: digest("d"),
  };
  const content = {
    kind: "reference",
    mediaType: "text/plain",
    reference,
    contentDigest: digest("e"),
    encodedBytes: 5,
  };
  const evidence = claim("author-a", { content });
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: "state-lifecycle-d" }),
    local(evidence, 5),
  ).state;
  assert.equal(
    projectEvidenceContentStatusV1(
      state.records[0],
      state.contentResolutions,
      state.contentInvalidations,
      digest("f"),
    ),
    "unavailable",
  );
  state = reduceEvidenceTrustStateV1(
    state,
    {
      schemaVersion: 1,
      kind: "content_resolution_recorded",
      logicalTimeMs: 6,
      resolution: {
        schemaVersion: 1,
        claimId: evidence.claimId,
        claimDigest: evidence.claimId.slice("claim:".length),
        scopeDigest: digestScopeV1(scope),
        referenceId: reference.referenceId,
        referenceDigest: reference.referenceDigest,
        contentDigest: content.contentDigest,
        mediaType: content.mediaType,
        encodedBytes: content.encodedBytes,
        result: "verified",
        resolverBindingDigest: digest("f"),
      },
    },
    { currentContentResolverBindingDigest: digest("f") },
  ).state;
  assert.equal(state.contentResolutions.length, 1);
  assert.equal(
    state.records.find((item) => item.recordId === evidence.claimId).status,
    "active",
  );
  assert.equal(
    projectEvidenceContentStatusV1(
      state.records.find((item) => item.recordId === evidence.claimId),
      state.contentResolutions,
      state.contentInvalidations,
      digest("f"),
    ),
    "verified",
  );
  assert.equal(
    projectEvidenceContentStatusV1(
      state.records.find((item) => item.recordId === evidence.claimId),
      state.contentResolutions,
      state.contentInvalidations,
      digest("a"),
    ),
    "stale",
  );
  assert.throws(
    () =>
      reduceEvidenceTrustStateV1(state, {
        ...local(evidence, 7),
        origin: "verified_mesh",
        originVerifierBindingDigest: digest("1"),
        originProofDigest: digest("2"),
      }),
    /origin proof/u,
  );
  const admitted = reduceEvidenceTrustStateV1(
    state,
    {
      ...local(claim("author-b"), 7),
      origin: "verified_mesh",
      originVerifierBindingDigest: digest("1"),
      originProofDigest: digest("2"),
    },
    {
      verifiedMeshAdmissionVerifierRegistry: {
        resolve: (binding) =>
          binding === digest("1")
            ? {
                verifierBindingDigest: digest("1"),
                upstreamBindingDigest: digest("a"),
                verify: () => true,
              }
            : null,
      },
    },
  );
  assert.equal(
    admitted.state.records.find((item) => item.record.sourceId === "author-b")
      .origin,
    "verified_mesh",
  );
});

test("effective time is historical, expired records are terminal, and retraction wins over challenge", () => {
  const state = createEvidenceTrustStateV1({
    stateId: "state-lifecycle-effective",
    limits: {
      ...createEvidenceTrustStateV1({
        stateId: "state-lifecycle-effective-limits",
      }).limits,
      maximumPendingAgeMs: 1,
    },
  });
  const target = claim("author-a");
  const challenge = createEvidenceChallengeV1({
    schemaVersion: 1,
    sourceId: "challenger-a",
    sourceKind: "local",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: target.claimId,
    targetDigest: target.claimId.slice("claim:".length),
    reasonCode: "challenge_unresolved",
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "external",
        referenceType: "case",
        referenceId: "case-b",
        referenceDigest: digest("b"),
      },
    ],
    observedAt: null,
  });
  const retraction = createEvidenceRetractionV1({
    schemaVersion: 1,
    sourceId: "author-a",
    sourceKind: "local",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: target.claimId,
    targetDigest: target.claimId.slice("claim:".length),
    reasonCode: "accepted",
    observedAt: null,
  });
  let next = reduceEvidenceTrustStateV1(state, local(target, 5, 1));
  next = reduceEvidenceTrustStateV1(next.state, local(challenge, 5, 2));
  next = reduceEvidenceTrustStateV1(next.state, local(retraction, 6, 0));
  assert.equal(
    next.state.records.find((item) => item.recordId === target.claimId).status,
    "retracted",
  );
  assert.equal(
    next.state.records.find((item) => item.recordId === challenge.challengeId)
      .status,
    "active",
  );
  assert.equal(
    next.state.records.find((item) => item.recordId === target.claimId)
      .effectiveAtLogicalMs,
    1,
  );
  assert.throws(
    () =>
      reduceEvidenceTrustStateV1(next.state, local(claim("author-b"), 7, 8)),
    /effective time/u,
  );
  const pendingTarget = claim("author-c");
  const pending = createEvidenceChallengeV1({
    schemaVersion: 1,
    sourceId: "challenger-b",
    sourceKind: "local",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: pendingTarget.claimId,
    targetDigest: pendingTarget.claimId.slice("claim:".length),
    reasonCode: "challenge_unresolved",
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "external",
        referenceType: "case",
        referenceId: "case-c",
        referenceDigest: digest("c"),
      },
    ],
    observedAt: null,
  });
  next = reduceEvidenceTrustStateV1(next.state, local(pending, 7));
  next = reduceEvidenceTrustStateV1(next.state, {
    schemaVersion: 1,
    kind: "advance_logical_time",
    logicalTimeMs: 8,
  });
  next = reduceEvidenceTrustStateV1(next.state, local(pendingTarget, 9));
  assert.equal(
    next.state.records.find((item) => item.recordId === pending.challengeId)
      .status,
    "unavailable",
  );
});

test("missing evidence basis is pending across record families until expiry", () => {
  const limits = {
    ...createEvidenceTrustStateV1({ stateId: "state-lifecycle-basis-limits" })
      .limits,
    maximumPendingAgeMs: 1,
  };
  const target = claim("author-basis");
  const attestation = createEvidenceAttestationV1({
    schemaVersion: 1,
    sourceId: "attester-basis",
    sourceKind: "local",
    causationId: null,
    scope,
    claimId: target.claimId,
    claimDigest: target.claimId.slice("claim:".length),
    disposition: "support",
    confidenceBasisPoints: 9000,
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "evidence",
        referenceType: "claim",
        referenceId: "claim-missing-basis",
        referenceDigest: digest("a"),
      },
    ],
    observedAt: null,
  });
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: "state-lifecycle-basis", limits }),
    local(target, 0),
  ).state;
  state = reduceEvidenceTrustStateV1(state, local(attestation, 0)).state;
  assert.equal(
    state.records.find((item) => item.recordId === attestation.attestationId)
      .status,
    "pending",
  );
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "advance_logical_time",
    logicalTimeMs: 1,
  }).state;
  assert.equal(
    state.records.find((item) => item.recordId === attestation.attestationId)
      .status,
    "unavailable",
  );
});

test("evidence-reference chains resolve together regardless of admission order", () => {
  const c = claim("chain-c");
  const b = claim("chain-b", {
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "evidence",
        referenceType: "claim",
        referenceId: c.claimId,
        referenceDigest: c.claimId.slice("claim:".length),
      },
    ],
  });
  const a = claim("chain-a", {
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "evidence",
        referenceType: "claim",
        referenceId: b.claimId,
        referenceDigest: b.claimId.slice("claim:".length),
      },
    ],
  });
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: "state-lifecycle-chain" }),
    local(a, 1),
  ).state;
  state = reduceEvidenceTrustStateV1(state, local(b, 1)).state;
  assert.equal(
    state.records.find((item) => item.recordId === a.claimId).status,
    "pending",
  );
  state = reduceEvidenceTrustStateV1(state, local(c, 1)).state;
  assert.equal(
    state.records.find((item) => item.recordId === a.claimId).status,
    "active",
  );
  assert.equal(
    state.records.find((item) => item.recordId === b.claimId).status,
    "active",
  );
});

test("late nested dependency cannot revive a direct relationship at its deadline", () => {
  const limits = {
    ...createEvidenceTrustStateV1({ stateId: "state-lifecycle-late-limits" })
      .limits,
    maximumPendingAgeMs: 3,
  };
  const c = claim("late-c");
  const b = claim("late-b", {
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "evidence",
        referenceType: "claim",
        referenceId: c.claimId,
        referenceDigest: c.claimId.slice("claim:".length),
      },
    ],
  });
  const a = createEvidenceAttestationV1({
    schemaVersion: 1,
    sourceId: "late-a",
    sourceKind: "local",
    causationId: null,
    scope,
    claimId: b.claimId,
    claimDigest: b.claimId.slice("claim:".length),
    disposition: "support",
    confidenceBasisPoints: 9000,
    basisReferences: [],
    observedAt: null,
  });
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: "state-lifecycle-late", limits }),
    local(a, 0),
  ).state;
  state = reduceEvidenceTrustStateV1(state, local(b, 1)).state;
  state = reduceEvidenceTrustStateV1(state, local(c, 5)).state;
  assert.equal(
    state.records.find((item) => item.recordId === a.attestationId).status,
    "unavailable",
  );
});

test("challenge quotas and strict state/verified snapshot restore are enforced", () => {
  const limits = {
    ...createEvidenceTrustStateV1({ stateId: "state-lifecycle-quota-limits" })
      .limits,
    maximumChallengesPerSourceScope: 1,
    maximumPendingChallengesPerSourceScope: 1,
  };
  let state = createEvidenceTrustStateV1({
    stateId: "state-lifecycle-quota",
    limits,
  });
  const makePending = (targetId, targetDigest) =>
    createEvidenceChallengeV1({
      schemaVersion: 1,
      sourceId: "challenger-q",
      sourceKind: "local",
      causationId: null,
      scope,
      targetKind: "claim",
      targetId,
      targetDigest,
      reasonCode: "challenge_unresolved",
      basisReferences: [
        {
          schemaVersion: 1,
          kind: "external",
          referenceType: "case",
          referenceId: `case-${targetId}`,
          referenceDigest: digest("d"),
        },
      ],
      observedAt: null,
    });
  state = reduceEvidenceTrustStateV1(
    state,
    local(makePending("claim-q1", digest("1")), 1),
  ).state;
  assert.throws(
    () =>
      reduceEvidenceTrustStateV1(
        state,
        local(makePending("claim-q2", digest("2")), 1),
      ),
    /challenge source scope/u,
  );
  const meshInput = {
    ...local(claim("mesh-author"), 2, 1),
    origin: "verified_mesh",
    originVerifierBindingDigest: digest("3"),
    originProofDigest: digest("4"),
  };
  state = reduceEvidenceTrustStateV1(state, meshInput, {
    verifiedMeshAdmissionVerifierRegistry: {
      resolve: (binding) =>
        binding === digest("3")
          ? {
              verifierBindingDigest: digest("3"),
              upstreamBindingDigest: digest("a"),
              verify: () => true,
            }
          : null,
    },
  }).state;
  assert.throws(
    () =>
      validateEvidenceTrustStateV1({
        ...state,
        records: [...state.records].reverse(),
      }),
    /canonically ordered/u,
  );
  const protector = {
    bindingDigest: digest("5"),
    protect: () => ({
      algorithmId: "test",
      keyId: "key-q",
      encoding: "base64url",
      proof: "proof-q",
    }),
    verify: () => true,
  };
  const snapshot = createEvidenceTrustSnapshotV1({
    state,
    generation: 1,
    previousSnapshotDigest: null,
    createdAtLogicalMs: 2,
    protector,
  });
  const anchor = {
    schemaVersion: 1,
    stateId: state.stateId,
    requiredGeneration: 1,
    requiredSnapshotDigest: snapshot.snapshotDigest,
    minimumLogicalHighWaterMs: 2,
    protectorBindingDigest: protector.bindingDigest,
  };
  assert.throws(
    () => restoreEvidenceTrustSnapshotV1(snapshot, anchor, protector),
    /admission verifier/u,
  );
  assert.equal(
    restoreEvidenceTrustSnapshotV1(snapshot, anchor, protector, {
      verifiedMeshAdmissionVerifierRegistry: {
        resolve: (binding) =>
          binding === digest("3")
            ? {
                verifierBindingDigest: digest("3"),
                upstreamBindingDigest: digest("a"),
                verify: () => true,
              }
            : null,
      },
    }).stateId,
    state.stateId,
  );
});

test("lifecycle projection converges across reorder and ineffective bases cannot block targets", () => {
  const basis = claim("permutation-basis");
  const dependent = claim("permutation-dependent", {
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "evidence",
        referenceType: "claim",
        referenceId: basis.claimId,
        referenceDigest: basis.claimId.slice("claim:".length),
      },
    ],
  });
  const target = claim("permutation-target");
  const retraction = createEvidenceRetractionV1({
    schemaVersion: 1,
    sourceId: "permutation-basis",
    sourceKind: "local",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: basis.claimId,
    targetDigest: basis.claimId.slice("claim:".length),
    reasonCode: "accepted",
    observedAt: null,
  });
  const challenge = createEvidenceChallengeV1({
    schemaVersion: 1,
    sourceId: "permutation-challenger",
    sourceKind: "local",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: target.claimId,
    targetDigest: target.claimId.slice("claim:".length),
    reasonCode: "challenge_unresolved",
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "evidence",
        referenceType: "claim",
        referenceId: basis.claimId,
        referenceDigest: basis.claimId.slice("claim:".length),
      },
    ],
    observedAt: null,
  });
  const records = [basis, dependent, target, retraction, challenge];
  const permutations = [
    records,
    [...records].reverse(),
    [challenge, target, dependent, retraction, basis],
    [retraction, dependent, basis, challenge, target],
  ];
  const projections = permutations.map((order) => {
    let state = createEvidenceTrustStateV1({
      stateId: "state-lifecycle-permutation",
    });
    for (const record of order)
      state = reduceEvidenceTrustStateV1(state, local(record, 1)).state;
    return {
      records: state.records.map(({ recordId, status }) => ({
        recordId,
        status,
      })),
      diagnostics: state.diagnostics,
    };
  });
  for (const projection of projections.slice(1))
    assert.deepEqual(projection, projections[0]);
  const statusById = new Map(
    projections[0].records.map((record) => [record.recordId, record.status]),
  );
  assert.equal(statusById.get(basis.claimId), "retracted");
  assert.equal(statusById.get(dependent.claimId), "unavailable");
  assert.equal(statusById.get(challenge.challengeId), "unavailable");
  assert.equal(statusById.get(target.claimId), "active");
});

test("inter-Challenge dependencies use a well-founded projection", () => {
  const x = claim("challenge-chain-x");
  const y = claim("challenge-chain-y");
  const target = claim("challenge-chain-target");
  const evidenceBasis = (record) => ({
    schemaVersion: 1,
    kind: "evidence",
    referenceType: "claim",
    referenceId: record.claimId,
    referenceDigest: record.claimId.slice("claim:".length),
  });
  const indirect = claim("challenge-chain-indirect", {
    basisReferences: [evidenceBasis(x)],
  });
  const makeChallenge = (sourceId, challenged, basisReferences) =>
    createEvidenceChallengeV1({
      schemaVersion: 1,
      sourceId,
      sourceKind: "local",
      causationId: null,
      scope,
      targetKind: "claim",
      targetId: challenged.claimId,
      targetDigest: challenged.claimId.slice("claim:".length),
      reasonCode: "challenge_unresolved",
      basisReferences,
      observedAt: null,
    });
  const c1 = makeChallenge("challenge-chain-c1", target, [
    evidenceBasis(indirect),
  ]);
  const c2 = makeChallenge("challenge-chain-c2", x, [evidenceBasis(y)]);
  const c3 = makeChallenge("challenge-chain-c3", y, [
    {
      schemaVersion: 1,
      kind: "external",
      referenceType: "case",
      referenceId: "challenge-chain-root",
      referenceDigest: digest("8"),
    },
  ]);
  let state = createEvidenceTrustStateV1({
    stateId: "state-challenge-chain",
  });
  for (const record of [x, y, indirect, target, c1, c2, c3])
    state = reduceEvidenceTrustStateV1(state, local(record, 1)).state;
  const status = (recordId) =>
    state.records.find((record) => record.recordId === recordId).status;
  assert.equal(status(c1.challengeId), "active");
  assert.equal(status(c2.challengeId), "unavailable");
  assert.equal(status(c3.challengeId), "active");
  assert.equal(status(target.claimId), "challenged");
  assert.equal(status(x.claimId), "active");
  assert.equal(status(y.claimId), "challenged");

  const left = claim("challenge-cycle-left");
  const right = claim("challenge-cycle-right");
  const leftChallenge = makeChallenge("challenge-cycle-a", left, [
    evidenceBasis(right),
  ]);
  const rightChallenge = makeChallenge("challenge-cycle-b", right, [
    evidenceBasis(left),
  ]);
  let cyclic = createEvidenceTrustStateV1({
    stateId: "state-challenge-cycle",
  });
  for (const record of [left, right, leftChallenge, rightChallenge])
    cyclic = reduceEvidenceTrustStateV1(cyclic, local(record, 1)).state;
  const cyclicStatus = (recordId) =>
    cyclic.records.find((record) => record.recordId === recordId).status;
  assert.equal(cyclicStatus(leftChallenge.challengeId), "unavailable");
  assert.equal(cyclicStatus(rightChallenge.challengeId), "unavailable");
  assert.equal(cyclicStatus(left.claimId), "active");
  assert.equal(cyclicStatus(right.claimId), "active");

  const isolatedClaim = claim("challenge-direct-target-claim");
  const isolatedTarget = claim("challenge-direct-target-target");
  const isolatedAttestation = createEvidenceAttestationV1({
    schemaVersion: 1,
    sourceId: "challenge-direct-attester",
    sourceKind: "local",
    causationId: null,
    scope,
    claimId: isolatedClaim.claimId,
    claimDigest: isolatedClaim.claimId.slice("claim:".length),
    disposition: "support",
    confidenceBasisPoints: 8000,
    basisReferences: [],
    observedAt: null,
  });
  const directTargetChallenge = makeChallenge(
    "challenge-direct-target-challenger",
    isolatedClaim,
    [
      {
        schemaVersion: 1,
        kind: "external",
        referenceType: "case",
        referenceId: "challenge-direct-target-case",
        referenceDigest: digest("9"),
      },
    ],
  );
  const attestationBasisChallenge = makeChallenge(
    "challenge-attestation-basis-challenger",
    isolatedTarget,
    [
      {
        schemaVersion: 1,
        kind: "evidence",
        referenceType: "attestation",
        referenceId: isolatedAttestation.attestationId,
        referenceDigest: isolatedAttestation.attestationId.slice(
          "attestation:".length,
        ),
      },
    ],
  );
  let isolated = createEvidenceTrustStateV1({
    stateId: "state-challenge-direct-target",
  });
  for (const record of [
    isolatedClaim,
    isolatedTarget,
    isolatedAttestation,
    directTargetChallenge,
    attestationBasisChallenge,
  ])
    isolated = reduceEvidenceTrustStateV1(isolated, local(record, 1)).state;
  const isolatedStatus = (recordId) =>
    isolated.records.find((record) => record.recordId === recordId).status;
  assert.equal(isolatedStatus(isolatedClaim.claimId), "challenged");
  assert.equal(isolatedStatus(isolatedAttestation.attestationId), "active");
  assert.equal(isolatedStatus(attestationBasisChallenge.challengeId), "active");
  assert.equal(isolatedStatus(isolatedTarget.claimId), "challenged");
});

test("basis depth is bounded without trusting serialized status", () => {
  const c = claim("depth-c");
  const b = claim("depth-b", {
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "evidence",
        referenceType: "claim",
        referenceId: c.claimId,
        referenceDigest: c.claimId.slice("claim:".length),
      },
    ],
  });
  const a = claim("depth-a", {
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "evidence",
        referenceType: "claim",
        referenceId: b.claimId,
        referenceDigest: b.claimId.slice("claim:".length),
      },
    ],
  });
  const limits = {
    ...createEvidenceTrustStateV1({ stateId: "state-depth-limits" }).limits,
    maximumRelationshipDepth: 1,
  };
  let state = createEvidenceTrustStateV1({
    stateId: "state-depth",
    limits,
  });
  for (const record of [c, b, a])
    state = reduceEvidenceTrustStateV1(state, local(record, 1)).state;
  assert.equal(
    state.records.find((record) => record.recordId === b.claimId).status,
    "active",
  );
  assert.equal(
    state.records.find((record) => record.recordId === a.claimId).status,
    "unavailable",
  );
  assert.equal(
    state.diagnostics.find((item) => item.recordId === a.claimId).reasonCode,
    "evidence_depth_exceeded",
  );

  const tampered = structuredClone(state);
  const cRecord = tampered.records.find(
    (record) => record.recordId === c.claimId,
  );
  cRecord.status = "unavailable";
  tampered.diagnostics.find((item) => item.recordId === c.claimId).reasonCode =
    "evidence_unavailable";
  const coherent = withEncodedBytes(tampered);
  assert.doesNotThrow(() => validateEvidenceTrustStateV1(coherent));
  const protector = {
    bindingDigest: digest("9"),
    protect: () => ({
      algorithmId: "test",
      keyId: "key-status",
      encoding: "base64url",
      proof: "proof-status",
    }),
    verify: () => true,
  };
  const snapshot = createEvidenceTrustSnapshotV1({
    state: coherent,
    generation: 1,
    previousSnapshotDigest: null,
    createdAtLogicalMs: 1,
    protector,
  });
  assert.throws(
    () =>
      restoreEvidenceTrustSnapshotV1(
        snapshot,
        {
          schemaVersion: 1,
          stateId: coherent.stateId,
          requiredGeneration: 1,
          requiredSnapshotDigest: snapshot.snapshotDigest,
          minimumLogicalHighWaterMs: 1,
          protectorBindingDigest: protector.bindingDigest,
        },
        protector,
      ),
    /lifecycle projection/u,
  );
});

test("content projection selects a current exact resolution and rejects temporal invalidation tamper", () => {
  const reference = {
    schemaVersion: 1,
    kind: "external",
    referenceType: "document",
    referenceId: "document-rotation",
    referenceDigest: digest("4"),
  };
  const content = {
    kind: "reference",
    mediaType: "application/json",
    reference,
    contentDigest: digest("5"),
    encodedBytes: 17,
  };
  const evidence = claim("content-rotation", { content });
  const resolverA = digest("6");
  const resolverB = digest("7");
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: "state-content-rotation" }),
    local(evidence, 1),
  ).state;
  const resolutionInput = (resolverBindingDigest) => ({
    schemaVersion: 1,
    kind: "content_resolution_recorded",
    logicalTimeMs: resolverBindingDigest === resolverA ? 2 : 4,
    resolution: {
      schemaVersion: 1,
      claimId: evidence.claimId,
      claimDigest: evidence.claimId.slice("claim:".length),
      scopeDigest: digestScopeV1(scope),
      referenceId: reference.referenceId,
      referenceDigest: reference.referenceDigest,
      contentDigest: content.contentDigest,
      mediaType: content.mediaType,
      encodedBytes: content.encodedBytes,
      result: "verified",
      resolverBindingDigest,
    },
  });
  state = reduceEvidenceTrustStateV1(state, resolutionInput(resolverA), {
    currentContentResolverBindingDigest: resolverA,
  }).state;
  const firstResolution = state.contentResolutions[0];
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "content_resolution_invalidated",
    logicalTimeMs: 3,
    invalidation: {
      schemaVersion: 1,
      resolutionId: firstResolution.resolutionId,
      resolutionDigest: firstResolution.resolutionDigest,
      resolverBindingDigest: firstResolution.resolverBindingDigest,
      reasonCode: "content_resolution_stale",
    },
  }).state;
  state = reduceEvidenceTrustStateV1(state, resolutionInput(resolverB), {
    currentContentResolverBindingDigest: resolverB,
  }).state;
  const record = state.records.find(
    (item) => item.recordId === evidence.claimId,
  );
  assert.equal(
    projectEvidenceContentStatusV1(
      record,
      state.contentResolutions,
      state.contentInvalidations,
      resolverB,
    ),
    "verified",
  );
  assert.equal(
    projectEvidenceContentStatusV1(
      record,
      [...state.contentResolutions].reverse(),
      [...state.contentInvalidations].reverse(),
      resolverB,
    ),
    "verified",
  );

  const tampered = structuredClone(state);
  const invalidation = tampered.contentInvalidations[0];
  invalidation.invalidatedAtLogicalMs = 1;
  const { invalidationId: _invalidationId, ...invalidationBody } = invalidation;
  invalidation.invalidationId = `content-resolution-invalidation:${digestTrustJsonV1(
    "content-resolution-invalidation",
    invalidationBody,
  )}`;
  assert.throws(
    () => validateEvidenceTrustStateV1(withEncodedBytes(tampered)),
    /does not bind a resolution/u,
  );
});
