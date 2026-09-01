import { proxyActivities } from "@temporalio/workflow";

const { runDecisionRejectionScenario } = proxyActivities({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 1 },
});

export async function morphogenesisDecisionRejectionWorkflowV1(input) {
  return runDecisionRejectionScenario(input);
}
