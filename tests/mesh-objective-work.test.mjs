import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalizeMeshPayload } from "@agentplat/mesh-protocol";
import {
  createMeshCoordinationState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkRuntimeState,
  createMeshObjectiveWorkState,
  evaluateMeshObjectiveWorkCommand,
  evaluateMeshObjectiveWorkTimer,
  evaluateVerifiedMeshObjectiveEnvelope,
  restoreMeshCoordinationState,
  restoreMeshDiscoveryState,
  restoreMeshObjectiveWorkState,
} from "@agentplat/mesh/coordination";

const fixtureRoot = new URL(
  "../packages/mesh-protocol/fixtures/v0/",
  import.meta.url,
);
const announce = fixture("objective-announce.json");
const revise = fixture("objective-revise.json");
const cancel = fixture("objective-cancel.json");

function fixture(name) {
  return JSON.parse(readFileSync(new URL(name, fixtureRoot), "utf8"));
}

function identity() {
  return {
    tenantId: "tenant-a",
    meshId: "mesh-a",
    peerId: "peer-b",
    instanceId: "instance-b",
    keyId: "key-b",
  };
}

function runtime({
  subscriptions = ["objective"],
  authorities,
  admittedPeers,
  coordinationLimits,
  objectiveLimits,
} = {}) {
  const peerIdentity = identity();
  return createMeshObjectiveWorkRuntimeState(
    createMeshCoordinationState({
      identity: peerIdentity,
      ...(coordinationLimits === undefined
        ? {}
        : { limits: coordinationLimits }),
    }),
    createMeshDiscoveryState({
      identity: peerIdentity,
      subscriptions,
      admittedPeers: admittedPeers ?? [
        {
          peerId: "peer-a",
          instanceIds: ["instance-a"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
      ],
    }),
    createMeshObjectiveWorkState({
      identity: peerIdentity,
      ...(objectiveLimits === undefined ? {} : { limits: objectiveLimits }),
      issuerAuthorities: authorities ?? [
        {
          peerId: "peer-a",
          keyIds: ["key-a"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
      ],
    }),
  );
}

function withForeignTimer(state, timerId) {
  const recordKey = JSON.stringify(["capability.advertise", "foreign-timer"]);
  const snapshot = structuredClone(state.coordination);
  const coordination = restoreMeshCoordinationState({
    ...snapshot,
    domainRecords: {
      ...snapshot.domainRecords,
      [recordKey]: {
        recordKey,
        recordType: "capability.advertise",
        recordId: "foreign-timer",
        contentDigest: "A".repeat(43),
        messageId: cancel.messageId,
        acceptedAt: snapshot.lastLogicalTime,
      },
    },
    timers: {
      ...snapshot.timers,
      [timerId]: {
        timerId,
        kind: "capability.expiry",
        dueAt: snapshot.lastLogicalTime + 100,
        generation: 1,
        domainRecordKey: recordKey,
      },
    },
  });
  return createMeshObjectiveWorkRuntimeState(
    coordination,
    state.discovery,
    state.objectives,
  );
}

function request(
  envelope,
  receivedAt = 10,
  verifiedAt = "2026-07-30T00:00:01.000Z",
) {
  const verifiedEnvelope = structuredClone(envelope);
  const payload = canonicalizeMeshPayload(verifiedEnvelope.payload);
  if (payload.ok) {
    verifiedEnvelope.payloadHash = `sha256:${createHash("sha256")
      .update(payload.value)
      .digest("base64url")}`;
  }
  return { envelope: verifiedEnvelope, receivedAt, verifiedAt };
}

function workInput(overrides = {}) {
  return {
    objectiveId: "objective-a",
    workItemId: "work-item-a",
    requiredCapabilityKeys: ["summarize"],
    matchingAttributes: { language: "en" },
    completionCriteria: ["Return a concise summary."],
    inputSummary: "Summarize the approved material.",
    budgetReservationUnits: 0,
    workDeadline: "2026-07-30T01:00:00.000Z",
    ...overrides,
  };
}

test("Objective/Work state is separately restorable, bounded and deeply immutable", () => {
  const state = createMeshObjectiveWorkState({
    identity: identity(),
    issuerAuthorities: [
      {
        peerId: "peer-a",
        keyIds: ["key-a"],
        validUntil: "2027-01-01T00:00:00.000Z",
      },
    ],
  });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.issuerAuthorities), true);
  assert.equal(Object.isFrozen(state.issuerAuthorities["peer-a"]), true);
  assert.equal(Object.isFrozen(state.issuerAuthorities["peer-a"].keyIds), true);
  assert.equal(Object.getPrototypeOf(state.objectives), null);
  assert.equal(Object.getPrototypeOf(state.objectiveDocuments), null);
  assert.equal(Object.getPrototypeOf(state.objectivePolicies), null);
  assert.equal(Object.getPrototypeOf(state.workItems), null);
  assert.throws(
    () =>
      restoreMeshObjectiveWorkState({
        ...structuredClone(state),
        unexpected: true,
      }),
    /unsupported fields/u,
  );
  assert.throws(
    () =>
      createMeshObjectiveWorkState({
        identity: identity(),
        issuerAuthorities: [
          {
            peerId: "peer-a",
            keyIds: ["key-b", "key-a"],
            validUntil: "2027-01-01T00:00:00.000Z",
          },
        ],
      }),
    /issuer key list/u,
  );
  let getterInvoked = false;
  const snapshotWithAccessor = structuredClone(state);
  Object.defineProperty(snapshotWithAccessor.limits, "maximumObjectives", {
    enumerable: true,
    get() {
      getterInvoked = true;
      return 1;
    },
  });
  assert.throws(
    () => restoreMeshObjectiveWorkState(snapshotWithAccessor),
    /plain record/u,
  );
  assert.equal(getterInvoked, false);
});

test("Objective subscription is explicit and an unauthorised issuer cannot mutate state", () => {
  const allSubscriptions = createMeshDiscoveryState({
    identity: identity(),
    admittedPeers: [],
    subscriptions: ["capability", "membership", "objective"],
  });
  assert.equal(allSubscriptions.limits.maximumSubscriptions, 3);
  const legacySnapshot = structuredClone(allSubscriptions);
  legacySnapshot.subscriptions = ["capability", "membership"];
  legacySnapshot.limits.maximumSubscriptions = 2;
  assert.equal(
    restoreMeshDiscoveryState(legacySnapshot).limits.maximumSubscriptions,
    2,
  );

  const noSubscription = runtime({
    subscriptions: ["membership", "capability"],
  });
  const rejectedTopic = evaluateVerifiedMeshObjectiveEnvelope(
    noSubscription,
    request(announce),
  );
  assert.deepEqual(rejectedTopic, {
    accepted: false,
    code: "topic_not_subscribed",
    state: noSubscription,
  });

  const noAuthority = runtime({ authorities: [] });
  const rejectedIssuer = evaluateVerifiedMeshObjectiveEnvelope(
    noAuthority,
    request(announce),
  );
  assert.deepEqual(rejectedIssuer, {
    accepted: false,
    code: "issuer_not_authorized",
    state: noAuthority,
  });
});

test("Objective admission rejects a timer ID already owned by another workflow", () => {
  const initial = runtime();
  const timerId = "objective:11:objective-a:expiry";
  const state = withForeignTimer(initial, timerId);

  const decision = evaluateVerifiedMeshObjectiveEnvelope(
    state,
    request(announce),
  );

  assert.deepEqual(decision, {
    accepted: false,
    code: "timer_id_conflict",
    state,
  });
  assert.equal(state.coordination.timers[timerId].kind, "capability.expiry");
  assert.equal(state.objectives.objectives["objective-a"], undefined);
});

test("Objective announce/revise/cancel are causal, duplicate-safe and terminal", () => {
  const initial = runtime();
  const first = evaluateVerifiedMeshObjectiveEnvelope(
    initial,
    request(announce),
  );
  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, false);
  assert.equal(
    first.state.objectives.objectives["objective-a"].objectiveRevision,
    1,
  );
  assert.equal(first.state.coordination.lastLogicalTime, 10);
  assert.equal(first.state.discovery.lastLogicalTime, 10);
  assert.equal(first.state.objectives.lastLogicalTime, 10);

  const duplicate = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(announce, 11),
  );
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state, first.state);

  const badRevision = structuredClone(revise);
  badRevision.causationId = announce.messageId;
  badRevision.payload.previousObjectiveDocumentId = "wrong";
  const rejected = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(badRevision, 11),
  );
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, "objective_predecessor_invalid");
  assert.equal(rejected.state, first.state);

  const second = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(revise, 11),
  );
  assert.equal(second.accepted, true);
  assert.equal(
    second.state.objectives.objectives["objective-a"].objectiveRevision,
    2,
  );
  const revisedObjective = second.state.objectives.objectives["objective-a"];
  const cancelled = evaluateVerifiedMeshObjectiveEnvelope(
    second.state,
    request(cancel, 12),
  );
  assert.equal(cancelled.accepted, true);
  assert.equal(
    cancelled.state.objectives.objectives["objective-a"].status,
    "cancelled",
  );
  assert.equal(
    cancelled.state.coordination.timers[revisedObjective.expiryTimerId],
    undefined,
  );
  const jsonRestoredCancelled = createMeshObjectiveWorkRuntimeState(
    restoreMeshCoordinationState(
      JSON.parse(JSON.stringify(cancelled.state.coordination)),
    ),
    restoreMeshDiscoveryState(
      JSON.parse(JSON.stringify(cancelled.state.discovery)),
    ),
    restoreMeshObjectiveWorkState(
      JSON.parse(JSON.stringify(cancelled.state.objectives)),
    ),
  );
  assert.equal(
    jsonRestoredCancelled.objectives.objectives["objective-a"].status,
    "cancelled",
  );
  const oldDuplicateAfterTerminal = evaluateVerifiedMeshObjectiveEnvelope(
    cancelled.state,
    request(revise, 13),
  );
  assert.equal(oldDuplicateAfterTerminal.accepted, true);
  assert.equal(oldDuplicateAfterTerminal.duplicate, true);
  assert.equal(oldDuplicateAfterTerminal.state, cancelled.state);

  const newAfterTerminal = structuredClone(revise);
  newAfterTerminal.messageId = "TTTTTTTTTTTTTTTTTTTTTA";
  newAfterTerminal.payload.objectiveDocumentId = "objective-document-c";
  newAfterTerminal.payload.objectiveRevision = 3;
  newAfterTerminal.payload.previousObjectiveDocumentId =
    revise.payload.objectiveDocumentId;
  newAfterTerminal.causationId = revise.messageId;
  const afterTerminal = evaluateVerifiedMeshObjectiveEnvelope(
    cancelled.state,
    request(newAfterTerminal, 13),
  );
  assert.equal(afterTerminal.accepted, false);
  assert.equal(afterTerminal.code, "objective_terminal");
});

test("local Work commands use trusted time, retain zero budget and fail closed", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce),
  );
  assert.equal(announced.accepted, true);
  const created = evaluateMeshObjectiveWorkCommand(
    announced.state,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 11 },
  );
  assert.equal(created.accepted, true);
  const work =
    created.state.objectives.workItems[
      JSON.stringify(["objective-a", "work-item-a"])
    ];
  assert.equal(work.budgetReservationUnits, 0);
  assert.equal(work.ownerPeerId, "peer-b");
  assert.equal(work.ownerEpoch, 1);
  assert.equal(created.state.coordination.lastLogicalTime, 11);
  assert.equal(created.state.discovery.lastLogicalTime, 11);
  assert.equal(created.state.objectives.lastLogicalTime, 11);

  for (const input of [
    workInput({ workItemId: "negative", budgetReservationUnits: -1 }),
    workInput({
      workItemId: "unsafe",
      budgetReservationUnits: Number.MAX_SAFE_INTEGER + 1,
    }),
    workInput({ workItemId: "over", budgetReservationUnits: 1001 }),
  ]) {
    const rejected = evaluateMeshObjectiveWorkCommand(
      created.state,
      { kind: "work.create", input },
      { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 12 },
    );
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.state, created.state);
  }
  assert.throws(
    () =>
      evaluateMeshObjectiveWorkCommand(
        created.state,
        { kind: "work.create", input: workInput({ workItemId: "backwards" }) },
        { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 10 },
      ),
    /cannot move backwards/u,
  );
});

test("Work creation rejects a timer ID already owned by another workflow", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce),
  );
  assert.equal(announced.accepted, true);
  const timerId = "work:11:objective-a:11:work-item-a:deadline";
  const state = withForeignTimer(announced.state, timerId);

  const decision = evaluateMeshObjectiveWorkCommand(
    state,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 11 },
  );

  assert.deepEqual(decision, {
    accepted: false,
    code: "timer_id_conflict",
    state,
  });
  assert.equal(state.coordination.timers[timerId].kind, "capability.expiry");
  assert.equal(
    state.objectives.workItems[JSON.stringify(["objective-a", "work-item-a"])],
    undefined,
  );
});

test("Objective local limits reject fail-closed without throwing or mutation", () => {
  const state = runtime({
    objectiveLimits: { maximumProjectionBytes: 1 },
  });

  const decision = evaluateVerifiedMeshObjectiveEnvelope(
    state,
    request(announce),
  );

  assert.deepEqual(decision, {
    accepted: false,
    code: "objective_limit_exceeded",
    state,
  });
  assert.equal(state.objectives.objectives["objective-a"], undefined);
  assert.equal(Object.keys(state.coordination.domainRecords).length, 0);
  assert.equal(Object.keys(state.coordination.timers).length, 0);

  const bounded = evaluateVerifiedMeshObjectiveEnvelope(
    runtime({ objectiveLimits: { maximumProjectionBytes: 1_700 } }),
    request(announce, 10),
  );
  assert.equal(bounded.accepted, true);
  const boundedRevision = evaluateVerifiedMeshObjectiveEnvelope(
    bounded.state,
    request(revise, 11),
  );
  assert.equal(boundedRevision.accepted, true);
  const oversizedCancellation = evaluateVerifiedMeshObjectiveEnvelope(
    boundedRevision.state,
    request(cancel, 12),
  );
  assert.deepEqual(oversizedCancellation, {
    accepted: false,
    code: "objective_limit_exceeded",
    state: boundedRevision.state,
  });

  const selfWitness = structuredClone(announce);
  selfWitness.payload.recoveryWitnessPeerIds = [
    "peer-a",
    "peer-witness-a",
    "peer-witness-b",
  ];
  const rejectedSelfWitness = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(selfWitness),
  );
  assert.equal(rejectedSelfWitness.accepted, false);
  assert.equal(rejectedSelfWitness.code, "objective_limit_exceeded");
});

test("Objective head identity collisions reject before snapshot composition", () => {
  const first = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce),
  );
  assert.equal(first.accepted, true);

  const reusedMessage = structuredClone(announce);
  reusedMessage.objectiveId = "objective-b";
  reusedMessage.payload.objectiveId = "objective-b";
  reusedMessage.payload.objectiveDocumentId = "objective-document-b";
  const decision = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(reusedMessage, 11),
  );

  assert.deepEqual(decision, {
    accepted: false,
    code: "domain_record_conflict",
    state: first.state,
  });

  const second = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(revise, 11),
  );
  assert.equal(second.accepted, true);
  for (const collision of [
    {
      messageId: "VVVVVVVVVVVVVVVVVVVVVQ",
      objectiveDocumentId: announce.payload.objectiveDocumentId,
    },
    {
      messageId: announce.messageId,
      objectiveDocumentId: "objective-document-revision-3",
    },
  ]) {
    const revisionThree = structuredClone(revise);
    revisionThree.messageId = collision.messageId;
    revisionThree.sequence = 3;
    revisionThree.causationId = revise.messageId;
    revisionThree.payload.objectiveRevision = 3;
    revisionThree.payload.previousObjectiveDocumentId =
      revise.payload.objectiveDocumentId;
    revisionThree.payload.objectiveDocumentId = collision.objectiveDocumentId;
    const historicalCollision = evaluateVerifiedMeshObjectiveEnvelope(
      second.state,
      request(revisionThree, 12),
    );
    assert.deepEqual(historicalCollision, {
      accepted: false,
      code: "domain_record_conflict",
      state: second.state,
    });
  }
});

test("trusted time divergence cannot extend Work past Objective logical expiry", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce),
  );
  assert.equal(announced.accepted, true);
  const objective = announced.state.objectives.objectives["objective-a"];
  const receivedAt = objective.expiresAt - 1;

  const decision = evaluateMeshObjectiveWorkCommand(
    announced.state,
    {
      kind: "work.create",
      input: workInput({
        workDeadline: "2026-07-30T00:00:02.000Z",
      }),
    },
    {
      verifiedAt: objective.validityVerifiedAt,
      receivedAt,
    },
  );

  assert.deepEqual(decision, {
    accepted: false,
    code: "work_limit_exceeded",
    state: announced.state,
  });
  assert.ok(receivedAt < objective.expiresAt);
});

test("Objective timers are generation-fenced and fail closed without consuming state", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce),
  );
  assert.equal(announced.accepted, true);
  const objective = announced.state.objectives.objectives["objective-a"];
  const timer = announced.state.coordination.timers[objective.expiryTimerId];
  for (const [input, time, code] of [
    [
      { kind: "timer.fired", timerId: "missing", generation: 1 },
      10,
      "timer_unknown",
    ],
    [
      { kind: "timer.fired", timerId: timer.timerId, generation: 2 },
      timer.dueAt,
      "timer_generation_stale",
    ],
    [
      { kind: "timer.fired", timerId: timer.timerId, generation: 1 },
      timer.dueAt - 1,
      "timer_not_due",
    ],
  ]) {
    const rejected = evaluateMeshObjectiveWorkTimer(
      announced.state,
      input,
      time,
    );
    assert.deepEqual(rejected, {
      accepted: false,
      code,
      state: announced.state,
    });
  }
  const expired = evaluateMeshObjectiveWorkTimer(
    announced.state,
    {
      kind: "timer.fired",
      timerId: timer.timerId,
      generation: timer.generation,
    },
    timer.dueAt,
  );
  assert.equal(expired.accepted, true);
  assert.equal(
    expired.state.objectives.objectives["objective-a"].status,
    "expired",
  );
  assert.equal(expired.state.coordination.timers[timer.timerId], undefined);
  assert.throws(
    () =>
      evaluateMeshObjectiveWorkTimer(
        announced.state,
        { kind: "timer.fired", timerId: timer.timerId, generation: 1 },
        9,
      ),
    /cannot move backwards/u,
  );
});

test("Objective ingress requires the admitted exact instance before it trusts issuer authority", () => {
  const wrongInstance = structuredClone(announce);
  wrongInstance.sender.instanceId = "instance-replacement";
  const state = runtime();
  const decision = evaluateVerifiedMeshObjectiveEnvelope(
    state,
    request(wrongInstance),
  );
  assert.equal(decision.accepted, false);
  assert.equal(decision.state, state);

  const expiredAdmission = createMeshObjectiveWorkRuntimeState(
    createMeshCoordinationState({ identity: identity() }),
    createMeshDiscoveryState({
      identity: identity(),
      subscriptions: ["objective"],
      admittedPeers: [
        {
          peerId: "peer-a",
          instanceIds: ["instance-a"],
          validUntil: "2026-07-30T00:00:00.000Z",
        },
      ],
    }),
    createMeshObjectiveWorkState({
      identity: identity(),
      issuerAuthorities: [
        {
          peerId: "peer-a",
          keyIds: ["key-a"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
      ],
    }),
  );
  const rejectedExpired = evaluateVerifiedMeshObjectiveEnvelope(
    expiredAdmission,
    request(announce),
  );
  assert.equal(rejectedExpired.accepted, false);
  assert.equal(rejectedExpired.state, expiredAdmission);
});

test("Objective/Work requests and commands use closed schemas and do not accept caller time", () => {
  const state = runtime();
  assert.throws(
    () =>
      evaluateVerifiedMeshObjectiveEnvelope(state, {
        ...request(announce),
        extra: true,
      }),
    /required|unsupported|invalid/u,
  );
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    state,
    request(announce),
  );
  assert.equal(announced.accepted, true);
  assert.throws(
    () =>
      evaluateMeshObjectiveWorkCommand(
        announced.state,
        {
          kind: "work.create",
          input: { ...workInput(), receivedAt: 99 },
        },
        { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 11 },
      ),
    /invalid|unsupported/u,
  );
  const structurallyInvalid = structuredClone(announce);
  structurallyInvalid.messageId = "not-a-canonical-message-id";
  const invalidDecision = evaluateVerifiedMeshObjectiveEnvelope(
    state,
    request(structurallyInvalid),
  );
  assert.equal(invalidDecision.accepted, false);
  assert.equal(invalidDecision.code, "invalid_verified_envelope");
  assert.equal(invalidDecision.state, state);
  assert.throws(
    () =>
      evaluateMeshObjectiveWorkCommand(
        announced.state,
        { kind: "work.create", input: workInput(), unexpected: true },
        { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 11 },
      ),
    /invalid|unsupported/u,
  );
});

test("revisions replace stable timers with a higher generation; Work revision and cancel are fenced", () => {
  const first = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce, 10),
  );
  assert.equal(first.accepted, true);
  const firstTimer =
    first.state.coordination.timers[
      first.state.objectives.objectives["objective-a"].expiryTimerId
    ];
  const revised = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(revise, 11),
  );
  assert.equal(revised.accepted, true);
  const objective = revised.state.objectives.objectives["objective-a"];
  const secondTimer =
    revised.state.coordination.timers[objective.expiryTimerId];
  assert.equal(secondTimer.timerId, firstTimer.timerId);
  assert.equal(secondTimer.generation, firstTimer.generation + 1);
  assert.equal(objective.workItemCount, 0);
  assert.equal(objective.reservedBudgetUnits, 0);
  const staleObjective = evaluateMeshObjectiveWorkTimer(
    revised.state,
    {
      kind: "timer.fired",
      timerId: firstTimer.timerId,
      generation: firstTimer.generation,
    },
    secondTimer.dueAt,
  );
  assert.deepEqual(staleObjective, {
    accepted: false,
    code: "timer_generation_stale",
    state: revised.state,
  });

  const created = evaluateMeshObjectiveWorkCommand(
    revised.state,
    {
      kind: "work.create",
      input: workInput({ workDeadline: "2026-07-30T01:00:00.000Z" }),
    },
    { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 12 },
  );
  assert.equal(created.accepted, true);
  const key = JSON.stringify(["objective-a", "work-item-a"]);
  const workOne = created.state.objectives.workItems[key];
  const workTimerOne = created.state.coordination.timers[workOne.expiryTimerId];
  const revisedWork = evaluateMeshObjectiveWorkCommand(
    created.state,
    {
      kind: "work.revise",
      expectedWorkItemRevision: 1,
      input: workInput({
        workDeadline: "2026-07-30T02:00:00.000Z",
      }),
    },
    { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 13 },
  );
  assert.equal(revisedWork.accepted, true);
  const workTwo = revisedWork.state.objectives.workItems[key];
  const workTimerTwo =
    revisedWork.state.coordination.timers[workTwo.expiryTimerId];
  assert.equal(workTimerTwo.timerId, workTimerOne.timerId);
  assert.equal(workTimerTwo.generation, workTimerOne.generation + 1);
  const staleWork = evaluateMeshObjectiveWorkTimer(
    revisedWork.state,
    {
      kind: "timer.fired",
      timerId: workTimerOne.timerId,
      generation: workTimerOne.generation,
    },
    workTimerTwo.dueAt,
  );
  assert.equal(staleWork.accepted, false);
  assert.equal(staleWork.code, "timer_generation_stale");
  const cancelled = evaluateMeshObjectiveWorkCommand(
    revisedWork.state,
    {
      kind: "work.cancel",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 2,
    },
    { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 14 },
  );
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.state.objectives.workItems[key].status, "cancelled");
  assert.equal(cancelled.state.objectives.workItems[key].terminalAt, 14);
  assert.equal(cancelled.state.objectives.workItems[key].updatedAt, 14);
  assert.equal(
    cancelled.state.coordination.timers[workTimerTwo.timerId],
    undefined,
  );
});

test("Objective authority permits provisioned key rotation but never issuer takeover", () => {
  const first = evaluateVerifiedMeshObjectiveEnvelope(
    runtime({
      authorities: [
        {
          peerId: "peer-a",
          keyIds: ["key-a", "key-a-rotated"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
        {
          peerId: "peer-c",
          keyIds: ["key-c"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
      ],
      admittedPeers: [
        {
          peerId: "peer-a",
          instanceIds: ["instance-a"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
        {
          peerId: "peer-c",
          instanceIds: ["instance-c"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
      ],
    }),
    request(announce),
  );
  assert.equal(first.accepted, true);

  const rotated = structuredClone(revise);
  rotated.proof.keyId = "key-a-rotated";
  const acceptedRotation = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(rotated, 11),
  );
  assert.equal(acceptedRotation.accepted, true);
  assert.equal(
    acceptedRotation.state.objectives.objectives["objective-a"].issuerKeyId,
    "key-a-rotated",
  );

  const takeover = structuredClone(revise);
  takeover.messageId = "UUUUUUUUUUUUUUUUUUUUUA";
  takeover.sender.peerId = "peer-c";
  takeover.sender.instanceId = "instance-c";
  takeover.proof.keyId = "key-c";
  takeover.payload.issuerPeerId = "peer-c";
  takeover.payload.objectiveDocumentId = "objective-document-takeover";
  takeover.payload.objectiveRevision = 2;
  takeover.payload.previousObjectiveDocumentId =
    announce.payload.objectiveDocumentId;
  takeover.causationId = announce.messageId;
  const rejectedTakeover = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(takeover, 11),
  );
  assert.equal(rejectedTakeover.accepted, false);
  assert.equal(rejectedTakeover.code, "issuer_not_authorized");
  assert.equal(rejectedTakeover.state, first.state);
});

test("an Objective revision does not rewrite an existing Work timer binding", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce, 10),
  );
  assert.equal(announced.accepted, true);
  const created = evaluateMeshObjectiveWorkCommand(
    announced.state,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 11 },
  );
  assert.equal(created.accepted, true);
  const key = JSON.stringify(["objective-a", "work-item-a"]);
  const work = created.state.objectives.workItems[key];
  const timerBefore = created.state.coordination.timers[work.expiryTimerId];

  const revised = evaluateVerifiedMeshObjectiveEnvelope(
    created.state,
    request(revise, 12, "2026-07-30T00:00:03.000Z"),
  );
  assert.equal(revised.accepted, true);
  const timerAfter = revised.state.coordination.timers[work.expiryTimerId];
  assert.equal(timerAfter, timerBefore);
  assert.equal(
    timerAfter.domainRecordKey,
    JSON.stringify([
      "objective.announce",
      announce.payload.objectiveDocumentId,
    ]),
  );
  assert.equal(revised.state.objectives.workItems[key].objectiveRevision, 1);
  const expiredWork = evaluateMeshObjectiveWorkTimer(
    revised.state,
    {
      kind: "timer.fired",
      timerId: timerAfter.timerId,
      generation: timerAfter.generation,
    },
    timerAfter.dueAt,
  );
  assert.equal(expiredWork.accepted, true);
  assert.equal(expiredWork.state.objectives.workItems[key].status, "expired");
});

test("a Work revision after an Objective revision binds the new policy head", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce, 10),
  );
  assert.equal(announced.accepted, true);
  const created = evaluateMeshObjectiveWorkCommand(
    announced.state,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 11 },
  );
  assert.equal(created.accepted, true);
  const revisedObjective = evaluateVerifiedMeshObjectiveEnvelope(
    created.state,
    request(revise, 12, "2026-07-30T00:00:03.000Z"),
  );
  assert.equal(revisedObjective.accepted, true);

  const revisedWork = evaluateMeshObjectiveWorkCommand(
    revisedObjective.state,
    {
      kind: "work.revise",
      expectedWorkItemRevision: 1,
      input: workInput({ workDeadline: "2026-07-30T02:00:00.000Z" }),
    },
    { verifiedAt: "2026-07-30T00:00:04.000Z", receivedAt: 13 },
  );
  assert.equal(revisedWork.accepted, true);
  const key = JSON.stringify(["objective-a", "work-item-a"]);
  const work = revisedWork.state.objectives.workItems[key];
  assert.equal(work.createdAt, 11);
  assert.equal(work.updatedAt, 13);
  assert.equal(work.objectiveRevision, 2);
  assert.equal(work.objectivePolicy.acceptedAt, 12);
  assert.equal(
    createMeshObjectiveWorkRuntimeState(
      restoreMeshCoordinationState(
        JSON.parse(JSON.stringify(revisedWork.state.coordination)),
      ),
      restoreMeshDiscoveryState(
        JSON.parse(JSON.stringify(revisedWork.state.discovery)),
      ),
      restoreMeshObjectiveWorkState(
        JSON.parse(JSON.stringify(revisedWork.state.objectives)),
      ),
    ).objectives.workItems[key].objectiveRevision,
    2,
  );
});

test("retained Objective policies bind historical Work exactly and reject forged history", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce, 10),
  );
  assert.equal(announced.accepted, true);
  const created = evaluateMeshObjectiveWorkCommand(
    announced.state,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 11 },
  );
  assert.equal(created.accepted, true);
  const revised = evaluateVerifiedMeshObjectiveEnvelope(
    created.state,
    request(revise, 12, "2026-07-30T00:00:03.000Z"),
  );
  assert.equal(revised.accepted, true);

  const workKey = JSON.stringify(["objective-a", "work-item-a"]);
  const revisionOneKey = JSON.stringify(["objective-a", 1]);
  const revisionTwoKey = JSON.stringify(["objective-a", 2]);
  const historicalWork = revised.state.objectives.workItems[workKey];
  assert.equal(historicalWork.objectiveRevision, 1);
  assert.equal(
    historicalWork.objectivePolicy,
    revised.state.objectives.objectivePolicies[revisionOneKey],
  );
  assert.equal(
    revised.state.objectives.objectivePolicies[revisionTwoKey]
      .objectiveRevision,
    2,
  );

  const roundTripped = createMeshObjectiveWorkRuntimeState(
    restoreMeshCoordinationState(
      JSON.parse(JSON.stringify(revised.state.coordination)),
    ),
    restoreMeshDiscoveryState(
      JSON.parse(JSON.stringify(revised.state.discovery)),
    ),
    restoreMeshObjectiveWorkState(
      JSON.parse(JSON.stringify(revised.state.objectives)),
    ),
  );
  assert.equal(
    roundTripped.objectives.workItems[workKey].objectivePolicy,
    roundTripped.objectives.objectivePolicies[revisionOneKey],
  );

  for (const [field, value] of [
    ["maximumBudgetUnits", 999],
    ["permittedCapabilityKeys", ["translate"]],
    ["validUntil", "2026-08-29T00:00:00.001Z"],
    ["expiresAt", 999],
  ]) {
    const forged = structuredClone(revised.state.objectives);
    forged.workItems[workKey].objectivePolicy = structuredClone(
      forged.workItems[workKey].objectivePolicy,
    );
    forged.workItems[workKey].objectivePolicy[field] = value;
    assert.throws(
      () => restoreMeshObjectiveWorkState(forged),
      /Objective binding|Objective policy binding|policy history|policy value/u,
      `forged historical policy ${field} must not restore`,
    );
  }

  for (const forgery of [
    {
      field: "maximumBudgetUnits",
      value: 999,
      payloadField: "maximumBudgetUnits",
      payloadValue: 999,
    },
    {
      field: "permittedCapabilityKeys",
      value: ["summarize", "translate"],
      payloadField: "permittedCapabilityKeys",
      payloadValue: ["summarize", "translate"],
    },
    {
      field: "validUntil",
      value: "2026-08-28T00:00:00.000Z",
      payloadField: "validUntil",
      payloadValue: "2026-08-28T00:00:00.000Z",
      expiresAt: 2_505_599_010,
    },
  ]) {
    const forged = structuredClone(revised.state.objectives);
    const policy = forged.objectivePolicies[revisionOneKey];
    const workPolicy = forged.workItems[workKey].objectivePolicy;
    policy[forgery.field] = forgery.value;
    workPolicy[forgery.field] = structuredClone(forgery.value);
    const document = forged.objectiveDocuments[revisionOneKey];
    document.envelope.payload[forgery.payloadField] = structuredClone(
      forgery.payloadValue,
    );
    if (forgery.expiresAt !== undefined) {
      document.expiresAt = forgery.expiresAt;
      policy.expiresAt = forgery.expiresAt;
      workPolicy.expiresAt = forgery.expiresAt;
    }
    assert.throws(
      () => restoreMeshObjectiveWorkState(forged),
      /payload digest/u,
      `coherent historical forgery ${forgery.field} must not restore`,
    );
  }

  const forgedExpiry = structuredClone(revised.state.objectives);
  forgedExpiry.objectiveDocuments[revisionOneKey].expiresAt = 999;
  forgedExpiry.objectivePolicies[revisionOneKey].expiresAt = 999;
  forgedExpiry.workItems[workKey].objectivePolicy.expiresAt = 999;
  assert.throws(
    () => restoreMeshObjectiveWorkState(forgedExpiry),
    /logical expiry/u,
    "coherent historical expiry forgery must not restore",
  );
});

test("Objective policy history applies bounded backpressure without evicting Work bindings", () => {
  const first = evaluateVerifiedMeshObjectiveEnvelope(
    runtime({ objectiveLimits: { maximumObjectivePolicies: 1 } }),
    request(announce, 10),
  );
  assert.equal(first.accepted, true);
  const key = JSON.stringify(["objective-a", 1]);
  assert.ok(first.state.objectives.objectivePolicies[key]);

  const saturated = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(revise, 11, "2026-07-30T00:00:03.000Z"),
  );
  assert.deepEqual(saturated, {
    accepted: false,
    code: "objective_policy_capacity_exceeded",
    state: first.state,
  });
  assert.deepEqual(Object.keys(first.state.objectives.objectivePolicies), [
    key,
  ]);
});

test("sub-millisecond Objective and Work timestamps round remaining time up to logical milliseconds", () => {
  const nanosecondAnnounce = structuredClone(announce);
  nanosecondAnnounce.payload.validFrom = "2026-07-29T23:59:59.999000000Z";
  nanosecondAnnounce.payload.validUntil = "2026-07-30T00:00:00.000999900Z";
  nanosecondAnnounce.payload.bidWindowMs = 1;
  nanosecondAnnounce.payload.acceptanceWindowMs = 1;
  nanosecondAnnounce.payload.maximumLeaseDurationMs = 1;
  nanosecondAnnounce.payload.recoveryGraceMs = 1;
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(nanosecondAnnounce, 10, "2026-07-30T00:00:00.000999100Z"),
  );
  assert.equal(announced.accepted, true);
  assert.equal(
    announced.state.objectives.objectives["objective-a"].expiresAt,
    11,
  );

  const nanosecondRevise = structuredClone(revise);
  nanosecondRevise.payload.validFrom = "2026-07-29T23:59:59.999000000Z";
  nanosecondRevise.payload.validUntil = "2026-07-30T00:00:00.000999800Z";
  nanosecondRevise.payload.bidWindowMs = 1;
  nanosecondRevise.payload.acceptanceWindowMs = 1;
  nanosecondRevise.payload.maximumLeaseDurationMs = 1;
  nanosecondRevise.payload.recoveryGraceMs = 1;
  const revised = evaluateVerifiedMeshObjectiveEnvelope(
    announced.state,
    request(nanosecondRevise, 10, "2026-07-30T00:00:00.000999200Z"),
  );
  assert.equal(revised.accepted, true);
  assert.equal(
    revised.state.objectives.objectives["objective-a"].expiresAt,
    11,
  );

  const created = evaluateMeshObjectiveWorkCommand(
    revised.state,
    {
      kind: "work.create",
      input: workInput({ workDeadline: "2026-07-30T00:00:00.000999700Z" }),
    },
    { verifiedAt: "2026-07-30T00:00:00.000999300Z", receivedAt: 10 },
  );
  assert.equal(created.accepted, true);
  assert.equal(
    created.state.objectives.workItems[
      JSON.stringify(["objective-a", "work-item-a"])
    ].workDeadlineAt,
    11,
  );
});

test("local Work commands reject incomplete, accessor and caller-versioned inputs", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce),
  );
  assert.equal(announced.accepted, true);
  const time = {
    verifiedAt: "2026-07-30T00:00:02.000Z",
    receivedAt: 11,
  };
  assert.throws(
    () =>
      evaluateMeshObjectiveWorkCommand(
        announced.state,
        {
          kind: "work.create",
          input: {
            objectiveId: "objective-a",
            workItemId: "incomplete",
          },
        },
        time,
      ),
    /input is invalid/u,
  );
  assert.throws(
    () =>
      evaluateMeshObjectiveWorkCommand(
        announced.state,
        {
          kind: "work.revise",
          expectedWorkItemRevision: 1,
          input: workInput({ workItemRevision: 2 }),
        },
        time,
      ),
    /input is invalid/u,
  );
  let getterInvoked = false;
  const accessorInput = workInput();
  Object.defineProperty(accessorInput, "workDeadline", {
    enumerable: true,
    get() {
      getterInvoked = true;
      return "2026-07-30T01:00:00.000Z";
    },
  });
  assert.throws(
    () =>
      evaluateMeshObjectiveWorkCommand(
        announced.state,
        { kind: "work.create", input: accessorInput },
        time,
      ),
    /input is invalid/u,
  );
  assert.equal(getterInvoked, false);
});

test("stable timer IDs are unambiguous and bounded for maximum protocol IDs", () => {
  function timerIdFor(objectiveId, workItemId) {
    const objectiveEnvelope = structuredClone(announce);
    objectiveEnvelope.objectiveId = objectiveId;
    objectiveEnvelope.payload.objectiveId = objectiveId;
    const acceptedObjective = evaluateVerifiedMeshObjectiveEnvelope(
      runtime(),
      request(objectiveEnvelope),
    );
    assert.equal(acceptedObjective.accepted, true);
    const acceptedWork = evaluateMeshObjectiveWorkCommand(
      acceptedObjective.state,
      {
        kind: "work.create",
        input: workInput({ objectiveId, workItemId }),
      },
      { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 11 },
    );
    assert.equal(acceptedWork.accepted, true);
    return acceptedWork.state.objectives.workItems[
      JSON.stringify([objectiveId, workItemId])
    ].expiryTimerId;
  }

  assert.notEqual(timerIdFor("a:b", "c"), timerIdFor("a", "b:c"));

  const longObjectiveId = "o".repeat(256);
  const longDocumentId = "d".repeat(256);
  const longAnnounce = structuredClone(announce);
  longAnnounce.objectiveId = longObjectiveId;
  longAnnounce.payload.objectiveId = longObjectiveId;
  longAnnounce.payload.objectiveDocumentId = longDocumentId;
  const accepted = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(longAnnounce),
  );
  assert.equal(accepted.accepted, true);
  const objective = accepted.state.objectives.objectives[longObjectiveId];
  assert.match(objective.expiryTimerId, /^objective:256:o{256}:expiry$/u);

  const longWorkItemId = "w".repeat(256);
  const created = evaluateMeshObjectiveWorkCommand(
    accepted.state,
    {
      kind: "work.create",
      input: workInput({
        objectiveId: longObjectiveId,
        workItemId: longWorkItemId,
      }),
    },
    { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 11 },
  );
  assert.equal(created.accepted, true);
  const work =
    created.state.objectives.workItems[
      JSON.stringify([longObjectiveId, longWorkItemId])
    ];
  assert.equal(
    work.expiryTimerId,
    `work:256:${longObjectiveId}:256:${longWorkItemId}:deadline`,
  );
  assert.ok(new TextEncoder().encode(work.expiryTimerId).byteLength < 768);
});

test("accepted snapshots restore strictly and reject forged cross-projection bindings", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce),
  );
  assert.equal(announced.accepted, true);
  const created = evaluateMeshObjectiveWorkCommand(
    announced.state,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 11 },
  );
  assert.equal(created.accepted, true);
  const restored = restoreMeshObjectiveWorkState(
    structuredClone(created.state.objectives),
  );
  assert.equal(Object.isFrozen(restored), true);
  assert.equal(
    Object.isFrozen(
      restored.workItems[JSON.stringify(["objective-a", "work-item-a"])]
        .matchingAttributes,
    ),
    true,
  );

  const forgedOwner = structuredClone(created.state.objectives);
  forgedOwner.workItems[
    JSON.stringify(["objective-a", "work-item-a"])
  ].ownerPeerId = "peer-c";
  assert.throws(
    () => restoreMeshObjectiveWorkState(forgedOwner),
    /Objective binding/u,
  );

  const forgedTimer = structuredClone(created.state.objectives);
  forgedTimer.workItems[
    JSON.stringify(["objective-a", "work-item-a"])
  ].expiryTimerId = "work:ambiguous:timer";
  assert.throws(
    () => restoreMeshObjectiveWorkState(forgedTimer),
    /fields are invalid/u,
  );

  const forgedPolicyObjective = structuredClone(created.state.objectives);
  forgedPolicyObjective.workItems[
    JSON.stringify(["objective-a", "work-item-a"])
  ].objectivePolicy.objectiveId = "objective-b";
  assert.throws(
    () => restoreMeshObjectiveWorkState(forgedPolicyObjective),
    /Objective binding|version is invalid|Objective policy key is invalid/u,
  );

  const forgedPolicyCapability = structuredClone(created.state.objectives);
  forgedPolicyCapability.workItems[
    JSON.stringify(["objective-a", "work-item-a"])
  ].requiredCapabilityKeys = ["translate"];
  assert.throws(
    () => restoreMeshObjectiveWorkState(forgedPolicyCapability),
    /Objective policy binding/u,
  );

  const forgedPolicyBudget = structuredClone(created.state.objectives);
  forgedPolicyBudget.workItems[
    JSON.stringify(["objective-a", "work-item-a"])
  ].budgetReservationUnits = 1001;
  assert.throws(
    () => restoreMeshObjectiveWorkState(forgedPolicyBudget),
    /Objective policy binding/u,
  );

  const forgedPolicyDeadline = structuredClone(created.state.objectives);
  const deadlineWork =
    forgedPolicyDeadline.workItems[
      JSON.stringify(["objective-a", "work-item-a"])
    ];
  deadlineWork.workDeadlineAt = deadlineWork.objectivePolicy.expiresAt + 1;
  assert.throws(
    () => restoreMeshObjectiveWorkState(forgedPolicyDeadline),
    /Objective policy binding/u,
  );

  const duplicatedDocument = structuredClone(announced.state.objectives);
  const original = duplicatedDocument.objectives["objective-a"];
  duplicatedDocument.objectives["objective-b"] = {
    ...structuredClone(original),
    objectiveId: "objective-b",
    expiryTimerId: "objective:11:objective-b:expiry",
  };
  assert.throws(
    () => restoreMeshObjectiveWorkState(duplicatedDocument),
    /binding is not unique/u,
  );
});

test("runtime composition rejects Work and cancellation records crossed between Objectives", () => {
  const first = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce, 10),
  );
  assert.equal(first.accepted, true);
  const announceB = structuredClone(announce);
  announceB.messageId = revise.messageId;
  announceB.payloadHash = revise.payloadHash;
  announceB.objectiveId = "objective-b";
  announceB.payload.objectiveId = "objective-b";
  announceB.payload.objectiveDocumentId = "objective-document-for-b";
  const second = evaluateVerifiedMeshObjectiveEnvelope(
    first.state,
    request(announceB, 11),
  );
  assert.equal(second.accepted, true);
  const created = evaluateMeshObjectiveWorkCommand(
    second.state,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 12 },
  );
  assert.equal(created.accepted, true);

  const workKey = JSON.stringify(["objective-a", "work-item-a"]);
  const work = created.state.objectives.workItems[workKey];
  const objectiveB = created.state.objectives.objectives["objective-b"];
  const objectiveBRecordKey = JSON.stringify([
    "objective.announce",
    objectiveB.objectiveDocumentId,
  ]);
  const crossedWorkCoordination = structuredClone(created.state.coordination);
  crossedWorkCoordination.timers[work.expiryTimerId].domainRecordKey =
    objectiveBRecordKey;
  const restoredCrossedWorkCoordination = restoreMeshCoordinationState(
    crossedWorkCoordination,
  );
  assert.throws(
    () =>
      createMeshObjectiveWorkRuntimeState(
        restoredCrossedWorkCoordination,
        created.state.discovery,
        created.state.objectives,
      ),
    /Work Item deadline timer binding is invalid/u,
  );

  const revised = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce, 10),
  );
  assert.equal(revised.accepted, true);
  const revision = evaluateVerifiedMeshObjectiveEnvelope(
    revised.state,
    request(revise, 11),
  );
  assert.equal(revision.accepted, true);
  const cancelled = evaluateVerifiedMeshObjectiveEnvelope(
    revision.state,
    request(cancel, 12),
  );
  assert.equal(cancelled.accepted, true);
  const fakeCancellationKey = JSON.stringify([
    "objective.cancel",
    "cancellation-cross",
  ]);
  const crossedTerminalState = structuredClone(cancelled.state.objectives);
  crossedTerminalState.objectives["objective-a"].terminalRecordKey =
    fakeCancellationKey;
  assert.throws(
    () => restoreMeshObjectiveWorkState(crossedTerminalState),
    /cancellation binding is invalid/u,
  );
  const crossedTerminalCoordination = structuredClone(
    cancelled.state.coordination,
  );
  const terminalRecordKey =
    cancelled.state.objectives.objectives["objective-a"].terminalRecordKey;
  crossedTerminalCoordination.domainRecords[terminalRecordKey].objectiveId =
    "objective-b";
  const restoredCrossedTerminalCoordination = restoreMeshCoordinationState(
    crossedTerminalCoordination,
  );
  assert.throws(
    () =>
      createMeshObjectiveWorkRuntimeState(
        restoredCrossedTerminalCoordination,
        cancelled.state.discovery,
        cancelled.state.objectives,
      ),
    /cancellation binding is invalid/u,
  );
});

test("restore rejects fabricated or tampered Objective cancellation evidence", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce, 10),
  );
  assert.equal(announced.accepted, true);
  const fabricated = structuredClone(announced.state.objectives);
  fabricated.objectives["objective-a"] = {
    ...fabricated.objectives["objective-a"],
    status: "cancelled",
    expiryTimerId: undefined,
    expiryTimerGeneration: undefined,
    terminalAt: 11,
    terminalRecordKey: JSON.stringify([
      "objective.cancel",
      "fabricated-cancellation",
    ]),
  };
  assert.throws(
    () => restoreMeshObjectiveWorkState(fabricated),
    /cancelled Objective terminal binding is invalid/u,
  );

  const revised = evaluateVerifiedMeshObjectiveEnvelope(
    announced.state,
    request(revise, 11),
  );
  assert.equal(revised.accepted, true);
  const cancelled = evaluateVerifiedMeshObjectiveEnvelope(
    revised.state,
    request(cancel, 12),
  );
  assert.equal(cancelled.accepted, true);
  const tampered = structuredClone(cancelled.state.objectives);
  tampered.objectives[
    "objective-a"
  ].terminalCancellation.envelope.payload.cancellationId =
    "tampered-cancellation";
  assert.throws(
    () => restoreMeshObjectiveWorkState(tampered),
    /cancellation binding|payload digest/u,
  );
});

test("runtime composition rejects crossed domain records for terminal Work history", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce, 10),
  );
  assert.equal(announced.accepted, true);
  const created = evaluateMeshObjectiveWorkCommand(
    announced.state,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 11 },
  );
  assert.equal(created.accepted, true);
  const revised = evaluateVerifiedMeshObjectiveEnvelope(
    created.state,
    request(revise, 12, "2026-07-30T00:00:03.000Z"),
  );
  assert.equal(revised.accepted, true);
  const workKey = JSON.stringify(["objective-a", "work-item-a"]);
  const readyWork = revised.state.objectives.workItems[workKey];
  const workTimer = revised.state.coordination.timers[readyWork.expiryTimerId];

  const cancelled = evaluateMeshObjectiveWorkCommand(
    revised.state,
    {
      kind: "work.cancel",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
    },
    { verifiedAt: "2026-07-30T00:00:04.000Z", receivedAt: 13 },
  );
  assert.equal(cancelled.accepted, true);

  const expired = evaluateMeshObjectiveWorkTimer(
    revised.state,
    {
      kind: "timer.fired",
      timerId: workTimer.timerId,
      generation: workTimer.generation,
    },
    workTimer.dueAt,
  );
  assert.equal(expired.accepted, true);

  const historicalRecordKey = JSON.stringify([
    "objective.announce",
    announce.payload.objectiveDocumentId,
  ]);
  for (const terminalState of [cancelled.state, expired.state]) {
    const jsonRestoredRuntime = createMeshObjectiveWorkRuntimeState(
      restoreMeshCoordinationState(
        JSON.parse(JSON.stringify(terminalState.coordination)),
      ),
      restoreMeshDiscoveryState(
        JSON.parse(JSON.stringify(terminalState.discovery)),
      ),
      restoreMeshObjectiveWorkState(
        JSON.parse(JSON.stringify(terminalState.objectives)),
      ),
    );
    assert.equal(
      jsonRestoredRuntime.objectives.workItems[workKey].status,
      terminalState.objectives.workItems[workKey].status,
    );

    const crossedCoordination = structuredClone(terminalState.coordination);
    crossedCoordination.domainRecords[historicalRecordKey].objectiveId =
      "objective-b";
    const restoredCoordination =
      restoreMeshCoordinationState(crossedCoordination);

    assert.throws(
      () =>
        createMeshObjectiveWorkRuntimeState(
          restoredCoordination,
          terminalState.discovery,
          terminalState.objectives,
        ),
      /Work Item Objective binding is invalid|Objective policy domain record is missing/u,
    );
  }
});

test("oversized local Work projections reject without consuming state", () => {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    runtime(),
    request(announce),
  );
  assert.equal(announced.accepted, true);
  const rejected = evaluateMeshObjectiveWorkCommand(
    announced.state,
    {
      kind: "work.create",
      input: workInput({
        matchingAttributes: { large: "x".repeat(65_536) },
      }),
    },
    { verifiedAt: "2026-07-30T00:00:02.000Z", receivedAt: 11 },
  );
  assert.deepEqual(rejected, {
    accepted: false,
    code: "work_limit_exceeded",
    state: announced.state,
  });
});

test("model-based deterministic traces preserve Objective/Work causal invariants", () => {
  function assertModel(state, model) {
    const objective = state.objectives.objectives["objective-a"];
    assert.equal(objective.status, model.objective.status);
    assert.equal(objective.objectiveRevision, model.objective.revision);
    assert.equal(objective.expiryTimerGeneration, model.objective.generation);
    assert.equal(objective.workItemCount, model.objective.workItemCount);
    assert.equal(
      objective.reservedBudgetUnits,
      model.objective.reservedBudgetUnits,
    );
    assert.equal(state.coordination.lastLogicalTime, model.clock);
    assert.equal(state.discovery.lastLogicalTime, model.clock);
    assert.equal(state.objectives.lastLogicalTime, model.clock);
    const work =
      state.objectives.workItems[
        JSON.stringify(["objective-a", "work-item-a"])
      ];
    if (!model.work) {
      assert.equal(work, undefined);
      return;
    }
    assert.equal(work.status, model.work.status);
    assert.equal(work.workItemRevision, model.work.revision);
    assert.equal(work.expiryTimerGeneration, model.work.generation);
  }

  let state = runtime();
  const model = {
    clock: 0,
    objective: {
      status: "missing",
      revision: 0,
      generation: undefined,
      workItemCount: 0,
      reservedBudgetUnits: 0,
    },
    work: undefined,
  };

  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    state,
    request(announce, 10),
  );
  assert.equal(announced.accepted, true);
  state = announced.state;
  Object.assign(model, {
    clock: 10,
    objective: {
      status: "active",
      revision: 1,
      generation: 1,
      workItemCount: 0,
      reservedBudgetUnits: 0,
    },
  });
  assertModel(state, model);

  const duplicate = evaluateVerifiedMeshObjectiveEnvelope(
    state,
    request(announce, 10),
  );
  assert.deepEqual(duplicate, { accepted: true, duplicate: true, state });
  assertModel(state, model);

  const revised = evaluateVerifiedMeshObjectiveEnvelope(
    state,
    request(revise, 11),
  );
  assert.equal(revised.accepted, true);
  state = revised.state;
  model.clock = 11;
  model.objective.revision = 2;
  model.objective.generation = 2;
  assertModel(state, model);

  const created = evaluateMeshObjectiveWorkCommand(
    state,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 12 },
  );
  assert.equal(created.accepted, true);
  state = created.state;
  model.clock = 12;
  model.objective.workItemCount = 1;
  model.work = { status: "ready", revision: 1, generation: 1 };
  assertModel(state, model);

  const workRevision = evaluateMeshObjectiveWorkCommand(
    state,
    {
      kind: "work.revise",
      expectedWorkItemRevision: 1,
      input: workInput({
        workDeadline: "2026-07-30T02:00:00.000Z",
      }),
    },
    { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 13 },
  );
  assert.equal(workRevision.accepted, true);
  state = workRevision.state;
  model.clock = 13;
  model.work.revision = 2;
  model.work.generation = 2;
  assertModel(state, model);

  const work =
    state.objectives.workItems[JSON.stringify(["objective-a", "work-item-a"])];
  const stale = evaluateMeshObjectiveWorkTimer(
    state,
    { kind: "timer.fired", timerId: work.expiryTimerId, generation: 1 },
    work.workDeadlineAt,
  );
  assert.deepEqual(stale, {
    accepted: false,
    code: "timer_generation_stale",
    state,
  });
  assertModel(state, model);

  const expired = evaluateMeshObjectiveWorkTimer(
    state,
    {
      kind: "timer.fired",
      timerId: work.expiryTimerId,
      generation: work.expiryTimerGeneration,
    },
    work.workDeadlineAt,
  );
  assert.equal(expired.accepted, true);
  state = expired.state;
  model.clock = work.workDeadlineAt;
  model.work.status = "expired";
  model.work.generation = undefined;
  assertModel(state, model);

  const objectiveTimer =
    state.coordination.timers[
      state.objectives.objectives["objective-a"].expiryTimerId
    ];
  const expiredObjective = evaluateMeshObjectiveWorkTimer(
    state,
    {
      kind: "timer.fired",
      timerId: objectiveTimer.timerId,
      generation: objectiveTimer.generation,
    },
    objectiveTimer.dueAt,
  );
  assert.equal(expiredObjective.accepted, true);
  state = expiredObjective.state;
  model.clock = objectiveTimer.dueAt;
  model.objective.status = "expired";
  model.objective.generation = undefined;
  assertModel(state, model);

  // Capacity failure is a separate deterministic trace: it preserves every
  // model field and rejects before it can reserve a second work revision.
  let bounded = runtime({
    coordinationLimits: { maximumJournalEntries: 2 },
  });
  const boundedAnnounce = evaluateVerifiedMeshObjectiveEnvelope(
    bounded,
    request(announce, 10),
  );
  assert.equal(boundedAnnounce.accepted, true);
  bounded = boundedAnnounce.state;
  const boundedCreate = evaluateMeshObjectiveWorkCommand(
    bounded,
    { kind: "work.create", input: workInput() },
    { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 11 },
  );
  assert.equal(boundedCreate.accepted, true);
  bounded = boundedCreate.state;
  const saturated = evaluateMeshObjectiveWorkCommand(
    bounded,
    {
      kind: "work.revise",
      expectedWorkItemRevision: 1,
      input: workInput(),
    },
    { verifiedAt: "2026-07-30T00:00:01.000Z", receivedAt: 12 },
  );
  assert.deepEqual(saturated, {
    accepted: false,
    code: "journal_capacity_exceeded",
    state: bounded,
  });
  assert.equal(
    bounded.objectives.workItems[JSON.stringify(["objective-a", "work-item-a"])]
      .workItemRevision,
    1,
  );
});
