import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryTeamExecutionArtifactPortV1,
  InMemoryTeamExecutionStoreV1,
  TeamExecutionRuntimeV1,
  createTeamExecutionPolicyV1,
  createTeamExecutionScopeV1,
  createTeamExecutionStartRequestV1,
  createTeamExecutionStepCommandV1,
} from "@agentplat/collective-runtime/team-execution";
import {
  createJointWorkContractV1,
  createTeamFormationScopeV1,
  createTeamMemberContractBindingV1,
  createTeamMemberSelectionV1,
  createTeamPositionV1,
  createTeamProposalV1,
} from "@agentplat/collective-runtime/team-formation";
import {
  InMemoryTeamExecutionContinuityAuthorityPortV1,
  InMemoryTeamExecutionContinuityAvailabilityPortV1,
  InMemoryTeamExecutionContinuityCheckpointRepositoryV1,
  InMemoryTeamExecutionContinuityMembershipPortV1,
  InMemoryTeamExecutionContinuityStoreV1,
  TeamExecutionContinuityRuntimeV1,
  createTeamExecutionContinuityAvailabilityCertificateV1,
  createTeamExecutionContinuityCheckpointV1,
  createTeamExecutionContinuityStateV1,
  createTeamExecutionWorkOwnerAuthorityV1,
} from "@agentplat/collective-runtime/team-execution-continuity";

const digest = (label) => digestPlanningJsonV1("team-candidate", { label });

function setup() {
  const formationScope = createTeamFormationScopeV1({
    tenantId: "tenant",
    meshId: "mesh",
    policyDomainId: "policy-domain",
    missionIntentId: "mission",
    objectiveId: "objective",
    rootWorkItemId: "work.root",
    rootWorkItemRevision: 1,
  });
  const position = createTeamPositionV1({
    schemaVersion: 1,
    positionId: "position.one",
    workItemId: "work.one",
    workItemRevision: 1,
    roleKey: "worker",
    requiredCapabilityKeys: ["worker"],
    completionCriteria: ["reference-published"],
    dependsOnPositionIds: [],
    budgetUnits: 10,
    maximumActionBudgetUnits: 5,
  });
  const formationRequestDigest = digest("formation-request");
  const teamId = `team.${digestPlanningJsonV1("team-identity", {
    scopeDigest: formationScope.scopeDigest,
    formationRequestDigest,
  }).slice(7)}`;
  const member = createTeamMemberSelectionV1({
    schemaVersion: 1,
    teamId,
    teamEpoch: 1,
    positionId: position.positionId,
    positionDigest: position.positionDigest,
    candidateId: "candidate.one",
    candidateDigest: digest("candidate"),
    peerId: "peer.member",
    instanceId: "instance.member",
    independenceGroupId: "group.one",
    bidId: "bid.one",
    bidDigest: digest("bid"),
    sourceBidDigest: digest("source-bid"),
    budgetUnits: 10,
    expectedCompletionAtLogicalMs: 100,
    locallyEvaluatedScoreMicros: 900_000,
  });
  const proposal = createTeamProposalV1({
    schemaVersion: 1,
    teamId,
    teamEpoch: 1,
    scope: formationScope,
    policyDigest: digest("formation-policy"),
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership"),
    formationRequestDigest,
    predecessorJointWorkContractDigest: null,
    positions: [position],
    members: [member],
    totalBudgetUnits: 10,
    expectedCompletionAtLogicalMs: 100,
    proposedAtLogicalMs: 1,
    validUntilLogicalMs: 500,
  });
  const binding = createTeamMemberContractBindingV1({
    schemaVersion: 1,
    memberId: member.memberId,
    selectionDigest: member.selectionDigest,
    positionId: position.positionId,
    peerId: member.peerId,
    instanceId: member.instanceId,
    workItemId: position.workItemId,
    workItemRevision: position.workItemRevision,
    workContractId: "work-contract.one",
    workContractGeneration: 1,
    workContractDigest: digest("work-contract"),
    assignmentAuthorityId: "authority.one",
    assignmentEpoch: 1,
    authorityGeneration: 1,
    fencingToken: "fence.one",
    leaseExpiresAtLogicalMs: 500,
    workDeadline: "2030-01-01T00:00:00.000Z",
    roleKey: position.roleKey,
    requiredCapabilityKeys: position.requiredCapabilityKeys,
    reservedBudgetUnits: 10,
    maximumActionBudgetUnits: 5,
  });
  const joint = createJointWorkContractV1({
    proposal,
    memberContracts: [binding],
    activatedAtLogicalMs: 1,
  });
  const policy = createTeamExecutionPolicyV1({
    schemaVersion: 1,
    policyId: "execution-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
    requireReferencedCompletionArtifact: true,
    requireAllowedControlForProgress: true,
    limits: {
      maximumPositions: 4,
      maximumStepsPerPosition: 4,
      maximumArtifactsPerStep: 4,
      maximumArtifactsPerPosition: 4,
      maximumArtifactDependencies: 4,
      maximumArtifactBytes: 1_024,
      maximumPeerMessagesPerStep: 4,
      maximumTotalPeerMessages: 8,
      maximumRecoveryCount: 2,
      maximumHistoryEntries: 4,
      maximumExecutionDurationMs: 400,
      maximumStepTtlMs: 100,
      maximumCommitAttempts: 4,
    },
  });
  const execution = (stateKey) =>
    new TeamExecutionRuntimeV1({
      stateKey,
      runtimeId: "execution-runtime",
      runtimeVersion: 1,
      implementationId: "execution-runtime.default",
      policy,
      executor: {
        executorId: "executor",
        executorVersion: 1,
        implementationId: "executor.default",
        execute: async () => {
          throw new Error("not needed for prepare/takeover coverage");
        },
      },
      artifacts: new InMemoryTeamExecutionArtifactPortV1(),
      store: new InMemoryTeamExecutionStoreV1(),
    });
  return {
    proposal,
    joint,
    policy,
    position,
    scope: createTeamExecutionScopeV1({ proposal }),
    execution,
  };
}

function owner(
  generation,
  resumeCheckpointDigest = null,
  peerId = `peer.owner.${generation}`,
  membershipEpoch = 1,
  membershipConfigurationDigest = digest("membership"),
) {
  return createTeamExecutionWorkOwnerAuthorityV1({
    schemaVersion: 1,
    tenantId: "tenant",
    meshId: "mesh",
    objectiveId: "objective",
    rootWorkItemId: "work.root",
    generation,
    holder: {
      schemaVersion: 1,
      peerId,
      instanceId: `${peerId}.instance`,
      keyId: `${peerId}.key`,
    },
    headDigest: digest(`owner-head.${generation}`),
    fencingToken: `owner-fence.${generation}`,
    membershipEpoch,
    membershipConfigurationDigest,
    resumeCheckpointDigest,
    validUntilLogicalMs: 500,
  });
}

// Test-only harness. The second currentness check occurs immediately before
// delegation, so an authority transition cannot reach the underlying mutation.
function testFencedExecutionPort({
  execution,
  authority,
  membership,
  scope,
  localHolder,
  beforeOperation,
  afterOperation,
}) {
  const sameHolder = (left, right) =>
    left.peerId === right.peerId &&
    left.instanceId === right.instanceId &&
    left.keyId === right.keyId;
  const sameAuthority = (left, right) =>
    left.tenantId === right.tenantId &&
    left.meshId === right.meshId &&
    left.objectiveId === right.objectiveId &&
    left.rootWorkItemId === right.rootWorkItemId &&
    left.generation === right.generation &&
    left.headDigest === right.headDigest &&
    left.fencingToken === right.fencingToken &&
    left.membershipEpoch === right.membershipEpoch &&
    left.membershipConfigurationDigest ===
      right.membershipConfigurationDigest &&
    left.resumeCheckpointDigest === right.resumeCheckpointDigest &&
    sameHolder(left.holder, right.holder);
  const assertCurrent = async (expected, logicalTimeMs) => {
    const decision = await authority.current({ scope, logicalTimeMs });
    if (
      !decision ||
      decision.current !== true ||
      decision.reasonCode !== "current"
    )
      throw new TypeError("test fenced execution authority is unavailable");
    if (
      !sameAuthority(decision.authority, expected) ||
      !sameHolder(decision.authority.holder, localHolder)
    )
      throw new TypeError("test fenced execution authority changed");
    const membershipDecision = await membership.current({
      scope,
      membershipEpoch: expected.membershipEpoch,
      membershipConfigurationDigest: expected.membershipConfigurationDigest,
      logicalTimeMs,
    });
    if (!membershipDecision || membershipDecision.current !== true)
      throw new TypeError("test fenced execution membership is stale");
  };
  const fenced = async (operationName, expected, logicalTimeMs, action) => {
    await assertCurrent(expected, logicalTimeMs);
    await beforeOperation?.({
      operationName,
      authority: expected,
      logicalTimeMs,
    });
    await assertCurrent(expected, logicalTimeMs);
    const result = await action();
    await assertCurrent(expected, logicalTimeMs);
    await afterOperation?.({
      operationName,
      authority: expected,
      logicalTimeMs,
      result,
    });
    return result;
  };
  return {
    runtimeId: execution.runtimeId,
    runtimeVersion: execution.runtimeVersion,
    implementationId: execution.implementationId,
    policyId: execution.policyId,
    policyVersion: execution.policyVersion,
    policyDigest: execution.policyDigest,
    start: ({ request, authority: expected }) =>
      fenced("start", expected, request.logicalTimeMs, () =>
        execution.start(request),
      ),
    prepareStep: ({ command, authority: expected }) =>
      fenced("prepareStep", expected, command.logicalTimeMs, () =>
        execution.prepareStep(command),
      ),
    settleStep: ({ result, authority: expected }) =>
      fenced("settleStep", expected, result.completedAtLogicalMs, () =>
        execution.settleStep(result),
      ),
    runStep: ({ request, authority: expected }) =>
      fenced("runStep", expected, request.command.logicalTimeMs, () =>
        execution.runStep(request),
      ),
    expireStep: ({ request, authority: expected }) =>
      fenced("expireStep", expected, request.logicalTimeMs, () =>
        execution.expireStep(request),
      ),
    rebind: ({ request, authority: expected }) =>
      fenced("rebind", expected, request.logicalTimeMs, () =>
        execution.rebind(request),
      ),
    cancel: ({ request, authority: expected }) =>
      fenced("cancel", expected, request.logicalTimeMs, () =>
        execution.cancel(request),
      ),
    loadState: () => execution.loadState(),
    exportHandoff: ({ targetStateKey, logicalTimeMs, authority: expected }) =>
      fenced("exportHandoff", expected, logicalTimeMs, () =>
        execution.exportHandoff({ targetStateKey, logicalTimeMs }),
      ),
    importHandoff: ({ handoff, logicalTimeMs, authority: expected }) =>
      fenced("importHandoff", expected, logicalTimeMs, () =>
        execution.importHandoff({ handoff, logicalTimeMs }),
      ),
  };
}

test("certified checkpoint imports the pending dispatch unchanged and fails closed", async (t) => {
  const fixture = setup();
  const authority = new InMemoryTeamExecutionContinuityAuthorityPortV1();
  const ownerOne = owner(1);
  const ownerTwoHolder = owner(2).holder;
  const sourceContinuityStore = new InMemoryTeamExecutionContinuityStoreV1({
    authority,
    scope: fixture.scope,
    localHolder: ownerOne.holder,
  });
  const successorContinuityBacking = new InMemoryTeamExecutionContinuityStoreV1(
    { authority, scope: fixture.scope, localHolder: ownerTwoHolder },
  );
  let crashAfterTakeoverSave = true;
  const successorContinuityStore = {
    load: (stateKey) => successorContinuityBacking.load(stateKey),
    async save(input) {
      const saved = await successorContinuityBacking.save(input);
      if (
        saved &&
        input.state.authority?.generation === 2 &&
        crashAfterTakeoverSave
      ) {
        crashAfterTakeoverSave = false;
        throw new Error("simulated_crash_after_continuity_save");
      }
      return saved;
    },
  };
  const forkContinuityStore = new InMemoryTeamExecutionContinuityStoreV1({
    authority,
    scope: fixture.scope,
    localHolder: ownerOne.holder,
  });
  const checkpoints =
    new InMemoryTeamExecutionContinuityCheckpointRepositoryV1();
  const availability = new InMemoryTeamExecutionContinuityAvailabilityPortV1();
  const membership = new InMemoryTeamExecutionContinuityMembershipPortV1({
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership"),
  });
  const sourceExecution = fixture.execution("execution-source");
  const targetExecution = fixture.execution("execution-target");
  const options = (
    execution,
    store,
    localAuthority,
    stateKey = "continuity",
    hooks = {},
  ) => ({
    stateKey,
    scope: fixture.scope,
    localHolder: localAuthority.holder,
    executionPolicy: fixture.policy,
    execution: testFencedExecutionPort({
      execution,
      authority,
      membership,
      scope: fixture.scope,
      localHolder: localAuthority.holder,
      ...hooks,
    }),
    authority,
    membership,
    checkpoints,
    availability,
    store,
  });

  authority.setCurrent(ownerOne);
  const source = new TeamExecutionContinuityRuntimeV1(
    options(sourceExecution, sourceContinuityStore, ownerOne),
  );
  await source.initialize({ logicalTimeMs: 1 });
  const started = await source.start(
    createTeamExecutionStartRequestV1({
      schemaVersion: 1,
      requestId: "start.one",
      proposal: fixture.proposal,
      jointWorkContract: fixture.joint,
      logicalTimeMs: 10,
      validUntilLogicalMs: 400,
    }),
  );
  const dispatch = await source.prepareStep(
    createTeamExecutionStepCommandV1({
      schemaVersion: 1,
      commandId: "command.one",
      executionId: started.executionId,
      executionEpoch: started.executionEpoch,
      positionId: fixture.position.positionId,
      inputReferenceDigest: digest("input"),
      logicalTimeMs: 20,
      validUntilLogicalMs: 40,
    }),
  );
  const checkpoint = await source.checkpoint({
    checkpointId: "checkpoint.main",
    targetStateKey: "execution-target",
    logicalTimeMs: 30,
  });
  await t.test(
    "checkpoint validation binds membership and certification to live authority",
    () => {
      const { checkpointDigest: _checkpointDigest, ...checkpointBody } =
        checkpoint;
      assert.throws(
        () =>
          createTeamExecutionContinuityCheckpointV1({
            ...checkpointBody,
            membershipEpoch: checkpoint.membershipEpoch + 1,
          }),
        /membership binding/u,
      );
      assert.throws(
        () =>
          createTeamExecutionContinuityCheckpointV1({
            ...checkpointBody,
            authority: createTeamExecutionWorkOwnerAuthorityV1({
              ...checkpoint.authority,
              validUntilLogicalMs: checkpoint.createdAtLogicalMs,
            }),
          }),
        /authority is expired/u,
      );
      const availabilityBody = {
        schemaVersion: 1,
        checkpointDigest: checkpoint.availability.checkpointDigest,
        availableReplicaIds: checkpoint.availability.availableReplicaIds,
        threshold: checkpoint.availability.threshold,
        certifiedAtLogicalMs: checkpoint.createdAtLogicalMs + 1,
      };
      const availability =
        createTeamExecutionContinuityAvailabilityCertificateV1({
          ...availabilityBody,
          certificateDigest: digestPlanningJsonV1(
            "team-execution-continuity-availability",
            availabilityBody,
          ),
        });
      assert.throws(
        () =>
          createTeamExecutionContinuityCheckpointV1({
            ...checkpointBody,
            availability,
          }),
        /availability time binding/u,
      );
    },
  );
  const idempotentCheckpoint = await source.checkpoint({
    checkpointId: "checkpoint.same-state",
    targetStateKey: "execution-target",
    logicalTimeMs: 31,
  });
  assert.equal(
    idempotentCheckpoint.checkpointDigest,
    checkpoint.checkpointDigest,
  );
  assert.equal(await checkpoints.getById("checkpoint.same-state"), null);
  await assert.rejects(
    source.checkpoint({
      checkpointId: "checkpoint.main",
      targetStateKey: "execution-other",
      logicalTimeMs: 31,
    }),
    /checkpoint id conflict/u,
  );
  await assert.rejects(
    source.checkpoint({
      checkpointId: "checkpoint.different-target",
      targetStateKey: "execution-other",
      logicalTimeMs: 31,
    }),
    /checkpoint revision conflict/u,
  );
  assert.equal(await checkpoints.getById("checkpoint.different-target"), null);
  membership.setCurrent({
    membershipEpoch: 2,
    membershipConfigurationDigest: digest("membership.next"),
  });
  await assert.rejects(
    source.checkpoint({
      checkpointId: "checkpoint.stale-membership",
      targetStateKey: "execution-target",
      logicalTimeMs: 31,
    }),
    /membership is stale/u,
  );
  membership.setCurrent({
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership"),
  });

  const forkRuntime = new TeamExecutionContinuityRuntimeV1(
    options(sourceExecution, forkContinuityStore, ownerOne, "continuity-fork"),
  );
  await forkRuntime.initialize({ logicalTimeMs: 31 });
  const fork = await forkRuntime.checkpoint({
    checkpointId: "checkpoint.fork",
    targetStateKey: "execution-target",
    logicalTimeMs: 32,
  });

  const ownerTwo = owner(2, checkpoint.checkpointDigest);
  const successor = new TeamExecutionContinuityRuntimeV1(
    options(targetExecution, successorContinuityStore, ownerTwo),
  );
  assert.equal((await successor.loadState()).authority, null);
  await assert.rejects(
    successor.takeover({
      checkpointDigest: checkpoint.checkpointDigest,
      logicalTimeMs: 35,
    }),
    /authority holder is invalid/u,
  );

  authority.setCurrent(ownerTwo);
  await assert.rejects(
    successor.initialize({ logicalTimeMs: 40 }),
    /takeover is required/u,
  );
  await assert.rejects(
    successor.takeover({
      checkpointDigest: fork.checkpointDigest,
      logicalTimeMs: 40,
    }),
    /not authorized for resume/u,
  );

  await t.test(
    "takeover revalidates membership after import before saving continuity",
    async () => {
      const membershipRacingSuccessor = new TeamExecutionContinuityRuntimeV1(
        options(
          targetExecution,
          successorContinuityBacking,
          ownerTwo,
          "continuity",
          {
            afterOperation: async ({ operationName }) => {
              if (operationName === "importHandoff") {
                membership.setCurrent({
                  membershipEpoch: 2,
                  membershipConfigurationDigest: digest("membership.next"),
                });
              }
            },
          },
        ),
      );
      await assert.rejects(
        membershipRacingSuccessor.takeover({
          checkpointDigest: checkpoint.checkpointDigest,
          logicalTimeMs: 40,
        }),
        /membership is stale/u,
      );
      assert.equal(await successorContinuityBacking.load("continuity"), null);
      membership.setCurrent({
        membershipEpoch: 1,
        membershipConfigurationDigest: digest("membership"),
      });
    },
  );

  await assert.rejects(
    successor.takeover({
      checkpointDigest: checkpoint.checkpointDigest,
      logicalTimeMs: 40,
    }),
    /simulated_crash_after_continuity_save/u,
  );
  const takeover = await successor.takeover({
    checkpointDigest: checkpoint.checkpointDigest,
    logicalTimeMs: 40,
  });
  assert.deepEqual(
    takeover.pendingDispatches.map((value) => value.dispatchId),
    [dispatch.dispatchId],
  );
  assert.equal(
    takeover.execution.execution.steps[0].dispatch.dispatchId,
    dispatch.dispatchId,
  );

  await t.test(
    "confirmed takeover remains idempotent after the imported execution advances",
    async () => {
      const advanced = await successor.cancel({
        reasonCode: "operator_cancelled",
        logicalTimeMs: 41,
      });
      assert.equal(advanced.status, "cancelled");
      const replayedTakeover = await successor.takeover({
        checkpointDigest: checkpoint.checkpointDigest,
        logicalTimeMs: 41,
      });
      assert.equal(
        replayedTakeover.execution.execution.recordDigest,
        advanced.recordDigest,
      );
      assert.equal(
        replayedTakeover.execution.revision >
          checkpoint.handoff.sourceState.revision + 1,
        true,
      );
      assert.deepEqual(replayedTakeover.pendingDispatches, []);
    },
  );

  authority.setCurrent(owner(3, fork.checkpointDigest, ownerTwo.holder.peerId));
  await assert.rejects(
    successor.takeover({
      checkpointDigest: fork.checkpointDigest,
      logicalTimeMs: 42,
    }),
    /checkpoint fork detected/u,
  );
  authority.setCurrent(ownerTwo);
});

test("continuity binds bootstrap to the exact local holder, scope, and state key", async () => {
  const fixture = setup();
  const currentOwner = owner(1);
  const authority = new InMemoryTeamExecutionContinuityAuthorityPortV1();
  authority.setCurrent(currentOwner);
  const membership = new InMemoryTeamExecutionContinuityMembershipPortV1({
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership"),
  });
  const checkpoints =
    new InMemoryTeamExecutionContinuityCheckpointRepositoryV1();
  const availability = new InMemoryTeamExecutionContinuityAvailabilityPortV1();
  const rawExecution = fixture.execution("execution-binding");
  const wrongHolder = owner(1, null, "peer.not-owner").holder;
  const wrongHolderRuntime = new TeamExecutionContinuityRuntimeV1({
    stateKey: "continuity-binding",
    scope: fixture.scope,
    localHolder: wrongHolder,
    executionPolicy: fixture.policy,
    execution: testFencedExecutionPort({
      execution: rawExecution,
      authority,
      membership,
      scope: fixture.scope,
      localHolder: wrongHolder,
    }),
    authority,
    membership,
    checkpoints,
    availability,
    store: new InMemoryTeamExecutionContinuityStoreV1({
      authority,
      scope: fixture.scope,
      localHolder: wrongHolder,
    }),
  });
  await assert.rejects(
    wrongHolderRuntime.initialize({ logicalTimeMs: 1 }),
    /authority holder is invalid/u,
  );

  const crossScopeOwner = createTeamExecutionWorkOwnerAuthorityV1({
    ...currentOwner,
    tenantId: "other-tenant",
  });
  const crossScopeAuthority = {
    current: async () => ({
      current: true,
      reasonCode: "current",
      authority: crossScopeOwner,
    }),
  };
  const crossScopeRuntime = new TeamExecutionContinuityRuntimeV1({
    stateKey: "continuity-binding",
    scope: fixture.scope,
    localHolder: currentOwner.holder,
    executionPolicy: fixture.policy,
    execution: testFencedExecutionPort({
      execution: rawExecution,
      authority: crossScopeAuthority,
      membership,
      scope: fixture.scope,
      localHolder: currentOwner.holder,
    }),
    authority: crossScopeAuthority,
    membership,
    checkpoints,
    availability,
    store: new InMemoryTeamExecutionContinuityStoreV1({
      authority: crossScopeAuthority,
      scope: fixture.scope,
      localHolder: currentOwner.holder,
    }),
  });
  await assert.rejects(
    crossScopeRuntime.initialize({ logicalTimeMs: 1 }),
    /authority scope is invalid/u,
  );

  const wrongKeyState = createTeamExecutionContinuityStateV1({
    stateKey: "continuity.other",
    scope: fixture.scope,
    revision: 0,
    logicalTimeHighWaterMs: 0,
    authority: null,
    checkpointHeadDigest: null,
    predecessorStateDigest: null,
  });
  const wrongKeyRuntime = new TeamExecutionContinuityRuntimeV1({
    stateKey: "continuity-binding",
    scope: fixture.scope,
    localHolder: currentOwner.holder,
    executionPolicy: fixture.policy,
    execution: testFencedExecutionPort({
      execution: rawExecution,
      authority,
      membership,
      scope: fixture.scope,
      localHolder: currentOwner.holder,
    }),
    authority,
    membership,
    checkpoints,
    availability,
    store: { load: async () => wrongKeyState, save: async () => false },
  });
  await assert.rejects(
    wrongKeyRuntime.loadState(),
    /state binding is invalid/u,
  );
});

test("the fence-aware test port does not persist after authority replacement", async () => {
  const fixture = setup();
  const authority = new InMemoryTeamExecutionContinuityAuthorityPortV1();
  const currentOwner = owner(1);
  authority.setCurrent(currentOwner);
  let persistedMutations = 0;
  const rawExecution = {
    runtimeId: "execution-runtime",
    runtimeVersion: 1,
    implementationId: "execution-runtime.default",
    policyId: fixture.policy.policy.policyId,
    policyVersion: fixture.policy.policy.policyVersion,
    policyDigest: fixture.policy.policyDigest,
    async cancel() {
      persistedMutations += 1;
      return {};
    },
  };
  const membership = new InMemoryTeamExecutionContinuityMembershipPortV1({
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership"),
  });
  const fenced = testFencedExecutionPort({
    execution: rawExecution,
    authority,
    membership,
    scope: fixture.scope,
    localHolder: currentOwner.holder,
    beforeOperation: async () => authority.setCurrent(owner(2)),
  });
  await assert.rejects(
    fenced.cancel({
      request: { reasonCode: "cancel", logicalTimeMs: 10 },
      authority: currentOwner,
    }),
    /authority (?:is unavailable|changed)/u,
  );
  assert.equal(persistedMutations, 0);
});

test("the continuity CAS rolls back when authority changes during save", async () => {
  const fixture = setup();
  const firstOwner = owner(1);
  const replacement = owner(2, null, firstOwner.holder.peerId);
  let reads = 0;
  const changingAuthority = {
    async current() {
      reads += 1;
      return {
        current: true,
        reasonCode: "current",
        authority: reads === 1 ? firstOwner : replacement,
      };
    },
  };
  const store = new InMemoryTeamExecutionContinuityStoreV1({
    authority: changingAuthority,
    scope: fixture.scope,
    localHolder: firstOwner.holder,
  });
  const state = createTeamExecutionContinuityStateV1({
    stateKey: "continuity-fenced-save",
    scope: fixture.scope,
    revision: 1,
    logicalTimeHighWaterMs: 10,
    authority: firstOwner,
    checkpointHeadDigest: null,
    predecessorStateDigest: null,
  });
  await assert.rejects(
    store.save({
      state,
      expectedRevision: null,
      authority: firstOwner,
      logicalTimeMs: 10,
    }),
    /authority changed/u,
  );
  assert.equal(await store.load("continuity-fenced-save"), null);
});

test("checkpoint validates the execution handoff canonically before certification", async () => {
  const fixture = setup();
  const authority = new InMemoryTeamExecutionContinuityAuthorityPortV1();
  const currentOwner = owner(1);
  authority.setCurrent(currentOwner);
  const membership = new InMemoryTeamExecutionContinuityMembershipPortV1({
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership"),
  });
  const rawExecution = fixture.execution("execution-tampered");
  const baseFenced = testFencedExecutionPort({
    execution: rawExecution,
    authority,
    membership,
    scope: fixture.scope,
    localHolder: currentOwner.holder,
  });
  const tamperedExecution = new Proxy(baseFenced, {
    get(target, property) {
      if (property === "exportHandoff")
        return async (input) => {
          const handoff = await target.exportHandoff(input);
          return {
            ...handoff,
            sourceState: {
              ...handoff.sourceState,
              stateDigest: digest("tampered-state"),
            },
          };
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  let certifications = 0;
  const baseAvailability =
    new InMemoryTeamExecutionContinuityAvailabilityPortV1();
  const availability = {
    async certify(input) {
      certifications += 1;
      return baseAvailability.certify(input);
    },
    verify: (input) => baseAvailability.verify(input),
  };
  const runtime = new TeamExecutionContinuityRuntimeV1({
    stateKey: "continuity-tampered",
    scope: fixture.scope,
    localHolder: currentOwner.holder,
    executionPolicy: fixture.policy,
    execution: tamperedExecution,
    authority,
    membership,
    checkpoints: new InMemoryTeamExecutionContinuityCheckpointRepositoryV1(),
    availability,
    store: new InMemoryTeamExecutionContinuityStoreV1({
      authority,
      scope: fixture.scope,
      localHolder: currentOwner.holder,
    }),
  });
  await runtime.initialize({ logicalTimeMs: 1 });
  await assert.rejects(
    runtime.checkpoint({
      checkpointId: "checkpoint.tampered",
      targetStateKey: "execution-target",
      logicalTimeMs: 2,
    }),
    /handoff|state (?:binding|digest)/u,
  );
  assert.equal(certifications, 0);
});
