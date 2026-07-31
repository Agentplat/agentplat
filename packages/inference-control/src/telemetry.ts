import type { DiagnosticV1 } from './types.js';
import { deepFreeze } from './validation.js';

export interface ControlDiagnosticSinkV1 {
  emit(diagnostic: DiagnosticV1): Promise<void>;
}

export interface DiagnosticDeliverySummaryV1 {
  readonly attempted: number;
  readonly delivered: number;
  readonly unavailable: number;
}

/** Diagnostics are already redacted; sink failure never changes a control decision. */
export async function emitControlDiagnosticsBestEffortV1(
  diagnostics: readonly DiagnosticV1[],
  sink: ControlDiagnosticSinkV1,
): Promise<DiagnosticDeliverySummaryV1> {
  let delivered = 0;
  for (const diagnostic of diagnostics) {
    try {
      await sink.emit(deepFreeze(structuredClone(diagnostic)));
      delivered += 1;
    } catch {
      // Observability is deliberately non-authoritative.
    }
  }
  return deepFreeze({
    attempted: diagnostics.length,
    delivered,
    unavailable: diagnostics.length - delivered,
  });
}
