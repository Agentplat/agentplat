import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type { MorphogenesisScopeV1 } from "./morphogenesis-contracts.js";
import type { MorphologyHeadV1 } from "./morphogenesis-contracts.js";
import type {
  MorphogenesisLifecycleAgentV1,
  MorphogenesisSuccessorTeamReceiptV1,
} from "./morphogenesis-execution.js";
import {
  MorphologyHeadRuntimeV1,
} from "./morphogenesis-runtime.js";

export interface MorphogenesisActivationReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly proposalDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly teamReceiptDigest: PlanningDigestV1;
  readonly resultingSnapshotDigest: PlanningDigestV1;
  readonly morphologyEpoch: number;
  readonly morphologyHeadDigest: PlanningDigestV1;
  readonly activatedAtLogicalMs: number;
  readonly activationReceiptDigest: PlanningDigestV1;
}

export interface MorphogenesisMorphologyActivationPortV1 {
  activate(input: {
    readonly operationId: AgentPlatID;
    readonly morphologyHeadStateKey: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly expectedMorphologyEpoch: number;
    readonly proposalDigest: PlanningDigestV1;
    readonly decisionDigest: PlanningDigestV1;
    readonly resultingSnapshotDigest: PlanningDigestV1;
    readonly team: MorphogenesisSuccessorTeamReceiptV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisActivationReceiptV1>;
  reconcile(input: {
    readonly operationId: AgentPlatID;
    readonly morphologyHeadStateKey: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly expectedMorphologyEpoch: number;
    readonly proposalDigest: PlanningDigestV1;
    readonly decisionDigest: PlanningDigestV1;
    readonly resultingSnapshotDigest: PlanningDigestV1;
    readonly team: MorphogenesisSuccessorTeamReceiptV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisActivationReceiptV1>;
}

export interface MorphogenesisContinuityReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly agentDigest: PlanningDigestV1;
  readonly teamReceiptDigest: PlanningDigestV1;
  readonly checkpointDigest: PlanningDigestV1;
  readonly preservedArtifactDigests: readonly PlanningDigestV1[];
  readonly completedCausalNodeDigests: readonly PlanningDigestV1[];
  readonly invalidatedCausalClosureDigests: readonly PlanningDigestV1[];
  readonly completedAtLogicalMs: number;
  readonly continuityReceiptDigest: PlanningDigestV1;
}

export interface MorphogenesisContinuityPortV1 {
  checkpoint(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly team: MorphogenesisSuccessorTeamReceiptV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisContinuityReceiptV1>;
  reconcile(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly team: MorphogenesisSuccessorTeamReceiptV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisContinuityReceiptV1>;
}

export interface MorphogenesisAuthorityFenceReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly agentDigest: PlanningDigestV1;
  readonly teamReceiptDigest: PlanningDigestV1;
  readonly fencedWorkContractDigests: readonly PlanningDigestV1[];
  readonly revokedActionGrantDigests: readonly PlanningDigestV1[];
  readonly successorFenceDigests: readonly PlanningDigestV1[];
  readonly effectReceiptDigest: PlanningDigestV1;
  readonly fencedAtLogicalMs: number;
  readonly fenceReceiptDigest: PlanningDigestV1;
}

export interface MorphogenesisAuthorityFencePortV1 {
  fence(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly team: MorphogenesisSuccessorTeamReceiptV1;
    readonly continuity: MorphogenesisContinuityReceiptV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisAuthorityFenceReceiptV1>;
  reconcile(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly team: MorphogenesisSuccessorTeamReceiptV1;
    readonly continuity: MorphogenesisContinuityReceiptV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisAuthorityFenceReceiptV1>;
}

export interface MorphogenesisTerminalAgentReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly agentDigest: PlanningDigestV1;
  readonly disposition: "detached" | "retired";
  readonly membershipConfigurationDigest: PlanningDigestV1 | null;
  readonly membershipEpoch: number | null;
  readonly lifecycleReceiptDigest: PlanningDigestV1;
  readonly terminatedAtLogicalMs: number;
  readonly terminalReceiptDigest: PlanningDigestV1;
}

export interface MorphogenesisDetachmentPortV1 {
  detach(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly team: MorphogenesisSuccessorTeamReceiptV1;
    readonly fence: MorphogenesisAuthorityFenceReceiptV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisTerminalAgentReceiptV1>;
  reconcile(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly team: MorphogenesisSuccessorTeamReceiptV1;
    readonly fence: MorphogenesisAuthorityFenceReceiptV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisTerminalAgentReceiptV1>;
}

export interface MorphogenesisAgentRetirementPortV1 {
  retire(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly fence: MorphogenesisAuthorityFenceReceiptV1;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisTerminalAgentReceiptV1>;
  reconcile(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly fence: MorphogenesisAuthorityFenceReceiptV1;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisTerminalAgentReceiptV1>;
}

export interface MorphogenesisReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly budgetReservationDigest: PlanningDigestV1;
  readonly budgetReleaseDigest: PlanningDigestV1;
  readonly activationReceiptDigest: PlanningDigestV1;
  readonly continuityReceiptDigest: PlanningDigestV1;
  readonly fenceReceiptDigest: PlanningDigestV1;
  readonly terminalAgentReceiptDigest: PlanningDigestV1;
  readonly resultingSnapshotDigest: PlanningDigestV1;
  readonly resultingMorphologyEpoch: number;
  readonly disposition:
    | "success"
    | "partial_success"
    | "failure"
    | "indeterminate"
    | "successor_recovery_required";
  readonly outcomeEvidenceDigests: readonly PlanningDigestV1[];
  readonly evaluatedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface MorphogenesisSuccessorRecoveryV1 {
  readonly schemaVersion: 1;
  readonly recoveryId: AgentPlatID;
  readonly failedReceiptDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly currentMorphologyEpoch: number;
  readonly expectedSuccessorEpoch: number;
  readonly currentSnapshotDigest: PlanningDigestV1;
  readonly reasonEvidenceDigests: readonly PlanningDigestV1[];
  readonly proposedAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly recoveryDigest: PlanningDigestV1;
}

export class MorphologyHeadMorphogenesisActivationPortV1
  implements MorphogenesisMorphologyActivationPortV1
{
  constructor(readonly heads: MorphologyHeadRuntimeV1) {}

  activate(input: Parameters<MorphogenesisMorphologyActivationPortV1["activate"]>[0]) {
    return this.#commit(input);
  }

  reconcile(input: Parameters<MorphogenesisMorphologyActivationPortV1["reconcile"]>[0]) {
    return this.#commit(input);
  }

  async #commit(
    input: Parameters<MorphogenesisMorphologyActivationPortV1["activate"]>[0],
  ): Promise<MorphogenesisActivationReceiptV1> {
    const evidenceDigest = digest("morphogenesis-activation-evidence", {
      schemaVersion: 1,
      operationId: input.operationId,
      teamReceiptDigest: input.team.receiptDigest,
      resultingSnapshotDigest: input.resultingSnapshotDigest,
    });
    const head = await this.heads.commit({
      stateKey: input.morphologyHeadStateKey,
      scopeDigest: input.scope.scopeDigest,
      policyDigest: (await this.heads.options.store.load(
        input.morphologyHeadStateKey,
      ))!.policyDigest,
      expectedMorphologyEpoch: input.expectedMorphologyEpoch,
      snapshotDigest: input.resultingSnapshotDigest,
      proposalDigest: input.proposalDigest,
      decisionDigest: input.decisionDigest,
      receiptDigest: evidenceDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
    return activationReceipt(input, head, evidenceDigest);
  }
}

function activationReceipt(
  input: Parameters<MorphogenesisMorphologyActivationPortV1["activate"]>[0],
  head: MorphologyHeadV1,
  evidenceDigest: PlanningDigestV1,
): MorphogenesisActivationReceiptV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    operationId: id(input.operationId, "activation operation ID"),
    proposalDigest: sha(input.proposalDigest, "activation proposal digest"),
    decisionDigest: sha(input.decisionDigest, "activation decision digest"),
    teamReceiptDigest: sha(input.team.receiptDigest, "activation Team receipt"),
    resultingSnapshotDigest: sha(
      input.resultingSnapshotDigest,
      "activation snapshot digest",
    ),
    morphologyEpoch: head.morphologyEpoch,
    morphologyHeadDigest: head.headDigest,
    activatedAtLogicalMs: nonNegative(
      input.logicalTimeMs,
      "activation logical time",
    ),
  });
  return freeze({
    ...body,
    activationReceiptDigest: digest("morphogenesis-activation-receipt", {
      ...body,
      evidenceDigest,
    }),
  });
}

export function createMorphogenesisContinuityReceiptV1(
  input: Omit<MorphogenesisContinuityReceiptV1, "schemaVersion" | "continuityReceiptDigest">,
): MorphogenesisContinuityReceiptV1 {
  const body = freeze({ schemaVersion: 1 as const, operationId: id(input.operationId, "continuity operation ID"), agentDigest: sha(input.agentDigest, "continuity agent digest"), teamReceiptDigest: sha(input.teamReceiptDigest, "continuity Team receipt"), checkpointDigest: sha(input.checkpointDigest, "continuity checkpoint digest"), preservedArtifactDigests: digests(input.preservedArtifactDigests, "preserved artifact digests", 1), completedCausalNodeDigests: digests(input.completedCausalNodeDigests, "completed causal nodes", 0), invalidatedCausalClosureDigests: digests(input.invalidatedCausalClosureDigests, "invalidated causal closure", 0), completedAtLogicalMs: nonNegative(input.completedAtLogicalMs, "continuity completion time") });
  return freeze({ ...body, continuityReceiptDigest: digest("morphogenesis-continuity-receipt", body) });
}

export function createMorphogenesisAuthorityFenceReceiptV1(
  input: Omit<MorphogenesisAuthorityFenceReceiptV1, "schemaVersion" | "fenceReceiptDigest">,
): MorphogenesisAuthorityFenceReceiptV1 {
  const body = freeze({ schemaVersion: 1 as const, operationId: id(input.operationId, "fence operation ID"), agentDigest: sha(input.agentDigest, "fence agent digest"), teamReceiptDigest: sha(input.teamReceiptDigest, "fence Team receipt"), fencedWorkContractDigests: digests(input.fencedWorkContractDigests, "fenced Work Contracts", 1), revokedActionGrantDigests: digests(input.revokedActionGrantDigests, "revoked Action Grants", 0), successorFenceDigests: digests(input.successorFenceDigests, "successor fences", 1), effectReceiptDigest: sha(input.effectReceiptDigest, "fence effect receipt digest"), fencedAtLogicalMs: nonNegative(input.fencedAtLogicalMs, "fence time") });
  return freeze({ ...body, fenceReceiptDigest: digest("morphogenesis-authority-fence-receipt", body) });
}

export function createMorphogenesisTerminalAgentReceiptV1(
  input: Omit<MorphogenesisTerminalAgentReceiptV1, "schemaVersion" | "terminalReceiptDigest">,
): MorphogenesisTerminalAgentReceiptV1 {
  if ((input.membershipConfigurationDigest === null) !== (input.membershipEpoch === null)) fail("terminal membership receipt is incomplete");
  if (input.disposition === "retired" && input.membershipEpoch === null) fail("retirement requires a membership successor");
  const body = freeze({ schemaVersion: 1 as const, operationId: id(input.operationId, "terminal operation ID"), agentDigest: sha(input.agentDigest, "terminal agent digest"), disposition: input.disposition, membershipConfigurationDigest: input.membershipConfigurationDigest === null ? null : sha(input.membershipConfigurationDigest, "terminal membership digest"), membershipEpoch: input.membershipEpoch === null ? null : positive(input.membershipEpoch, "terminal membership epoch"), lifecycleReceiptDigest: sha(input.lifecycleReceiptDigest, "terminal lifecycle receipt"), terminatedAtLogicalMs: nonNegative(input.terminatedAtLogicalMs, "terminal time") });
  return freeze({ ...body, terminalReceiptDigest: digest("morphogenesis-terminal-agent-receipt", body) });
}

export function createMorphogenesisReceiptV1(
  input: Omit<MorphogenesisReceiptV1, "schemaVersion" | "receiptDigest">,
): MorphogenesisReceiptV1 {
  const body = freeze({ schemaVersion: 1 as const, receiptId: id(input.receiptId, "Morphogenesis receipt ID"), scopeDigest: sha(input.scopeDigest, "receipt scope digest"), proposalDigest: sha(input.proposalDigest, "receipt proposal digest"), decisionDigest: sha(input.decisionDigest, "receipt decision digest"), budgetReservationDigest: sha(input.budgetReservationDigest, "receipt budget digest"), budgetReleaseDigest: sha(input.budgetReleaseDigest, "receipt budget release digest"), activationReceiptDigest: sha(input.activationReceiptDigest, "receipt activation digest"), continuityReceiptDigest: sha(input.continuityReceiptDigest, "receipt continuity digest"), fenceReceiptDigest: sha(input.fenceReceiptDigest, "receipt fence digest"), terminalAgentReceiptDigest: sha(input.terminalAgentReceiptDigest, "receipt terminal agent digest"), resultingSnapshotDigest: sha(input.resultingSnapshotDigest, "receipt snapshot digest"), resultingMorphologyEpoch: positive(input.resultingMorphologyEpoch, "receipt morphology epoch"), disposition: input.disposition, outcomeEvidenceDigests: digests(input.outcomeEvidenceDigests, "receipt outcome evidence", 1), evaluatedAtLogicalMs: nonNegative(input.evaluatedAtLogicalMs, "receipt evaluation time") });
  if (!new Set(["success", "partial_success", "failure", "indeterminate", "successor_recovery_required"]).has(body.disposition)) fail("Morphogenesis receipt disposition is invalid");
  return freeze({ ...body, receiptDigest: digest("morphogenesis-receipt", body) });
}

export function createMorphogenesisSuccessorRecoveryV1(input: {
  readonly receipt: MorphogenesisReceiptV1;
  readonly reasonEvidenceDigests: readonly PlanningDigestV1[];
  readonly proposedAtLogicalMs: number;
}): MorphogenesisSuccessorRecoveryV1 {
  if (
    !new Set(["failure", "indeterminate", "successor_recovery_required"]).has(
      input.receipt.disposition,
    )
  )
    fail("successful Morphogenesis receipt cannot request successor recovery");
  const body = freeze({
    schemaVersion: 1 as const,
    recoveryId: `${input.receipt.receiptId}:successor-recovery` as AgentPlatID,
    failedReceiptDigest: input.receipt.receiptDigest,
    scopeDigest: input.receipt.scopeDigest,
    currentMorphologyEpoch: input.receipt.resultingMorphologyEpoch,
    expectedSuccessorEpoch: input.receipt.resultingMorphologyEpoch + 1,
    currentSnapshotDigest: input.receipt.resultingSnapshotDigest,
    reasonEvidenceDigests: digests(
      input.reasonEvidenceDigests,
      "successor recovery evidence",
      1,
    ),
    proposedAtLogicalMs: nonNegative(
      input.proposedAtLogicalMs,
      "successor recovery proposal time",
    ),
    advisoryOnly: true as const,
  });
  return freeze({
    ...body,
    recoveryDigest: digest("morphogenesis-successor-recovery", body),
  });
}

function id(value: unknown, label: string): AgentPlatID { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(value)) fail(`${label} is invalid`); return value as AgentPlatID; }
function sha(value: unknown, label: string): PlanningDigestV1 { if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail(`${label} is invalid`); return value as PlanningDigestV1; }
function positive(value: unknown, label: string): number { const result = nonNegative(value, label); if (result < 1) fail(`${label} is invalid`); return result; } function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`); return value as number; }
function digests(input: readonly unknown[], label: string, minimum: number): readonly PlanningDigestV1[] { if (!Array.isArray(input) || input.length < minimum || input.length > 4_096) fail(`${label} count is invalid`); const result = input.map((item) => sha(item, label)).sort(); if (new Set(result).size !== result.length) fail(`${label} contain duplicates`); return freeze(result); }
function digest(domain: PlanningDigestDomainV1, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain, value as PlanningJson); } function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.getOwnPropertyNames(value)) freeze((value as Record<string, unknown>)[key]); } return value; } function fail(message: string): never { throw new TypeError(message); }
