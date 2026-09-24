import assert from "node:assert/strict";
import test from "node:test";

import { reviewProposal } from "../scripts/proposal-reviewer.mjs";

const artifact = {
  id: "artifact:proposal",
  currentVersion: 2,
  versions: [
    { version: 1, content: "Initial draft without review criteria." },
    {
      version: 2,
      content: "Include a weekly human review and a stop decision after four weeks.",
    },
  ],
};

test("default proposal review is local, advisory, and bound to current version", async () => {
  const result = await reviewProposal({ artifact, env: {} });

  assert.equal(result.evaluator, "rules");
  assert.equal(result.sourceArtifactId, artifact.id);
  assert.equal(result.sourceArtifactVersion, 2);
  assert.match(result.rubricDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.providerModel, null);
  assert.equal(result.usage, null);
  assert.ok(Number.isSafeInteger(result.elapsedMs));
  assert.equal(result.authority, "advisory_only_human_approval_required");
  assert.deepEqual(result.criteria.map(({ signal }) => signal.matched), [true, true]);
});

test("old review criteria are not inferred from another artifact version", async () => {
  const result = await reviewProposal({
    artifact: { ...artifact, currentVersion: 1 },
    env: {},
  });

  assert.equal(result.sourceArtifactVersion, 1);
  assert.deepEqual(result.criteria.map(({ signal }) => signal.matched), [false, false]);
});

test("Jev is opt-in and requires an explicit key", async () => {
  await assert.rejects(
    reviewProposal({ artifact, env: { PROPOSAL_REVIEWER: "jev" } }),
    /TYPESAFE_API_KEY_required_for_jev_review/,
  );
});

test("Jev requires a spend cap before constructing the provider client", async () => {
  await assert.rejects(
    reviewProposal({
      artifact,
      env: { PROPOSAL_REVIEWER: "jev", TYPESAFE_API_KEY: "configured" },
    }),
    /TYPESAFE_MAX_SPEND_USD_must_be_positive/,
  );
});

test("review flow accepts an injected evaluator and preserves Jev signal semantics", async () => {
  let evaluatedRequest;
  const result = await reviewProposal({
    artifact,
    env: { PROPOSAL_REVIEWER: "jev" },
    decisionClient: {
      reservedSpendUsd: 0.002688,
      async evaluate(request) {
        evaluatedRequest = request;
        return {
          model: "jev-1.13.0",
          usage: { input_tokens: 20, output_tokens: 4 },
          answers: {
            weekly_human_review: { type: "noul", noul: 0.92 },
            stop_after_four_weeks: { type: "noul", noul: 0.17 },
          },
        };
      },
    },
  });

  assert.equal(evaluatedRequest.state.artifact.version, 2);
  assert.equal(result.evaluator, "jev");
  assert.equal(result.providerModel, "jev-1.13.0");
  assert.deepEqual(result.criteria.map(({ signal }) => signal), [
    { kind: "jev_noul", yesProbability: 0.92 },
    { kind: "jev_noul", yesProbability: 0.17 },
  ]);
  assert.equal(result.spendReservedUsd, 0.002688);
});

test("review flow keeps structured LLM answers distinct from Jev probabilities", async () => {
  const result = await reviewProposal({
    artifact,
    env: { PROPOSAL_REVIEWER: "structured-llm" },
    structuredEvaluator: {
      async evaluate() {
        return {
          providerModel: "gpt-compatible-test",
          usage: { input_tokens: 30, output_tokens: 8 },
          observedCostUsd: 0.0001,
          spendReservedUsd: 0.001,
          signals: {
            weekly_human_review: { kind: "structured_llm_binary", satisfied: true },
            stop_after_four_weeks: { kind: "structured_llm_binary", satisfied: false },
          },
        };
      },
    },
  });

  assert.equal(result.evaluator, "structured-llm");
  assert.deepEqual(result.criteria.map(({ signal }) => signal.kind), [
    "structured_llm_binary",
    "structured_llm_binary",
  ]);
  assert.notEqual(result.criteria[0].signal.kind, "jev_noul");
});
