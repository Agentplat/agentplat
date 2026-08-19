import assert from "node:assert/strict";
import test from "node:test";

import { projectDiagnosticSemanticMetrics } from "../scripts/diagnostic-semantic-projection.mjs";

const context = { cell: { cellId: "cell:pilot" }, runner: "adaptive_collective" };
const monitor = { missionSuccess: true, authorizationViolations: 0 };
const event = (kind, eventId, accountingUnits = 0, faultBinding = null) => ({
  kind,
  eventId,
  status: "accepted",
  accountingUnits,
  faultBinding,
});

test("semantic projection records post-heal quiescence and interaction delta", () => {
  const projection = projectDiagnosticSemanticMetrics(context, [
    event("fault.observed", "heal", 0, { faultFamily: "network.heal" }),
    event("inference.assessed", "decision", 1),
    event("environment.effect.committed", "effect", 2),
    event("work.result", "quiescence", 3),
  ], monitor);
  assert.equal(projection.projectionOwner, "evaluator");
  assert.equal(projection.status, "complete_for_diagnostic_profile");
  assert.equal(projection.convergence.evidencePresent, true);
  assert.equal(projection.convergence.healOrQuiescenceEventId, "heal");
  assert.equal(projection.convergence.quiescenceEventId, "quiescence");
  assert.equal(projection.convergence.interactionDelta, 6);
  assert.equal(projection.convergence.agreementEventId, null);
});

test("semantic projection rejects heal without a post-heal quiescence event", () => {
  const projection = projectDiagnosticSemanticMetrics(context, [
    event("fault.observed", "heal", 0, { faultFamily: "network.heal" }),
    event("inference.assessed", "decision", 1),
  ], monitor);
  assert.equal(projection.convergence.evidencePresent, false);
  assert.equal(projection.convergence.reasonCode, "convergence_evidence_missing");
  assert.equal(projection.convergence.interactionDelta, null);
});

test("semantic projection rejects quiescence when the evaluator sees a safety violation", () => {
  const projection = projectDiagnosticSemanticMetrics(context, [
    event("fault.observed", "heal", 0, { faultFamily: "network.heal" }),
    event("work.result", "quiescence", 3),
  ], { missionSuccess: true, authorizationViolations: 1 });
  assert.equal(projection.convergence.evidencePresent, false);
  assert.equal(projection.unsafeExecutableCount, 1);
});
