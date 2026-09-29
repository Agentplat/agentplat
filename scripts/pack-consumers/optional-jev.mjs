import assert from "node:assert/strict";
import { TypeSafeAssessorV1 } from "@agentplat/assessor-typesafe";
let calls = 0,
  record;
const assessor = new TypeSafeAssessorV1({
  assessorId: "packed-jev",
  assessorVersion: 1,
  assessorBindingDigest: `sha256:${"a".repeat(64)}`,
  apiKey: "test-key",
  model: "jev-fixture",
  timeoutMs: 1000,
  fetch: async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(init.body).model, "jev-fixture");
    return new Response(
      JSON.stringify({
        model: "jev-fixture",
        answers: { eligible: { type: "noul", noul: 0.9 } },
        usage: { input_tokens: 2, output_tokens: 1 },
      }),
      { headers: { "content-type": "application/json" } },
    );
  },
  buildRequest: (r) => ({
    state: { content: r.content },
    questions: {
      eligible: { type: "noul", instructions: "Assess fixture eligibility" },
    },
  }),
  mapResult: (r) => ({
    disposition: r.answers.eligible.noul >= 0.9 ? "allow" : "escalate",
    reasonCode: "fixture-result",
  }),
  evidenceSink: (r) => {
    record = r;
  },
});
assert.deepEqual(
  await assessor.assess({
    runId: "run",
    checkpoint: "post_run",
    targetDigest: `sha256:${"b".repeat(64)}`,
    content: "Synthetic fixture",
    sequence: null,
  }),
  { disposition: "allow", reasonCode: "fixture-result" },
);
assert.equal(calls, 1);
assert.equal(record.status, "completed");
assert.equal(Object.hasOwn(record, "content"), false);
console.log(
  "Optional Jev tarball: injected transport, policy mapping and content-free evidence passed; no provider call.",
);
