import { digestPlanningJsonV1 } from '@agentplat/collective-planning';
import { createGovernedCollectiveRuntimeV1 } from '@agentplat/collective-runtime/governed-collective-runtime';

const policy = {
  schemaVersion: 1,
  policyId: 'local-reference-policy',
  policyVersion: 1,
  policyDigest: digestPlanningJsonV1('proposal-identity', {
    policyId: 'local-reference-policy',
    policyVersion: 1,
  }),
  maximumCycles: 2,
  pauseOnDeniedApproval: true,
  safeStopOnPhaseFailure: true,
};

const runtime = createGovernedCollectiveRuntimeV1({
  missionId: 'reference-mission',
  policy,
  phases: {
    observe: ({ intent }) => ({ metadata: { observedKeys: Object.keys(intent).sort() } }),
    approval: () => ({ status: 'applied', reasonCode: 'approved' }),
    effect: () => ({ status: 'applied', reasonCode: 'effect_recorded' }),
  },
});

const receipt = await runtime.run({
  operationId: 'reference-mission:cycle-1',
  intent: { objective: 'produce-a-local-receipt' },
});

console.log(receipt.status, receipt.completedPhases, receipt.receiptDigest);
console.log(runtime.pause().status);
console.log(runtime.resume().status);
console.log(runtime.safeStop('example_complete').status);
