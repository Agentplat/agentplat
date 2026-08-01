import type { ActionScope } from "@agentplat/inference-control/tools";

import type { GovernedActionPermitV1 } from "./contracts.js";
import {
  createCollectiveDecisionRecordV1,
  type CollectiveEvidenceAppendResultV1,
  type CollectiveEvidenceSinkV1,
} from "./evidence.js";
import type {
  GovernedActionCheckDecisionV1,
  GovernedActionCheckStageV1,
  GovernedActionGuardV1,
} from "./governed-actions.js";
import {
  dispatchGovernedActionV1,
  type GovernedActionDispatchDecisionV1,
  type GovernedActionGatewayFactoryV1,
} from "./governed-actions.js";
import {
  validateCollectiveExecutionStateV1,
  type CollectiveExecutionRepositoryV1,
} from "./lifecycle.js";
import {
  authorizeDelegationMandateAtV1,
  validateCollectiveAuthorityStateV1,
  type CollectiveAuthorityStateV1,
} from "./state.js";
import {
  assertCollectiveIdentifier,
  assertCollectiveSafeInteger,
  assertCollectiveTimestamp,
  validateGovernedActionPermitV1,
} from "./validation.js";

export interface LocalCollectiveTrustedTimeV1 {
  wallTimeForLogical(logicalTimeMs: number): string | Promise<string>;
}

export interface LocalCollectiveAuthorityReaderV1 {
  read(): CollectiveAuthorityStateV1 | Promise<CollectiveAuthorityStateV1>;
}

/**
 * Construction-bound currentness port for Mesh assignment, Trust, inference
 * assessment, handler and provider-control requirements.
 */
export interface LocalCollectiveCurrentnessV1 {
  check(input: {
    readonly stage: GovernedActionCheckStageV1;
    readonly permit: GovernedActionPermitV1;
    readonly scope: ActionScope | null;
    readonly logicalTimeMs: number;
    readonly wallTime: string;
  }): GovernedActionCheckDecisionV1 | Promise<GovernedActionCheckDecisionV1>;
}

/** Creates the portable local authority intersection used at every checkpoint. */
export function createLocalCollectiveActionGuardV1(input: {
  readonly authority: LocalCollectiveAuthorityReaderV1;
  readonly execution: CollectiveExecutionRepositoryV1;
  readonly trustedTime: LocalCollectiveTrustedTimeV1;
  readonly currentness: LocalCollectiveCurrentnessV1;
}): GovernedActionGuardV1 {
  return Object.freeze({
    async check(request: Parameters<GovernedActionGuardV1["check"]>[0]) {
      let permit: GovernedActionPermitV1;
      let wallTime: string;
      try {
        permit = validateGovernedActionPermitV1(request.permit);
        assertCollectiveSafeInteger(request.logicalTimeMs, "logicalTimeMs");
        wallTime = await input.trustedTime.wallTimeForLogical(
          request.logicalTimeMs,
        );
        assertCollectiveTimestamp(wallTime, "wallTime");
      } catch {
        return deny("governed_input_invalid");
      }
      let authority: CollectiveAuthorityStateV1;
      try {
        authority = validateCollectiveAuthorityStateV1(
          await input.authority.read(),
        );
      } catch {
        return deny("authority_repository_unavailable");
      }
      if (request.stage === "reconcile") {
        if (
          !authority.mandates.some(
            (record) =>
              record.mandate.statement.mandateId === permit.mandateId &&
              record.mandate.mandateDigest === permit.mandateDigest,
          )
        )
          return deny("mandate_missing");
      } else {
        const authorization = authorizeDelegationMandateAtV1(authority, {
          mandateId: permit.mandateId,
          mandateDigest: permit.mandateDigest,
          at: wallTime,
        });
        if (!authorization.authorized) return deny(authorization.code);
      }
      let state;
      try {
        state = validateCollectiveExecutionStateV1(
          await input.execution.read(),
        );
      } catch {
        return deny("execution_repository_unavailable");
      }
      const retained = state.actionPermits.find(
        (candidate) => candidate.permitId === permit.permitId,
      );
      const work = state.workContracts.find(
        (candidate) => candidate.workContractId === permit.workContractId,
      );
      const reservation = state.budgetReservations.find(
        (candidate) => candidate.reservationId === permit.budgetReservationId,
      );
      const expectedStatus =
        request.stage === "permit"
          ? "issued"
          : request.stage === "reconcile"
            ? "indeterminate"
            : "dispatching";
      if (
        !retained ||
        retained.permitDigest !== permit.permitDigest ||
        retained.status !== expectedStatus
      )
        return deny("permit_not_current");
      if (
        !work ||
        (request.stage !== "reconcile" && work.status !== "active") ||
        work.workContractDigest !== permit.workContractDigest ||
        work.mandate.mandateDigest !== permit.mandateDigest
      )
        return deny("work_not_current");
      if (
        !reservation ||
        reservation.status !==
          (request.stage === "reconcile" ? "indeterminate" : "reserved") ||
        reservation.permitId !== permit.permitId ||
        reservation.units !== permit.budgetUnits ||
        reservation.mandateDigest !== permit.mandateDigest
      )
        return deny("budget_not_current");
      if (
        request.stage !== "reconcile" &&
        (request.logicalTimeMs >= permit.expiresAtLogicalMs ||
          request.logicalTimeMs >= work.assignment.leaseExpiresAtLogicalMs)
      )
        return deny("authority_expired");
      if (request.scope && !scopeMatchesPermit(request.scope, permit))
        return deny("assignment_not_current");
      let currentness: GovernedActionCheckDecisionV1;
      try {
        currentness = await input.currentness.check({
          stage: request.stage,
          permit,
          scope: request.scope,
          logicalTimeMs: request.logicalTimeMs,
          wallTime,
        });
      } catch {
        return deny("currentness_unavailable");
      }
      return currentness.allowed
        ? Object.freeze({ allowed: true, code: "allowed" })
        : deny(currentness.code);
    },
  });
}

export interface LocalPolicyAdapterActionDecisionV1 {
  readonly code:
    | "completed"
    | "predispatch_evidence_unavailable"
    | "result_evidence_unavailable";
  readonly action: GovernedActionDispatchDecisionV1 | null;
  readonly evidence: CollectiveEvidenceAppendResultV1 | null;
}

/**
 * Explicit local composition boundary. It has no background worker or hidden
 * clock and never passes raw action input to the evidence sink.
 */
export class LocalPolicyAdapterV1 {
  readonly guard: GovernedActionGuardV1;

  constructor(
    readonly authority: LocalCollectiveAuthorityReaderV1,
    readonly execution: CollectiveExecutionRepositoryV1,
    readonly trustedTime: LocalCollectiveTrustedTimeV1,
    readonly currentness: LocalCollectiveCurrentnessV1,
    readonly evidence: CollectiveEvidenceSinkV1,
  ) {
    this.guard = createLocalCollectiveActionGuardV1({
      authority,
      execution,
      trustedTime,
      currentness,
    });
  }

  async dispatchGovernedAction(input: {
    readonly gatewayFactory: GovernedActionGatewayFactoryV1;
    readonly permitId: string;
    readonly actionInput?: Parameters<
      typeof dispatchGovernedActionV1
    >[0]["actionInput"];
    readonly logicalTimeMs: number;
    readonly decisionId: string;
  }): Promise<LocalPolicyAdapterActionDecisionV1> {
    assertCollectiveIdentifier(input.decisionId, "decisionId");
    if (input.decisionId.length > 240)
      throw new TypeError("decisionId is too long");
    if (input.gatewayFactory.guard !== this.guard)
      throw new Error("dependency_rebind_failed");
    const state = validateCollectiveExecutionStateV1(
      await this.execution.read(),
    );
    const permit = state.actionPermits.find(
      (candidate) => candidate.permitId === input.permitId,
    );
    let priorEvidence: CollectiveEvidenceAppendResultV1 | null = null;
    if (permit) {
      const authority = validateCollectiveAuthorityStateV1(
        await this.authority.read(),
      );
      const mandate = authority.mandates.find(
        (record) => record.mandate.mandateDigest === permit.mandateDigest,
      )?.mandate;
      if (mandate?.statement.evidence.requireDurablePreDispatchEvidence) {
        const anchor = await this.evidence.anchor();
        const record = decisionRecord(
          permit,
          `${input.decisionId}:pre`,
          "permit.reserve",
          true,
          "predispatch_evidence_ready",
          input.logicalTimeMs,
          "none",
          0,
          anchor.latestRecordDigest,
        );
        try {
          priorEvidence = await this.evidence.append(record);
        } catch {
          priorEvidence = null;
        }
        if (!priorEvidence?.accepted || !priorEvidence.durable)
          return Object.freeze({
            code: "predispatch_evidence_unavailable",
            action: null,
            evidence: priorEvidence,
          });
      }
    }
    const action = await dispatchGovernedActionV1({
      executionRepository: this.execution,
      gatewayFactory: input.gatewayFactory,
      permitId: input.permitId,
      ...(input.actionInput === undefined
        ? {}
        : { actionInput: input.actionInput }),
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!action.permit)
      return Object.freeze({
        code: "completed",
        action,
        evidence: priorEvidence,
      });
    const anchor = await this.evidence.anchor();
    const delta = evidenceBudgetDelta(
      action.permit.status,
      action.permit.budgetUnits,
    );
    const resultRecord = decisionRecord(
      action.permit,
      `${input.decisionId}:result`,
      "effect.dispatch",
      action.dispatched,
      action.code,
      input.logicalTimeMs,
      delta.kind,
      delta.units,
      anchor.latestRecordDigest,
    );
    let evidence: CollectiveEvidenceAppendResultV1 | null;
    try {
      evidence = await this.evidence.append(resultRecord);
    } catch {
      evidence = null;
    }
    return Object.freeze({
      code:
        evidence?.accepted && evidence.durable
          ? "completed"
          : "result_evidence_unavailable",
      action,
      evidence,
    });
  }

  async snapshotEvidenceAnchor() {
    return this.evidence.anchor();
  }
}

function scopeMatchesPermit(
  scope: ActionScope,
  permit: GovernedActionPermitV1,
): boolean {
  return (
    scope.tenantId === permit.tenantId &&
    (scope.kind !== "coordinated" ||
      (scope.peerId === permit.assignedPeerId &&
        scope.instanceId === permit.assignedInstanceId &&
        scope.assignmentAuthorityId === permit.assignmentAuthorityId &&
        scope.assignmentEpoch === permit.assignmentEpoch &&
        scope.authorityGeneration === permit.authorityGeneration &&
        scope.fencingToken === permit.fencingToken &&
        !scope.objectiveTerminal &&
        !scope.workTerminal))
  );
}

function deny(code: string): GovernedActionCheckDecisionV1 {
  return Object.freeze({ allowed: false, code });
}

function decisionRecord(
  permit: GovernedActionPermitV1,
  recordId: string,
  kind: "permit.reserve" | "effect.dispatch",
  accepted: boolean,
  reasonCode: string,
  logicalTimeMs: number,
  budgetDeltaKind: "none" | "commit" | "release" | "retain_indeterminate",
  budgetDeltaUnits: number,
  previousRecordDigest: GovernedActionPermitV1["permitDigest"] | null,
) {
  return createCollectiveDecisionRecordV1({
    schemaVersion: 1,
    recordId,
    tenantId: permit.tenantId,
    policyDomainId: permit.policyDomainId,
    kind,
    accepted,
    reasonCode,
    logicalTimeMs,
    mandateId: permit.mandateId,
    mandateDigest: permit.mandateDigest,
    workContractId: permit.workContractId,
    workContractDigest: permit.workContractDigest,
    permitId: permit.permitId,
    permitDigest: permit.permitDigest,
    assignmentAuthorityId: permit.assignmentAuthorityId,
    assignmentEpoch: permit.assignmentEpoch,
    fencingToken: permit.fencingToken,
    budgetDeltaKind,
    budgetDeltaUnits,
    inputDigest: permit.inputDigest,
    actionDigest: permit.actionGrantDigest,
    assessmentDigest: permit.assessmentDigest,
    trustDecisionDigest: permit.trustDecisionDigest,
    previousRecordDigest,
  });
}

function evidenceBudgetDelta(
  status: GovernedActionPermitV1["status"],
  units: number,
): {
  readonly kind: "none" | "commit" | "release" | "retain_indeterminate";
  readonly units: number;
} {
  if (status === "dispatched") return { kind: "commit", units };
  if (status === "failed" || status === "expired")
    return { kind: "release", units };
  if (status === "indeterminate")
    return { kind: "retain_indeterminate", units };
  return { kind: "none", units: 0 };
}
