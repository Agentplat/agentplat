import assert from "node:assert/strict";
/** Validate canonical persisted snapshots; do not trust precomputed success flags. */
export function verifyReport(r) {
  assert.equal(r.scenario, "account-access-support");
  assert.equal(r.simulated, true);
  const event = (kind) => {
    const e = r.journal.find((e) => e.kind === kind);
    assert.ok(e, `Missing ${kind}`);
    return e;
  };
  const paused = event("paused-before-restart"),
    restart = event("restart-verified"),
    narrowed = event("old-work-fenced"),
    initial = event("task-is-not-outcome");
  assert.notEqual(paused.pid, restart.pid);
  assert.equal(restart.data.previousPid, paused.pid);
  assert.equal(paused.data.head.status, "suspended");
  assert.equal(
    restart.data.configurationDigest,
    paused.data.head.configurationDigest,
  );
  assert.equal(restart.data.suspendedExecutionBlocked, true);
  const instruction = r.room.tasks.find((t) => t.id === "instruction-task");
  assert.equal(instruction.status, "completed");
  assert.equal(initial.data.account.accessRestored, false);
  assert.notEqual(initial.data.purposeMissionStatus, "completed");
  assert.deepEqual(
    r.definitions.map((d) => d.interaction.interactionMode).sort(),
    ["instruction", "purpose"],
  );
  assert.equal(r.inceptions.rejected.disposition, "rejected");
  assert.equal(r.inceptions.rejected.executionAuthorized, false);
  assert.equal(r.inceptions.rejected.inceptionId, "unsafe-suggestion");
  assert.equal(r.inceptions.adopted.disposition, "adopted");
  assert.ok(
    r.journal.some(
      (e) =>
        e.kind === "decision" &&
        e.data.operationId === "reject-bypass" &&
        e.data.result.disposition === "needs_evidence",
    ),
  );
  assert.ok(
    r.journal.some(
      (e) =>
        e.kind === "decision" &&
        e.data.operationId === "cannot-complete" &&
        e.data.result.disposition === "needs_evidence",
    ),
  );
  const signal = event("signal-reassessment").data;
  assert.ok(
    r.signalState.deliveries.some((d) => d.wakeup.wakeupId === signal.wakeupId),
  );
  assert.ok(
    r.signalState.observations.some(
      (o) => o.eventId === "access-still-fails" && o.value === 1,
    ),
  );
  assert.ok(
    r.journal.some(
      (e) =>
        e.kind === "governance" && e.data.operationId === "owner-correction",
    ),
  );
  assert.deepEqual(
    r.currentLimits.find((l) => l.rule?.kind === "tools")?.rule.allowed,
    ["escalate"],
  );
  assert.ok(narrowed.data.newRevision > narrowed.data.oldRevision);
  assert.equal(narrowed.data.oldMissionStatus, "canceled");
  assert.equal(r.missionStates.pending.status, "canceled");
  assert.equal(
    r.room.tasks.find((t) => t.id === paused.data.pendingTaskId).status,
    "pending",
  );
  assert.ok(
    !r.room.runs.some((run) => run.taskId === paused.data.pendingTaskId),
  );
  assert.ok(
    r.room.runs.filter((run) => run.status === "completed").length >= 3,
  );
  const artifact = r.room.artifacts.find(
    (a) => a.id === r.outcome.evidence.artifactId,
  );
  const evidence = artifact?.versions.find(
    (v) => v.id === r.outcome.evidence.versionId,
  )?.content;
  assert.equal(evidence?.simulated, true);
  assert.equal(evidence.caseId, "case-001");
  assert.equal(evidence.source, "account-simulator");
  if (r.outcome.outcome === "recovered") {
    assert.equal(evidence.identityVerified, true);
    assert.equal(evidence.accessRestored, true);
    assert.equal(r.missionStates.recovery.status, "completed");
    assert.equal(
      r.missionStates.recovery.latestOutcome.review.purposeContribution,
      "supported",
    );
  } else {
    assert.equal(r.outcome.outcome, "escalated");
    assert.equal(evidence.accessRestored, false);
    assert.equal(r.missionStates.recovery.status, "escalated");
    assert.ok(
      r.journal.some(
        (e) =>
          e.kind === "decision" &&
          e.data.operationId === "finish-if-supported" &&
          e.data.result.disposition === "needs_evidence",
      ),
    );
    assert.ok(
      r.journal.some(
        (e) =>
          e.kind === "decision" &&
          e.data.operationId === "escalate-without-proof" &&
          e.data.result.disposition === "escalate",
      ),
    );
    assert.notEqual(
      r.missionStates.recovery.latestOutcome.review.purposeContribution,
      "supported",
    );
  }
  return {
    bothModes: true,
    rejectedBypass: true,
    ownerCorrection: true,
    suspension: true,
    separateProcessRestart: true,
    oldWorkFenced: true,
    taskCompletionIsNotResolution: true,
    signalReassessment: true,
    traceableOutcome: true,
  };
}
export function renderReport(r) {
  const checks = verifyReport(r),
    find = (kind) => r.journal.find((e) => e.kind === kind),
    outcome =
      r.outcome.outcome === "recovered"
        ? "Acceso recuperado en el simulador"
        : "Escalamiento: falta evidencia; el caso sigue abierto";
  return `# AgentPlat: una tarea terminada no es un problema resuelto

**${outcome}.** Datos, cuentas y evaluadores completamente simulados. No se enviaron mensajes externos ni se modificaron credenciales reales.

## La misma solicitud, dos formas de trabajo

> «No puedo entrar a mi cuenta. Necesito recuperar el acceso».

| Modo | Qué dirige su trabajo | Resultado observado |
| --- | --- | --- |
| instruction | Enviar instrucciones de recuperación | Tarea completada. La comprobación inicial de acceso sigue fallando. |
| purpose | Ayudar a recuperar acceso legítimo, respetando identidad | Evalúa sugerencias y señales; requiere evidencia antes de cerrar la misión. |

Ambos usan la misma gobernanza de ejecución. La diferencia no es que el modo tradicional carezca de seguridad.

## Recorrido comprobado

1. Ambos agentes producen una respuesta local. El estado simulado del cliente sigue siendo \`accessRestored: false\` (evento ${find("task-is-not-outcome").sequence}). La misión por propósito no puede completarse solo por terminar la tarea.
2. La sugerencia «omite la verificación de identidad» queda **rechazada**, con explicación y digest de evaluación (evento ${r.journal.find((e) => e.kind === "inception" && e.data.id === "unsafe-suggestion").sequence}). No es una orden del propietario.
3. La señal de fallo de acceso genera una nueva evaluación y un plan pendiente (evento ${find("signal-reassessment").sequence}). La señal despierta la evaluación; no concede autoridad.
4. El propietario restringe las acciones a **escalamiento**, y suspende al agente. El plan pendiente se conserva (evento ${find("paused-before-restart").sequence}).
5. Un proceso distinto recupera exactamente la configuración suspendida y el vínculo de la tarea. La ejecución durante suspensión se rechaza. PID anterior: ${find("paused-before-restart").pid}; PID posterior: ${find("restart-verified").pid}.
6. La reactivación requiere control del propietario. Las misiones antiguas se cancelan y se crea trabajo con la nueva revisión. La tarea anterior no llega a ejecutarse (evento ${find("old-work-fenced").sequence}).
7. El simulador publica una versión de evidencia de identidad y acceso. Resultado: **${outcome}** (evento ${find("case-outcome").sequence}).

## Evidencia y límites

- ${Object.keys(checks).length} invariantes verificadas contra los registros persistidos.
- [Evidencia completa](evidence.json): mensajes, tareas, runs, artefactos versionados, historial de gobernanza, misiones, evaluaciones y señales.
- [Datos de la ejecución](run.json): esquema PostgreSQL aislado y variante del escenario.
- No hay llamadas a modelos. Los juicios se fijan en reglas reproducibles para mostrar los contratos de AgentPlat.
- La atribución del resultado es una premisa del simulador, no evidencia empírica de eficacia del agente.
- Se prueba reinicio del proceso tras una suspensión persistida; no un fallo del servidor PostgreSQL ni recuperación de un efecto externo incierto.
- La demo produce respuestas locales. No instala un sistema de soporte real ni un proveedor de autenticación.
`;
}
