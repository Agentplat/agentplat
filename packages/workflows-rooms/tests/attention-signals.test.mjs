import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryAgentGovernanceStoreV1,
  InMemoryAttentionSignalStoreV1,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
} from "@agentplat/rooms";
import { InMemoryWorkflowStoreV1 } from "@agentplat/workflows";
import {
  attentionWakeupToProcessSignalV1,
  ATTENTION_EVALUATION_SIGNAL_TYPE_V1,
} from "../dist/index.js";
import { attentionSignalScenarios } from "../../../tests/helpers/attention-signal-scenarios.mjs";

test("attention wakeups reuse workflow signal identity without invoking a runner or creating authority", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1();
  const { initial } = await attentionSignalScenarios({
    governance,
    store: new InMemoryAttentionSignalStoreV1(governance),
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
  });
  const signal = attentionWakeupToProcessSignalV1(initial, "evaluation-run");
  assert.equal(signal.signalType, ATTENTION_EVALUATION_SIGNAL_TYPE_V1);
  assert.equal(signal.payload.executionAuthorized, false);
  assert.deepEqual(
    attentionWakeupToProcessSignalV1(
      structuredClone(initial),
      "evaluation-run",
    ),
    signal,
  );
  const store = new InMemoryWorkflowStoreV1();
  assert.equal(await store.appendSignal(signal), "created");
  assert.equal(await store.appendSignal(signal), "replayed");
  assert.equal((await store.listSignals("t", "evaluation-run")).length, 1);
  await assert.rejects(
    store.appendSignal(
      attentionWakeupToProcessSignalV1(
        { ...initial, contradictory: !initial.contradictory },
        "evaluation-run",
      ),
    ),
  );
  assert.throws(() =>
    attentionWakeupToProcessSignalV1(
      { ...initial, executionAuthorized: true },
      "evaluation-run",
    ),
  );
});
