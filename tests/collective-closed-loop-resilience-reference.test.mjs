import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCollectiveClosedLoopFaultPlanV1,
  createCollectiveClosedLoopResilienceDefinitionV1,
  createCollectiveClosedLoopResilienceReferenceScenarioV1,
  createCollectiveClosedLoopReferenceRuntimeV1,
  runAdaptiveCollectiveClosedLoopResilienceV1,
  runCollectiveClosedLoopFaultMatrixPortV1,
} from '@agentplat/mesh-sim';

const FAULT_IDS = [
  '01-capability-withdrawal',
  '02-assignment-decline',
  '03-peer-crash',
  '04-peer-restart',
  '05-network-partition',
  '06-network-heal',
];

test('resilience reference construction is deterministic and binds the recovered effect authority', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(4);
  const first = await createCollectiveClosedLoopResilienceReferenceScenarioV1({
    runner: 'adaptive_collective',
    peerCount: 4,
    runtime,
  });
  const replay = await createCollectiveClosedLoopResilienceReferenceScenarioV1({
    runner: 'adaptive_collective',
    peerCount: 4,
    runtime,
  });

  assert.equal(
    first.definition.resilienceDefinitionDigest,
    replay.definition.resilienceDefinitionDigest
  );
  assert.equal(
    first.definition.nominalDefinition.definitionDigest,
    replay.definition.nominalDefinition.definitionDigest
  );
  assert.equal(first.replacementPeerId, replay.replacementPeerId);
  assert.deepEqual(
    first.definition.faultPlan.faults.map((fault) => fault.faultId),
    FAULT_IDS
  );
  assert.deepEqual(
    first.definition.faultPlan.faults.map(
      (fault) => fault.trigger.logicalTimeMs
    ),
    [...first.definition.faultPlan.faults]
      .sort((left, right) => left.faultId.localeCompare(right.faultId))
      .map((fault) => fault.trigger.logicalTimeMs)
  );
  const faults = first.definition.faultPlan.faults;
  assert.deepEqual(faults[3].causalPredecessorFaultIds, ['03-peer-crash']);
  assert.deepEqual(faults[5].causalPredecessorFaultIds, [
    '05-network-partition',
  ]);

  const firstMatrix = await runCollectiveClosedLoopFaultMatrixPortV1(
    first.faultMatrix
  );
  const replayMatrix = await runCollectiveClosedLoopFaultMatrixPortV1(
    replay.faultMatrix
  );
  assert.deepEqual(
    firstMatrix.records.map((record) => record.faultId),
    FAULT_IDS
  );
  assert.equal(
    firstMatrix.records.every((record) => record.observed),
    true
  );
  assert.equal(firstMatrix.matrixDigest, replayMatrix.matrixDigest);

  const executed = await runAdaptiveCollectiveClosedLoopResilienceV1(first);
  assert.equal(executed.action.receipt?.status, 'committed');
  assert.equal(executed.finalized.workContract.assignment.assignmentEpoch, 2);
  assert.ok(
    Date.parse(executed.action.authorizedAt) >=
      Date.parse(executed.recovery.leaseStartsAt)
  );
  assert.ok(
    Date.parse(executed.action.authorizedAt) <
      Date.parse(executed.recovery.execution.leaseExpiresAt)
  );
  assert.equal(
    executed.finalized.workContract.assignment.assignedPeerId,
    first.replacementPeerId
  );
  const staleEvent = executed.trace.events.find(
    (event) =>
      event.kind === 'mesh.message.rejected' &&
      event.reasonCode === 'execution_authority_invalid'
  );
  assert.ok(staleEvent);
  assert.equal(staleEvent.status, 'rejected');
  assert.equal(staleEvent.stateDigestBefore, staleEvent.stateDigestAfter);
  assert.equal(
    executed.resilience.staleResultRejections[0].rejectionEventDigest,
    staleEvent.eventDigest
  );
  assert.equal(staleEvent.faultBinding?.scheduleId, '04-peer-restart');
});

test('adaptive and centralized reference factories share mission, peers and fault schedule', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(4);
  const [adaptive, centralized] = await Promise.all([
    createCollectiveClosedLoopResilienceReferenceScenarioV1({
      runner: 'adaptive_collective',
      peerCount: 4,
      runtime,
    }),
    createCollectiveClosedLoopResilienceReferenceScenarioV1({
      runner: 'centralized_planner',
      peerCount: 4,
      runtime,
    }),
  ]);
  const adaptiveNominal = adaptive.definition.nominalDefinition;
  const centralizedNominal = centralized.definition.nominalDefinition;

  assert.equal(
    adaptiveNominal.missionIntent.intentDigest,
    centralizedNominal.missionIntent.intentDigest
  );
  assert.deepEqual(adaptiveNominal.peers, centralizedNominal.peers);
  assert.deepEqual(
    adaptive.definition.faultPlan.faults.map(
      ({
        faultId,
        family,
        trigger,
        targets,
        links,
        causalPredecessorFaultIds,
      }) => ({
        faultId,
        family,
        trigger,
        targets,
        links,
        causalPredecessorFaultIds,
      })
    ),
    centralized.definition.faultPlan.faults.map(
      ({
        faultId,
        family,
        trigger,
        targets,
        links,
        causalPredecessorFaultIds,
      }) => ({
        faultId,
        family,
        trigger,
        targets,
        links,
        causalPredecessorFaultIds,
      })
    )
  );
  assert.equal(
    adaptive.definition.nominalDefinition.registration.seed,
    centralized.definition.nominalDefinition.registration.seed
  );
  assert.equal(adaptive.replacementPeerId, centralized.replacementPeerId);
  assert.equal(
    adaptive.decisionPolicy.policyDigest,
    centralized.decisionPolicy.policyDigest
  );
});

test('a trace-event fault trigger must resolve to an earlier retained event', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(3);
  const input = await createCollectiveClosedLoopResilienceReferenceScenarioV1({
    runner: 'adaptive_collective',
    peerCount: 3,
    runtime,
  });
  const nominal = input.definition.nominalDefinition;
  const [firstFault, ...remainingFaults] = input.definition.faultPlan.faults;
  assert.ok(firstFault);
  const faultPlan = createCollectiveClosedLoopFaultPlanV1({
    schemaVersion: 1,
    nominalDefinitionDigest: nominal.definitionDigest,
    faults: [
      {
        ...firstFault,
        trigger: {
          schemaVersion: 1,
          kind: 'trace_event',
          logicalTimeMs: firstFault.trigger.logicalTimeMs,
          causalEventDigest: `sha256:${'f'.repeat(64)}`,
        },
      },
      ...remainingFaults,
    ],
  });
  const definition = createCollectiveClosedLoopResilienceDefinitionV1({
    schemaVersion: 1,
    nominalDefinition: nominal,
    faultPlan,
    maximumEpochs: input.definition.maximumEpochs,
  });
  await assert.rejects(
    runAdaptiveCollectiveClosedLoopResilienceV1(
      Object.freeze({ ...input, definition })
    ),
    /closed_loop_fault_causal_event_missing:01-capability-withdrawal/u
  );
});

test('registered matrix ports fail closed for foreign mission roots and plan substitutions', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(3);
  const foreignRuntime = await createCollectiveClosedLoopReferenceRuntimeV1(3);
  const [input, foreign] = await Promise.all([
    createCollectiveClosedLoopResilienceReferenceScenarioV1({
      runner: 'adaptive_collective',
      peerCount: 3,
      runtime,
    }),
    createCollectiveClosedLoopResilienceReferenceScenarioV1({
      runner: 'adaptive_collective',
      peerCount: 3,
      runtime: foreignRuntime,
    }),
  ]);
  await assert.rejects(
    runAdaptiveCollectiveClosedLoopResilienceV1(
      Object.freeze({ ...input, faultMatrix: foreign.faultMatrix })
    ),
    /closed_loop_fault_matrix_mission_binding_mismatch/u
  );

  const cases = [
    {
      label: 'pre-effect-time',
      change(faults, value) {
        return faults.map((fault, index) =>
          index === 0
            ? {
                ...fault,
                trigger: {
                  ...fault.trigger,
                  logicalTimeMs: fault.trigger.logicalTimeMs - 2,
                },
              }
            : fault
        );
      },
      error:
        /closed_loop_fault_trigger_before_pre_effect:01-capability-withdrawal/u,
    },
    {
      label: 'time',
      change(faults) {
        return faults.map((fault, index) =>
          index === 0
            ? {
                ...fault,
                trigger: {
                  ...fault.trigger,
                  logicalTimeMs: fault.trigger.logicalTimeMs + 1,
                },
              }
            : fault
        );
      },
      error:
        /closed_loop_fault_matrix_binding_invalid:01-capability-withdrawal/u,
    },
    {
      label: 'target',
      change(faults, value) {
        return faults.map((fault, index) =>
          index === 0
            ? {
                ...fault,
                targets: [
                  {
                    schemaVersion: 1,
                    peerId: value.definition.nominalDefinition.peers[0].peerId,
                  },
                ],
              }
            : fault
        );
      },
      error:
        /closed_loop_fault_matrix_target_binding_invalid:01-capability-withdrawal/u,
    },
    {
      label: 'link',
      change(faults) {
        return faults.map((fault) =>
          fault.family === 'network.partition' ||
          fault.family === 'network.heal'
            ? {
                ...fault,
                links: fault.links.map((link) => ({
                  schemaVersion: 1,
                  fromPeerId: link.toPeerId,
                  toPeerId: link.fromPeerId,
                })),
              }
            : fault
        );
      },
      error:
        /closed_loop_fault_matrix_link_binding_invalid:05-network-partition/u,
    },
    {
      label: 'recovery-target',
      change(faults, value) {
        const replacement = value.replacementPeerId;
        return faults.map((fault) =>
          fault.family === 'peer.crash' || fault.family === 'peer.restart'
            ? {
                ...fault,
                targets: [{ schemaVersion: 1, peerId: replacement }],
              }
            : fault
        );
      },
      error: /closed_loop_fault_matrix_target_binding_invalid:03-peer-crash/u,
    },
  ];
  for (const item of cases) {
    const value = await createCollectiveClosedLoopResilienceReferenceScenarioV1(
      {
        runner: 'adaptive_collective',
        peerCount: 3,
        runtime,
      }
    );
    const nominal = value.definition.nominalDefinition;
    const faultPlan = createCollectiveClosedLoopFaultPlanV1({
      schemaVersion: 1,
      nominalDefinitionDigest: nominal.definitionDigest,
      faults: item.change(value.definition.faultPlan.faults, value),
    });
    const definition = createCollectiveClosedLoopResilienceDefinitionV1({
      schemaVersion: 1,
      nominalDefinition: nominal,
      faultPlan,
      maximumEpochs: value.definition.maximumEpochs,
    });
    await assert.rejects(
      runAdaptiveCollectiveClosedLoopResilienceV1(
        Object.freeze({ ...value, definition })
      ),
      item.error,
      item.label
    );
  }
});
