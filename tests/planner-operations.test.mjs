import test from "node:test";
import {
  InMemorySharedBudgetStoreV1,
  InMemoryScheduledFollowupStoreV1,
} from "@agentplat/rooms";
import { plannerOperationsScenarios } from "./helpers/planner-operations-scenarios.mjs";
import { plannerBudgetIntegrationScenarios } from "./helpers/planner-budget-integration.mjs";
test("shared periodic budgets, activations and notices in memory", async (t) =>
  plannerOperationsScenarios(t, async () => ({
    budget: new InMemorySharedBudgetStoreV1(),
    followup: new InMemoryScheduledFollowupStoreV1(),
  })));
test("Planner shared budget integration in memory", async (t) =>
  plannerBudgetIntegrationScenarios(t, async () => ({
    budget: new InMemorySharedBudgetStoreV1(),
    followup: new InMemoryScheduledFollowupStoreV1(),
  })));
