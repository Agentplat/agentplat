import assert from "node:assert/strict";
import test from "node:test";

import { createMorphogenesisOperatorOutcomeReceiptV2 } from "@agentplat/collective-runtime/morphogenesis";
import { InteropMorphogenesisHandlerV2 } from "../dist/morphogenesis.js";

const sha = (character) => `sha256:${character.repeat(64)}`;

function fixture() {
  const payload = {
    schemaVersion: 2,
    morphogenesisRequestDigest: sha("1"),
    missionScopeDigest: sha("2"),
    missionAuthorizationDigest: sha("3"),
    expectedMorphologyEpoch: 4,
  };
  const request = {
    requestDigest: sha("4"),
    operation: "morphogenesis.enact",
    idempotencyKey: "interop:morphogenesis:1",
    payload,
  };
  const admissionGrant = {
    admitted: true,
    admissionId: "admission:morphogenesis:1",
    requestDigest: request.requestDigest,
    scopeRevision: 1,
    scopeEpoch: 1,
    scopeDigest: sha("5"),
    bindingDigest: sha("6"),
  };
  const outcome = createMorphogenesisOperatorOutcomeReceiptV2({
    receiptId: "outcome:interop:morphogenesis:1",
    operatorExecutionStateDigest: sha("7"),
    planDigest: sha("8"),
    proposalDigest: sha("9"),
    decisionDigest: sha("a"),
    authorizationDigest: sha("b"),
    authorityFenceDigest: sha("c"),
    stepReceiptRoot: sha("d"),
    disposition: "success",
    outcomeEvidenceDigests: [sha("e")],
    resultingSnapshotDigest: sha("f"),
    resultingMorphologyEpoch: 5,
    evaluatedAtLogicalMs: 100,
  });
  return { payload, request, admissionGrant, outcome };
}

test("Interop Morphogenesis carries an exact admitted cycle and outcome", async () => {
  const value = fixture();
  let calls = 0;
  const handler = new InteropMorphogenesisHandlerV2({
    async enact(input) {
      calls += 1;
      assert.equal(input.interopRequestDigest, value.request.requestDigest);
      assert.equal(input.idempotencyKey, value.request.idempotencyKey);
      assert.equal(input.admissionGrant.bindingDigest, value.admissionGrant.bindingDigest);
      return {
        morphogenesisRequestDigest: input.request.morphogenesisRequestDigest,
        missionScopeDigest: input.request.missionScopeDigest,
        missionAuthorizationDigest: input.request.missionAuthorizationDigest,
        expectedMorphologyEpoch: input.request.expectedMorphologyEpoch,
        outcome: value.outcome,
      };
    },
  });
  const response = await handler.handle({
    request: value.request,
    admissionGrant: value.admissionGrant,
    signal: new AbortController().signal,
  });
  assert.equal(response.status, "completed");
  assert.equal(response.reasonCode, "morphogenesis_success");
  assert.equal(response.payload.receiptDigest, value.outcome.receiptDigest);
  assert.equal(calls, 1);
});

test("Interop Morphogenesis rejects missing admission and substituted results", async () => {
  const value = fixture();
  const handler = new InteropMorphogenesisHandlerV2({
    async enact(input) {
      return {
        morphogenesisRequestDigest: sha("0"),
        missionScopeDigest: input.request.missionScopeDigest,
        missionAuthorizationDigest: input.request.missionAuthorizationDigest,
        expectedMorphologyEpoch: input.request.expectedMorphologyEpoch,
        outcome: value.outcome,
      };
    },
  });
  await assert.rejects(handler.handle({
    request: value.request,
    admissionGrant: null,
    signal: new AbortController().signal,
  }), /exact admission grant/);
  await assert.rejects(handler.handle({
    request: value.request,
    admissionGrant: value.admissionGrant,
    signal: new AbortController().signal,
  }), /result binding is invalid/);
});
