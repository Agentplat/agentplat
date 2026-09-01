import { proxyActivities } from "@temporalio/workflow";

const { runMaterialRecoveryScenario } = proxyActivities({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 4 },
});

export async function morphogenesisMaterialRecoveryWorkflowV1(input) {
  return runMaterialRecoveryScenario(input);
}
