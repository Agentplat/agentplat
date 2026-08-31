import assert from "node:assert/strict";
import test from "node:test";
import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryMorphogenesisVerticalStoreV1,
  MORPHOGENESIS_VERTICAL_STAGES_V1,
  MorphogenesisIntegrationVerticalRuntimeV1,
} from "@agentplat/collective-runtime/morphogenesis";
const sha = (v) =>
  digestPlanningJsonV1("morphogenesis-strategy-context-v3", { v });
const ports = () =>
  Object.fromEntries(
    MORPHOGENESIS_VERTICAL_STAGES_V1.map((stage) => [
      stage,
      {
        async execute(i) {
          const body = {
            schemaVersion: 1,
            operationId: i.operationId,
            stage,
            inputDigest: i.inputDigest,
            outputDigest: sha(`output:${stage}`),
            appliedAtLogicalMs: i.logicalTimeMs,
          };
          return {
            ...body,
            receiptDigest: digestPlanningJsonV1(
              "morphogenesis-vertical-stage-receipt-v1",
              body,
            ),
          };
        },
        async reconcile(i) {
          return this.execute(i);
        },
        async compensate(i) {
          const body = {
            schemaVersion: 1,
            operationId: i.operationId,
            stageReceiptDigest: i.receipt.receiptDigest,
            outputDigest: sha(`compensated:${stage}`),
            compensatedAtLogicalMs: i.logicalTimeMs,
          };
          return {
            ...body,
            receiptDigest: digestPlanningJsonV1(
              "morphogenesis-vertical-compensation-receipt-v1",
              body,
            ),
          };
        },
      },
    ]),
  );
test("hardening vertical runs V1-V8 with stable receipts", async () => {
  const runtime = new MorphogenesisIntegrationVerticalRuntimeV1({
    store: new InMemoryMorphogenesisVerticalStoreV1(),
    ports: ports(),
    maximumCommitAttempts: 4,
  });
  let state = await runtime.initialize({
    stateKey: "vertical:complete",
    rootInputDigest: sha("root"),
    logicalTimeMs: 10,
  });
  for (
    let index = 0;
    index <= MORPHOGENESIS_VERTICAL_STAGES_V1.length;
    index += 1
  )
    state = await runtime.advance({
      stateKey: state.stateKey,
      logicalTimeMs: 11 + index,
    });
  assert.equal(state.status, "completed");
  assert.deepEqual(
    state.receipts.map(({ stage }) => stage),
    MORPHOGENESIS_VERTICAL_STAGES_V1,
  );
});
test("hardening vertical compensates applied stages in reverse", async () => {
  const runtime = new MorphogenesisIntegrationVerticalRuntimeV1({
    store: new InMemoryMorphogenesisVerticalStoreV1(),
    ports: ports(),
    maximumCommitAttempts: 4,
  });
  let state = await runtime.initialize({
    stateKey: "vertical:rollback",
    rootInputDigest: sha("root"),
    logicalTimeMs: 10,
  });
  for (let index = 0; index < 3; index += 1)
    state = await runtime.advance({
      stateKey: state.stateKey,
      logicalTimeMs: 11 + index,
    });
  state = await runtime.fail({
    stateKey: state.stateKey,
    failureEvidenceDigest: sha("failure"),
    logicalTimeMs: 20,
  });
  for (let index = 0; index < 4; index += 1)
    state = await runtime.compensate({
      stateKey: state.stateKey,
      logicalTimeMs: 21 + index,
    });
  assert.equal(state.status, "rolled_back");
  assert.deepEqual(
    state.compensationReceipts.map(
      ({ stageReceiptDigest }) => stageReceiptDigest,
    ),
    [...state.receipts].reverse().map(({ receiptDigest }) => receiptDigest),
  );
});
