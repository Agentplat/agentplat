import { digestPlanningJsonV1, type PlanningDigestV1, type PlanningJson } from '@agentplat/collective-planning';

export interface EvaluatorOwnedSemanticTraceEvidenceV1 {
  readonly schemaVersion: 1;
  readonly projectionOwner: 'evaluator';
  readonly traceEventId: string;
  readonly assessmentDigest: PlanningDigestV1;
  readonly evidenceDigest: PlanningDigestV1;
  readonly metrics: Readonly<Record<string, number | null>>;
}
const evidenceByDigest = new Map<PlanningDigestV1, EvaluatorOwnedSemanticTraceEvidenceV1>();

export function createEvaluatorOwnedSemanticTraceEvidenceV1(input: {
  readonly traceEventId: string;
  readonly assessmentDigest: PlanningDigestV1;
  readonly evidenceDigest: PlanningDigestV1;
  readonly metrics: Readonly<Record<string, number | null>>;
}): EvaluatorOwnedSemanticTraceEvidenceV1 {
  const { evidenceDigest: _sourceEvidenceDigest, ...content } = input;
  const body = Object.freeze({ schemaVersion: 1 as const, projectionOwner: 'evaluator' as const, ...content });
  const result = Object.freeze({ ...body, evidenceDigest: digestPlanningJsonV1('evaluation-campaign-artifact-v1', body as unknown as PlanningJson) });
  evidenceByDigest.set(result.evidenceDigest, result);
  return result;
}

export function semanticTraceEvidenceForDigestV1(digest: PlanningDigestV1): EvaluatorOwnedSemanticTraceEvidenceV1 | null {
  return evidenceByDigest.get(digest) ?? null;
}

export function digestEvaluatorOwnedSemanticTraceEvidenceV1(value: EvaluatorOwnedSemanticTraceEvidenceV1): PlanningDigestV1 {
  const { evidenceDigest, ...body } = value;
  const rebuilt = digestPlanningJsonV1('evaluation-campaign-artifact-v1', body as unknown as PlanningJson);
  if (rebuilt !== evidenceDigest) throw new TypeError('semantic_trace_evidence_digest_invalid');
  return evidenceDigest;
}
