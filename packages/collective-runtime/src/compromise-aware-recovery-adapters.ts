import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { MeshSparsePeerPlaneRuntimeV1 } from "@agentplat/mesh/overlay";

import type {
  CollectivePeerNodeRecoveryElectionDecisionV1,
  CollectivePeerNodeRecoveryElectionPortV1,
} from "./node-contracts.js";
import type { TeamExecutionContinuityPortV1 } from "./team-execution-continuity-contracts.js";
import type { CollectivePeerCurrentnessPortV1 } from "./peer-contracts.js";
import {
  type CompromiseRecoveryActivationPortV1,
  type CompromiseRecoveryActivationV1,
  type CompromiseRecoveryExclusionPortV1,
  type CompromiseRecoveryFencingPortV1,
  type CompromiseRecoveryFenceV1,
  type CompromiseRecoveryRequestV1,
  type CompromiseRecoveryRestorationPortV1,
  type CompromiseRecoveryRestorationV1,
  type CompromiseRecoveryAnchorV1,
  type CompromiseRecoveryStateV1,
  type CompromiseRecoveryStoreV1,
  type CompromiseRecoveryVerdictCertificateV1,
} from "./compromise-aware-recovery-contracts.js";
import type { CompromiseAwareRecoveryRuntimeV1 } from "./compromise-aware-recovery-runtime.js";
import { compromiseRecoveryDigestV1 } from "./compromise-aware-recovery-validation.js";

/**
 * Atomic reference store. It demonstrates the required state+anchor commit
 * contract but is not a production rollback-resistant persistence adapter.
 */
export class InMemoryCompromiseRecoveryStoreV1
  implements CompromiseRecoveryStoreV1
{
  readonly #states = new Map<string, CompromiseRecoveryStateV1>();
  readonly #anchors = new Map<string, CompromiseRecoveryAnchorV1>();

  async loadCurrent(input: {
    readonly stateKey: string;
    readonly anchorKey: string;
  }): Promise<{
    readonly state: CompromiseRecoveryStateV1 | null;
    readonly anchor: CompromiseRecoveryAnchorV1 | null;
  }> {
    const state = this.#states.get(input.stateKey);
    const anchor = this.#anchors.get(input.anchorKey);
    return Object.freeze({
      state: state ? structuredClone(state) : null,
      anchor: anchor ? structuredClone(anchor) : null,
    });
  }

  async save(input: {
    readonly state: CompromiseRecoveryStateV1;
    readonly anchorKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    const current = this.#states.get(input.state.stateKey) ?? null;
    const anchor = this.#anchors.get(input.anchorKey) ?? null;
    if (
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest ||
      (anchor?.revision ?? null) !== input.expectedRevision ||
      (anchor?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    if (
      current === null
        ? input.state.revision !== 0 ||
          input.state.predecessorStateDigest !== null
        : input.state.revision !== current.revision + 1 ||
          input.state.predecessorStateDigest !== current.stateDigest ||
          input.state.logicalTimeHighWaterMs < current.logicalTimeHighWaterMs
    )
      throw new TypeError("recovery store transition is invalid");
    const state = structuredClone(input.state);
    this.#states.set(state.stateKey, state);
    this.#anchors.set(input.anchorKey, {
      revision: state.revision,
      stateDigest: state.stateDigest,
      logicalTimeHighWaterMs: state.logicalTimeHighWaterMs,
    });
    return true;
  }
}

/** Structural boundary implemented by governed membership lifecycles. */
export interface CompromiseRecoveryPeerLifecyclePortV1 {
  retirePeer(input: {
    readonly peerId: string;
    readonly reasonCode: string;
    readonly cascade: boolean;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly retired: true;
    readonly peerId: string;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly membershipEpoch: number;
    readonly retirementDigest: PlanningDigestV1;
    readonly retiredAtLogicalMs: number;
  }>;
}

export interface CompromiseRecoveryTelemetryPortV1 {
  record(event: {
    readonly category: "recovery";
    readonly operation: "peer.lifecycle_exclusion";
    readonly outcome: "completed";
    readonly logicalTimeMs: number;
    readonly operationDigest: PlanningDigestV1;
    readonly evidenceDigests: readonly PlanningDigestV1[];
    readonly correlation: {
      readonly missionId: string;
      readonly cycleId: string;
    };
  }): Promise<void>;
}

/**
 * Extends sparse exclusion with governed membership retirement. The recovery
 * saga advances only after both idempotent operations have completed, so a
 * compromised peer cannot remain eligible for later planning or agreement.
 */
export function createCompromiseRecoveryLifecycleExclusionPortV1(input: {
  readonly exclusion: CompromiseRecoveryExclusionPortV1;
  readonly lifecycle: CompromiseRecoveryPeerLifecyclePortV1;
  readonly telemetry?: CompromiseRecoveryTelemetryPortV1;
  readonly reasonCode?: string;
}): CompromiseRecoveryExclusionPortV1 {
  const exclusion = input?.exclusion;
  const lifecycle = input?.lifecycle;
  const telemetry = input?.telemetry;
  const configuredReasonCode = input?.reasonCode;
  const exclude = exclusion?.exclude;
  const retirePeer = lifecycle?.retirePeer;
  const recordTelemetry = telemetry?.record;
  if (!exclusion || typeof exclude !== "function")
    throw new TypeError("compromise recovery exclusion port is required");
  if (!lifecycle || typeof retirePeer !== "function")
    throw new TypeError("governed peer lifecycle port is required");
  const reasonCode = configuredReasonCode ?? "certified_peer_compromise";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u.test(reasonCode))
    throw new TypeError("peer retirement reasonCode is invalid");
  return Object.freeze({
    exclude: async (request: Parameters<CompromiseRecoveryExclusionPortV1["exclude"]>[0]) => {
      const sparse = await exclude.call(exclusion, request);
      const retirement = await retirePeer.call(lifecycle, {
        peerId: request.verdict.subjectPeerId,
        reasonCode,
        cascade: true,
        logicalTimeMs: request.logicalTimeMs,
      });
      if (
        !retirement.retired ||
        retirement.peerId !== request.verdict.subjectPeerId ||
        retirement.retiredAtLogicalMs > request.logicalTimeMs ||
        !Number.isSafeInteger(retirement.membershipEpoch) ||
        retirement.membershipEpoch < 1
      )
        throw new Error("governed peer retirement binding is invalid");
      const body = {
        operationId: sparse.operationId,
        subjectPeerId: sparse.subjectPeerId,
        subjectPeerIndex: sparse.subjectPeerIndex,
        certificateDigest: sparse.certificateDigest,
        resultingViewDigest: sparse.resultingViewDigest,
        resultingViewRevision: sparse.resultingViewRevision,
        appliedAtLogicalMs: sparse.appliedAtLogicalMs,
        lifecycleRetirementDigest: retirement.retirementDigest,
        membershipConfigurationDigest: retirement.membershipConfigurationDigest,
        membershipEpoch: retirement.membershipEpoch,
      };
      const result = Object.freeze({
        ...body,
        receiptDigest: await compromiseRecoveryDigestV1(
          "compromise-exclusion-receipt",
          body,
        ),
      });
      if (recordTelemetry && telemetry) {
        try {
          await recordTelemetry.call(telemetry, {
            category: "recovery",
            operation: "peer.lifecycle_exclusion",
            outcome: "completed",
            logicalTimeMs: request.logicalTimeMs,
            operationDigest: result.receiptDigest,
            evidenceDigests: [
              request.verdict.certificateDigest,
              retirement.retirementDigest,
              retirement.membershipConfigurationDigest,
            ].sort(),
            correlation: {
              missionId: request.verdict.scope.missionIntentId,
              cycleId: request.verdict.scope.objectiveId,
            },
          });
        } catch {
          // Observability never becomes authority for an already-applied saga step.
        }
      }
      return result;
    },
  });
}

/** Bridges a certified verdict to the adaptive sparse peer plane. */
export function createCompromiseRecoverySparseExclusionPortV1(
  plane: Pick<MeshSparsePeerPlaneRuntimeV1, "applyAdaptation">,
): CompromiseRecoveryExclusionPortV1 {
  const applyAdaptation = plane?.applyAdaptation;
  if (!plane || typeof applyAdaptation !== "function")
    throw new TypeError("adaptive sparse peer plane is required");
  return Object.freeze({
    exclude: async ({ operationId, verdict, logicalTimeMs }: Parameters<
      CompromiseRecoveryExclusionPortV1["exclude"]
    >[0]) => {
      const result = await applyAdaptation.call(plane, {
        certificate: verdict.sparseExclusionCertificate,
        expectedRevision: verdict.expectedAdaptiveRevision,
        logicalTime: logicalTimeMs,
      });
      if (
        result.adaptation.decision !== "applied" &&
        result.adaptation.decision !== "duplicate"
      )
        throw new Error(
          `sparse_exclusion_${result.adaptation.reasonCode}`,
        );
      const application =
        result.adaptation.applied ?? result.adaptation.state.applied;
      if (
        !application ||
        application.certificateDigest !==
          verdict.sparseExclusionCertificate.certificateDigest ||
        application.appliedAtLogicalMs > logicalTimeMs
      )
        throw new Error("sparse_exclusion_application_binding_invalid");
      const view = result.state.routing.view;
      if (!view.excludedNeighborIndexes.includes(verdict.subjectPeerIndex))
        throw new Error("sparse_exclusion_subject_not_excluded");
      const body = {
        operationId,
        subjectPeerId: verdict.subjectPeerId,
        subjectPeerIndex: verdict.subjectPeerIndex,
        certificateDigest: verdict.certificateDigest,
        resultingViewDigest: view.viewDigest,
        resultingViewRevision: view.revision,
        // Duplicate retries retain the original effect time and therefore the
        // same receipt identity after a crash between the effect and saga CAS.
        appliedAtLogicalMs: application.appliedAtLogicalMs,
      };
      return Object.freeze({
        ...body,
        receiptDigest: await compromiseRecoveryDigestV1(
          "compromise-exclusion-receipt",
          body,
        ),
      });
    },
  });
}

/** Atomic installer implemented by the assignment/authority repository. */
export interface CompromiseRecoveryAssignmentFenceInstallerV1 {
  install(input: {
    readonly operationId: string;
    readonly workItemId: string;
    readonly excludedPeerId: string;
    readonly expectedAssignmentEpoch: number;
    readonly expectedFencingToken: string;
    readonly nextAssignmentEpoch: number;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly assignmentEpoch: number;
    readonly fencingToken: string;
    readonly installedAtLogicalMs: number;
  }>;
}

/** Produces a saga receipt only after the assignment/execution fence is durable. */
export function createCompromiseRecoveryFencingPortV1(
  installer: CompromiseRecoveryAssignmentFenceInstallerV1,
): CompromiseRecoveryFencingPortV1 {
  const install = installer?.install;
  if (!installer || typeof install !== "function")
    throw new TypeError("assignment fence installer is required");
  return Object.freeze({
    fence: async ({ operationId, verdict, request, logicalTimeMs }: Parameters<
      CompromiseRecoveryFencingPortV1["fence"]
    >[0]) => {
      const installed = await install.call(installer, {
        operationId,
        workItemId: request.scope.workItemId,
        excludedPeerId: verdict.subjectPeerId,
        expectedAssignmentEpoch: request.priorAssignmentEpoch,
        expectedFencingToken: request.priorFencingToken,
        nextAssignmentEpoch: request.proposedAssignmentEpoch,
        logicalTimeMs,
      });
      if (
        installed.assignmentEpoch !== request.proposedAssignmentEpoch ||
        installed.installedAtLogicalMs > logicalTimeMs
      )
        throw new Error("assignment_fence_installation_binding_invalid");
      const body = {
        operationId,
        workItemId: request.scope.workItemId,
        excludedPeerId: verdict.subjectPeerId,
        priorAssignmentEpoch: request.priorAssignmentEpoch,
        assignmentEpoch: installed.assignmentEpoch,
        fencingToken: installed.fencingToken,
        installedAtLogicalMs: installed.installedAtLogicalMs,
      };
      return Object.freeze({
        ...body,
        fenceDigest: await compromiseRecoveryDigestV1(
          "compromise-recovery-fence",
          body,
        ),
      });
    },
  });
}

/** Adds the recovery fence to the peer runtime's existing pre/post currentness gate. */
export function createCompromiseRecoveryCurrentnessPortV1(input: {
  readonly recovery: Pick<CompromiseAwareRecoveryRuntimeV1, "gateExecution">;
  readonly delegate: CollectivePeerCurrentnessPortV1;
}): CollectivePeerCurrentnessPortV1 {
  const recovery = input?.recovery;
  const delegate = input?.delegate;
  const gateExecution = recovery?.gateExecution;
  const check = delegate?.check;
  const currentnessId = delegate?.currentnessId;
  const currentnessVersion = delegate?.currentnessVersion;
  const implementationId = delegate?.implementationId;
  if (!recovery || typeof gateExecution !== "function")
    throw new TypeError("compromise recovery runtime is required");
  if (!delegate || typeof check !== "function")
    throw new TypeError("peer currentness delegate is required");
  return Object.freeze({
    currentnessId,
    currentnessVersion,
    implementationId,
    check: async (
      request: Parameters<CollectivePeerCurrentnessPortV1["check"]>[0],
    ) => {
      const current = await check.call(delegate, request);
      if (!current.current) return current;
      const assignment = request.workContract.assignment;
      const gate = await gateExecution.call(recovery, {
        peerId: assignment.assignedPeerId,
        assignmentEpoch: assignment.assignmentEpoch,
        fencingToken: assignment.fencingToken,
        logicalTimeMs: request.logicalTimeMs,
      });
      return gate.allowed
        ? Object.freeze({ current: true as const, reasonCode: "current" as const })
        : Object.freeze({ current: false as const, reasonCode: gate.reasonCode });
    },
  });
}

/** Entry point that turns an election certificate into the existing node recovery flow. */
export interface CompromiseRecoveryCertifiedFlowPortV1 {
  activate(input: {
    readonly operationId: string;
    readonly verdict: CompromiseRecoveryVerdictCertificateV1;
    readonly request: CompromiseRecoveryRequestV1;
    readonly fence: CompromiseRecoveryFenceV1;
    readonly election: CollectivePeerNodeRecoveryElectionDecisionV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly decision: "checkpoint" | "reauction" | "replan";
    readonly checkpointDigest: PlanningDigestV1 | null;
  }>;
}

/** Uses the node's threshold-certified election, then activates its recovery/re-auction flow. */
export function createCompromiseRecoveryNodeActivationPortV1(input: {
  readonly election: CollectivePeerNodeRecoveryElectionPortV1;
  readonly flow: CompromiseRecoveryCertifiedFlowPortV1;
}): CompromiseRecoveryActivationPortV1 {
  const electionPort = input?.election;
  const flowPort = input?.flow;
  const select = electionPort?.select;
  const activateFlow = flowPort?.activate;
  if (!electionPort || typeof select !== "function")
    throw new TypeError("node recovery election port is required");
  if (!flowPort || typeof activateFlow !== "function")
    throw new TypeError("certified recovery flow port is required");
  return Object.freeze({
    activate: async ({
      operationId,
      verdict,
      request,
      fence,
      logicalTimeMs,
    }: Parameters<CompromiseRecoveryActivationPortV1["activate"]>[0]) => {
      const election = await select.call(electionPort, {
        scopeDigest: request.requestDigest,
        objectiveId: request.scope.objectiveId,
        objectiveRevision: request.objectiveRevision,
        objectiveExpiresAtLogicalMs: request.objectiveExpiresAtLogicalMs,
        workItemId: request.scope.workItemId,
        workItemRevision: request.workItemRevision,
        priorAssignmentEpoch: request.priorAssignmentEpoch,
        proposedAssignmentEpoch: request.proposedAssignmentEpoch,
        proposals: request.takeoverProposals,
        eligibleWitnessPeerIds: request.eligibleWitnessPeerIds,
        recoveryWitnessThreshold: request.recoveryWitnessThreshold,
        logicalTimeMs,
      });
      if (!election)
        throw new Error("certified_recovery_selection_unavailable");
      const selectedProposal = request.takeoverProposals.find(
        ({ takeoverProposalId, proposedAssigneePeerId }) =>
          takeoverProposalId === election.selectedProposalId &&
          proposedAssigneePeerId === election.selectedAssigneePeerId,
      );
      if (
        election.schemaVersion !== 1 ||
        election.scopeDigest !== request.requestDigest ||
        typeof election.electionId !== "string" ||
        election.electionId.length === 0 ||
        !Number.isSafeInteger(election.electionRound) ||
        election.electionRound < 0 ||
        !selectedProposal ||
        !Number.isSafeInteger(election.certifiedAtLogicalMs) ||
        !Number.isSafeInteger(election.expiresAtLogicalMs) ||
        election.certifiedAtLogicalMs < selectedProposal.acceptedAtLogicalMs ||
        election.certifiedAtLogicalMs < fence.installedAtLogicalMs ||
        election.certifiedAtLogicalMs > logicalTimeMs ||
        election.expiresAtLogicalMs <= logicalTimeMs ||
        election.expiresAtLogicalMs <= election.certifiedAtLogicalMs ||
        election.expiresAtLogicalMs > request.objectiveExpiresAtLogicalMs ||
        election.certifiedWitnessPeerIds.length <
          request.recoveryWitnessThreshold ||
        new Set(election.certifiedWitnessPeerIds).size !==
          election.certifiedWitnessPeerIds.length ||
        election.certifiedWitnessPeerIds.some(
          (peerId) => !request.eligibleWitnessPeerIds.includes(peerId),
        )
      )
        throw new Error("certified_recovery_election_binding_invalid");
      if (election.selectedAssigneePeerId === verdict.subjectPeerId)
        throw new Error("certified_recovery_selected_excluded_peer");
      const flow = await activateFlow.call(flowPort, {
        operationId,
        verdict,
        request,
        fence,
        election,
        logicalTimeMs,
      });
      if (
        flow.decision === "checkpoint" &&
        (!request.checkpointDigest ||
          flow.checkpointDigest !== request.checkpointDigest)
      )
        throw new Error("certified_recovery_checkpoint_binding_invalid");
      if (flow.decision !== "checkpoint" && flow.checkpointDigest !== null)
        throw new Error("certified_recovery_checkpoint_must_be_null");
      const body = {
        operationId,
        electionId: election.electionId,
        electionRound: election.electionRound,
        selectedProposalId: election.selectedProposalId,
        selectedAssigneePeerId: election.selectedAssigneePeerId,
        certifiedWitnessPeerIds: election.certifiedWitnessPeerIds,
        decision: flow.decision,
        checkpointDigest: flow.checkpointDigest,
        certifiedAtLogicalMs: election.certifiedAtLogicalMs,
        expiresAtLogicalMs: election.expiresAtLogicalMs,
      };
      return Object.freeze({
        ...body,
        activationDigest: await compromiseRecoveryDigestV1(
          "compromise-recovery-activation",
          body,
        ),
      });
    },
  });
}

export interface CompromiseRecoveryFallbackPortV1 {
  activateReauction(input: {
    readonly operationId: string;
    readonly activation: CompromiseRecoveryActivationV1;
    readonly fence: CompromiseRecoveryFenceV1;
    readonly logicalTimeMs: number;
  }): Promise<PlanningDigestV1>;
  requestReplanning(input: {
    readonly operationId: string;
    readonly activation: CompromiseRecoveryActivationV1;
    readonly fence: CompromiseRecoveryFenceV1;
    readonly logicalTimeMs: number;
  }): Promise<PlanningDigestV1>;
}

/** Restores execution continuity when possible; otherwise delegates bounded fallback. */
export function createCompromiseRecoveryRestorationPortV1(input: {
  readonly continuity: Pick<TeamExecutionContinuityPortV1, "takeover">;
  readonly fallback: CompromiseRecoveryFallbackPortV1;
}): CompromiseRecoveryRestorationPortV1 {
  const continuity = input?.continuity;
  const fallback = input?.fallback;
  const takeover = continuity?.takeover;
  const activateReauction = fallback?.activateReauction;
  const requestReplanning = fallback?.requestReplanning;
  if (!continuity || typeof takeover !== "function")
    throw new TypeError("team execution continuity port is required");
  if (
    !fallback ||
    typeof activateReauction !== "function" ||
    typeof requestReplanning !== "function"
  )
    throw new TypeError("recovery fallback port is required");
  const receipt = async (
    operationId: string,
    mode: CompromiseRecoveryRestorationV1["mode"],
    artifactDigest: PlanningDigestV1,
    appliedAtLogicalMs: number,
  ): Promise<CompromiseRecoveryRestorationV1> => {
    const body = { operationId, mode, artifactDigest, appliedAtLogicalMs };
    return Object.freeze({
      ...body,
      restorationDigest: await compromiseRecoveryDigestV1(
        "compromise-recovery-restoration",
        body,
      ),
    });
  };
  return Object.freeze({
    restoreCheckpoint: async ({
      operationId,
      checkpointDigest,
      logicalTimeMs,
    }: Parameters<CompromiseRecoveryRestorationPortV1["restoreCheckpoint"]>[0]) => {
      const restored = await takeover.call(continuity, {
        checkpointDigest,
        logicalTimeMs,
      });
      return receipt(
        operationId,
        "checkpoint",
        restored.execution.stateDigest,
        logicalTimeMs,
      );
    },
    activateReauction: async (
      request: Parameters<CompromiseRecoveryRestorationPortV1["activateReauction"]>[0],
    ) =>
      receipt(
        request.operationId,
        "reauction",
        await activateReauction.call(fallback, request),
        request.logicalTimeMs,
      ),
    requestReplanning: async (
      request: Parameters<CompromiseRecoveryRestorationPortV1["requestReplanning"]>[0],
    ) =>
      receipt(
        request.operationId,
        "replan",
        await requestReplanning.call(fallback, request),
        request.logicalTimeMs,
      ),
  });
}
