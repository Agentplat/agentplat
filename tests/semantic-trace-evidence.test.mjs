import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvaluatorOwnedSemanticTraceEvidenceV1, digestEvaluatorOwnedSemanticTraceEvidenceV1 } from '../packages/mesh-sim/dist/index.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('evaluator-owned semantic trace evidence binds metrics and verifies its digest', () => {
  const evidence = createEvaluatorOwnedSemanticTraceEvidenceV1({ traceEventId: 'inference.assessed:1', assessmentDigest: digest('a'), evidenceDigest: digest('b'), metrics: { contextConflictBps: 100, uncertaintyBps: 200 } });
  assert.equal(evidence.projectionOwner, 'evaluator');
  assert.equal(digestEvaluatorOwnedSemanticTraceEvidenceV1(evidence), evidence.evidenceDigest);
  assert.throws(() => digestEvaluatorOwnedSemanticTraceEvidenceV1({ ...evidence, metrics: { contextConflictBps: 9_000 } }), /semantic_trace_evidence_digest_invalid/);
});
