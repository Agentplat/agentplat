import {
  createPlanningLocalWorkProjectionV1,
  createPlanningAdaptiveRoleV1,
  planningWorkItemIdV1,
  selectPlanningOfferRecipientsV1,
  PLANNING_WORK_EXTENSION_KEY_V1,
  validatePlanningWorkExtensionV1,
  type PlanningAdaptiveRoleResultV1,
  type PlanningFragmentRepositoryRecordV1,
  type PlanningLocalWorkProjectionV1,
  type PlanningWorkExtensionV1,
} from "@agentplat/collective-planning/mesh";
import {
  createPlanningReducerCommandV1,
  digestPlanningJsonV1,
  reducePlanningCommandV1,
  type PlanFragmentProposalV1,
  type PlanFragmentV1,
  type PlanningJson,
  type PlanningReducerStateV1,
  type AdaptiveRoleBindingV1,
} from "@agentplat/collective-planning";
import {
  createMeshAllocationInboundRuntimeState,
  createMeshObjectiveWorkRuntimeState,
  evaluateMeshAllocationCommand,
  evaluateMeshAllocationTimer,
  evaluateMeshCoordinationTimer,
  evaluateMeshObjectiveWorkCommand,
  evaluateMeshObjectiveWorkTimer,
  selectMeshAllocationBid,
  type MeshAllocationPayload,
  type MeshAllocationInboundRuntimeState,
  type MeshAssignmentFenceHeadProjection,
  type MeshExecutionHeadProjection,
  type MeshLeaseHeadProjection,
  type MeshObjectiveProjection,
  type MeshReceivedOfferProjection,
  type MeshWorkObjectivePolicySnapshot,
  type MeshWorkItemProjection,
} from "@agentplat/mesh/coordination";
import { validateDelegationMandateV1 } from "@agentplat/collective-control";
import type { MeshWorkContractSourceV1 } from "@agentplat/collective-control/mesh";
import {
  meshAuthorityScopeKeyV1,
  type MeshAuthorityCurrentBindingV1,
} from "@agentplat/mesh/continuity";
import {
  createMeshDurableWorker,
  computeMeshDurableValueDigest,
  type MeshDurableOutboundDraft,
  type MeshDurableOutboxDeliver,
  type MeshDurableOutboxRecord,
  type MeshDurablePeerSnapshot,
  type MeshDurableWorker,
} from "@agentplat/mesh/durability";
import {
  MESH_PROTOCOL,
  type LeaseCertificatePayload,
  type LeaseRenewPayload,
  type LeaseTakeoverProposalPayload,
  type LeaseVotePayload,
  type MeshJsonValue,
  type SignedMeshEnvelope,
  type WorkAcceptPayload,
  type WorkAwardPayload,
  type WorkBidPayload,
  type WorkCheckpointPayload,
  type WorkOfferPayload,
  type WorkResultPayload,
} from "@agentplat/mesh-protocol";
import type { PortableAgentCheckpointV1 } from "@agentplat/runtime/adapter";

import {
  createCapabilityStateCandidateV1,
  createCapabilityStateFusionRequestV1,
  validateCapabilityStateFusionDecisionV1,
  type CapabilityStateCandidateV1,
  type CapabilityStateOperationV1,
} from "./capability-state.js";

import {
  COLLECTIVE_PEER_NODE_SCHEMA_VERSION,
  COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT,
  COLLECTIVE_PEER_OWNER_CONTINUITY_EXTENSION_V1,
  COLLECTIVE_PEER_RECOVERY_ELECTION_EXTENSION_V1,
  type CollectivePeerNodeAgentRegistrationV1,
  type CollectivePeerNodeActionResolutionV1,
  type CollectivePeerNodeAssignmentConfirmationV1,
  type CollectivePeerNodeClockReadingV1,
  type CollectivePeerNodeExecuteInputV1,
  type CollectivePeerNodeExecuteOutcomeV1,
  type CollectivePeerNodeExecutionReleaseV1,
  type CollectivePeerNodePlanInputV1,
  type CollectivePeerNodePlanOutcomeV1,
  type CollectivePeerNodeReceiveInputV1,
  type CollectivePeerNodeReceiveOutcomeV1,
  type CollectivePeerNodeReconcileOutcomeV1,
  type CollectivePeerNodeRecoveryElectionDecisionV1,
  type CollectivePeerNodeRuntimeConfigV1,
  type CollectivePeerNodeRuntimePortV1,
  type CollectivePeerNodeRunOutcomeV1,
  type CollectivePeerNodeSnapshotV1,
  type CollectivePeerNodeStoredStateV1,
  type CollectivePeerNodeSynchronizationOperationV1,
} from "./node-contracts.js";
import { CollectivePeerRuntimeErrorV1 } from "./peer-errors.js";
import {
  createCollectivePeerNodeSnapshotV1,
  createCollectivePeerNodeStoredStateV1,
  encodeCollectivePeerNodeStoredStateV1,
  meshDurableScopeForNodeV1,
  normalizeCollectivePeerNodeScopeV1,
  restoreCollectivePeerNodeStoredStateV1,
} from "./node-state.js";

const DEFAULT_MAXIMUM_COMMIT_ATTEMPTS = 4;
const DEFAULT_MAXIMUM_OFFER_RECIPIENTS = 16;
const DEFAULT_PLANNING_ROLE_VALID_UNTIL = 86_400_000;
const DEFAULT_RECOVERY_ENVELOPE_TTL_MS = 300_000;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const AUTHORITY_DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const PLANNING_DIGEST = /^sha256:[0-9a-f]{64}$/u;

/**
 * Long-lived productive composition root for one concrete collective peer.
 *
 * The node owns durable ingress, peer-local planning, local Work creation,
 * recipient selection and atomic publication of signed offers. It never
 * receives a caller-provided PlanView, Work Contract or assignment authority.
 */
export class CollectivePeerNodeRuntimeV1 implements CollectivePeerNodeRuntimePortV1 {
  readonly #options: CollectivePeerNodeRuntimeConfigV1;
  readonly #scope: ReturnType<typeof normalizeCollectivePeerNodeScopeV1>;
  readonly #durableScope: ReturnType<typeof meshDurableScopeForNodeV1>;
  readonly #initial: CollectivePeerNodeStoredStateV1;
  readonly #agents: ReadonlyMap<string, CollectivePeerNodeAgentRegistrationV1>;
  readonly #worker: MeshDurableWorker;
  readonly #maximumCommitAttempts: number;
  readonly #maximumOfferRecipients: number;
  readonly #planningRoleValidFromLogicalMs: number;
  readonly #planningRoleValidUntilLogicalMs: number;

  constructor(options: CollectivePeerNodeRuntimeConfigV1) {
    if (!options || typeof options !== "object")
      invalid("collective peer node options are required");
    this.#scope = normalizeCollectivePeerNodeScopeV1(options.scope);
    this.#durableScope = meshDurableScopeForNodeV1(this.#scope);
    if (
      !options.repository ||
      typeof options.repository.receive !== "function" ||
      typeof options.repository.loadSnapshot !== "function" ||
      typeof options.repository.commitLocalTransition !== "function"
    )
      invalid("a durable local-transition repository is required");
    if (!options.inbound || typeof options.inbound.process !== "function")
      invalid("a planning Mesh inbound processor is required");
    if (typeof options.deliverOutbox !== "function")
      invalid("a durable outbox delivery function is required");
    if (!options.fragments || typeof options.fragments.put !== "function")
      invalid("a planning fragment repository is required");
    if (
      options.planningArtifacts !== undefined &&
      typeof options.planningArtifacts.ensureAvailable !== "function"
    )
      invalid("the planning artifact availability port is invalid");
    if (
      !options.peerRuntime ||
      typeof options.peerRuntime.plan !== "function" ||
      typeof options.peerRuntime.execute !== "function"
    )
      invalid("a productive peer runtime is required");
    if (!options.clock || typeof options.clock.now !== "function")
      invalid("a peer node clock is required");
    if (
      !options.continuity ||
      options.continuity.ownerTransferMode !== "stop_and_replan" ||
      typeof options.continuity.resolveScope !== "function" ||
      typeof options.continuity.resolve !== "function" ||
      typeof options.continuity.check !== "function"
    )
      invalid("an authority continuity port is required");
    if (
      !options.assignmentConfirmation ||
      typeof options.assignmentConfirmation.confirm !== "function"
    )
      invalid("an assignment confirmation port is required");
    if (
      !options.recoveryElection ||
      typeof options.recoveryElection.select !== "function"
    )
      invalid("a threshold-certified recovery election port is required");
    if (
      options.synchronization !== undefined &&
      (typeof options.synchronization.readiness !== "function" ||
        typeof options.synchronization.recoverPredecessor !== "function")
    )
      invalid("the synchronization port is invalid");
    if (!options.actions || typeof options.actions.execute !== "function")
      invalid("an action execution port is required");
    if (!options.authority || typeof options.authority !== "object")
      invalid("node authority configuration is required");
    const mandate = validateDelegationMandateV1(options.authority.mandate);
    if (
      mandate.statement.tenantId !== this.#scope.tenantId ||
      mandate.statement.policyDomainId !== this.#scope.policyDomainId ||
      !mandate.statement.subjectPeerIds.includes(this.#scope.peerId)
    )
      invalid("the delegation mandate does not authorize this node");
    identifier(options.authority.trustPolicyId, "authority.trustPolicyId");
    identifier(
      options.authority.inferencePolicyId,
      "authority.inferencePolicyId",
    );
    const maximumActionBudgetUnits = positiveInteger(
      options.authority.maximumActionBudgetUnits,
      "authority.maximumActionBudgetUnits",
    );
    if (
      maximumActionBudgetUnits >
      mandate.statement.budget.maximumActionBudgetUnits
    )
      invalid("node action budget exceeds the delegation mandate");
    if (
      !options.signing ||
      typeof options.signing.signer?.sign !== "function" ||
      !options.signing.privateKey
    )
      invalid("a Mesh signing binding is required");
    identifier(options.signing.keyId, "signing.keyId");
    identifier(options.workerId, "workerId");
    this.#options = options;
    this.#initial = createCollectivePeerNodeStoredStateV1({
      scope: this.#scope,
      runtime: options.initialState,
    });
    this.#agents = normalizeAgents(options.agents, this.#scope);
    normalizeControlBinding(options.expectedControlBinding);
    if (options.capabilityState !== undefined) {
      identifier(options.capabilityState.fusionId, "capabilityState.fusionId");
      positiveInteger(
        options.capabilityState.fusionVersion,
        "capabilityState.fusionVersion",
      );
      identifier(
        options.capabilityState.implementationId,
        "capabilityState.implementationId",
      );
      identifier(options.capabilityState.policyId, "capabilityState.policyId");
      positiveInteger(
        options.capabilityState.policyVersion,
        "capabilityState.policyVersion",
      );
      if (
        !PLANNING_DIGEST.test(options.capabilityState.policyDigest) ||
        typeof options.capabilityState.evaluate !== "function"
      )
        invalid("the capability state fusion port is invalid");
    }
    this.#maximumCommitAttempts = boundedInteger(
      options.maximumCommitAttempts ?? DEFAULT_MAXIMUM_COMMIT_ATTEMPTS,
      "maximumCommitAttempts",
      16,
    );
    this.#maximumOfferRecipients = boundedInteger(
      options.maximumOfferRecipients ?? DEFAULT_MAXIMUM_OFFER_RECIPIENTS,
      "maximumOfferRecipients",
      256,
    );
    this.#planningRoleValidFromLogicalMs = nonNegativeInteger(
      options.planningRoleValidFromLogicalMs ?? 0,
      "planningRoleValidFromLogicalMs",
    );
    this.#planningRoleValidUntilLogicalMs = positiveInteger(
      options.planningRoleValidUntilLogicalMs ??
        DEFAULT_PLANNING_ROLE_VALID_UNTIL,
      "planningRoleValidUntilLogicalMs",
    );
    if (
      this.#planningRoleValidUntilLogicalMs <=
      this.#planningRoleValidFromLogicalMs
    )
      invalid("planning role validity is empty");
    this.#worker = createMeshDurableWorker({
      repository: options.repository,
      scope: this.#durableScope,
      workerId: options.workerId,
      processInbox: async ({ inbox, snapshot, signal }) => {
        let state = snapshot ? this.#decodeSnapshot(snapshot) : this.#initial;
        const now = normalizeClockReading(options.clock.now());
        if (!isAllocationEnvelope(inbox.envelope)) {
          const transitionId = `node.inbound.${shortDigest({
            messageId: inbox.messageId,
          })}`;
          return {
            outcome: "applied" as const,
            transitionId,
            nextState: encodeCollectivePeerNodeStoredStateV1(state),
            journal: [
              {
                entryId: transitionId,
                kind: "node.inbound.rejected",
                reasonCode: "unsupported_message_type",
              },
            ],
          };
        }
        const receivedAt = Math.max(
          now.logicalTimeMs,
          state.runtime.mesh.coordination.lastLogicalTime,
        );
        state = this.#advanceDueTimersInMemory(state, receivedAt);
        let decision = await options.inbound.process(state.runtime, {
          envelope: inbox.envelope,
          verifiedAt: now.wallTime,
          receivedAt,
        });
        if (signal?.aborted)
          throw new Error("collective_peer_node_inbox_aborted");
        if (
          !decision.accepted &&
          decision.code === "planning_repository_missing" &&
          options.planningArtifacts
        ) {
          const request = planningArtifactAvailabilityRequestV1(
            this.#scope,
            inbox.envelope,
            receivedAt,
            signal,
          );
          if (!request)
            throw new CollectivePeerRuntimeErrorV1(
              "STATE_CONFLICT",
              "authenticated planning offer has inconsistent artifact bindings",
            );
          const available =
            await options.planningArtifacts.ensureAvailable(request);
          if (!available)
            throw new CollectivePeerRuntimeErrorV1(
              "STATE_CONFLICT",
              `authenticated planning artifact is temporarily unavailable: ${request.contentReference}`,
            );
          decision = await options.inbound.process(state.runtime, {
            envelope: inbox.envelope,
            verifiedAt: now.wallTime,
            receivedAt,
          });
          if (
            !decision.accepted &&
            decision.code === "planning_repository_missing"
          )
            throw new CollectivePeerRuntimeErrorV1(
              "STATE_CONFLICT",
              `resolved planning artifact was not committed locally: ${request.contentReference}`,
            );
        }
        if (!decision.accepted) {
          const missingPredecessor = missingInboundPredecessorV1(
            state,
            inbox.envelope,
          );
          if (
            missingPredecessor &&
            isCausalPredecessorRejectionV1(decision.code)
          ) {
            const recovered = options.synchronization
              ? await options.synchronization.recoverPredecessor({
                  scope: this.#scope,
                  state: state.runtime,
                  envelope: inbox.envelope,
                  missingPredecessor,
                  logicalTimeMs: receivedAt,
                })
              : null;
            if (recovered) {
              state = createCollectivePeerNodeStoredStateV1({
                scope: this.#scope,
                outboundSequence: state.outboundSequence,
                runtime: recovered,
                releases: state.releases,
                initialPlanningState: this.#initial.runtime.planning,
              });
              decision = await options.inbound.process(state.runtime, {
                envelope: inbox.envelope,
                verifiedAt: now.wallTime,
                receivedAt,
              });
            }
            if (!decision.accepted)
              throw new CollectivePeerRuntimeErrorV1(
                "STATE_CONFLICT",
                `authenticated inbound evidence is waiting for ${missingPredecessor}`,
              );
          }
        }
        if (
          decision.accepted &&
          !(await this.#checkOwnerContinuityEnvelope(
            state,
            inbox.envelope,
            receivedAt,
          ))
        ) {
          const transitionId = `node.inbound.${shortDigest({
            messageId: inbox.messageId,
          })}`;
          return {
            outcome: "applied" as const,
            transitionId,
            nextState: encodeCollectivePeerNodeStoredStateV1(state),
            journal: [
              {
                entryId: transitionId,
                kind: "node.inbound.rejected",
                reasonCode: "owner_authority_not_current",
              },
            ],
          };
        }
        if (
          decision.accepted &&
          !(await this.#checkRecoveryElectionEnvelope(
            state,
            inbox.envelope,
            receivedAt,
          ))
        ) {
          const transitionId = `node.inbound.${shortDigest({
            messageId: inbox.messageId,
          })}`;
          return {
            outcome: "applied" as const,
            transitionId,
            nextState: encodeCollectivePeerNodeStoredStateV1(state),
            journal: [
              {
                entryId: transitionId,
                kind: "node.inbound.rejected",
                reasonCode: "recovery_election_not_current",
              },
            ],
          };
        }
        const next = createCollectivePeerNodeStoredStateV1({
          scope: this.#scope,
          outboundSequence: state.outboundSequence,
          runtime: decision.state,
          releases: state.releases,
          initialPlanningState: this.#initial.runtime.planning,
        });
        return {
          outcome: "applied" as const,
          transitionId: `node.inbound.${shortDigest({
            messageId: inbox.messageId,
          })}`,
          nextState: encodeCollectivePeerNodeStoredStateV1(next),
          journal: [
            {
              entryId: `node.inbound.${shortDigest({
                messageId: inbox.messageId,
              })}`,
              kind: decision.accepted
                ? "node.inbound.accepted"
                : "node.inbound.rejected",
              ...(decision.accepted ? {} : { reasonCode: decision.code }),
            },
          ],
        };
      },
      deliverOutbox: (outbox, signal) =>
        this.#deliverCurrentOutbox(outbox, signal),
      ...(options.inboxBatchSize === undefined
        ? {}
        : { inboxBatchSize: options.inboxBatchSize }),
      ...(options.outboxBatchSize === undefined
        ? {}
        : { outboxBatchSize: options.outboxBatchSize }),
      ...(options.leaseDurationMs === undefined
        ? {}
        : { leaseDurationMs: options.leaseDurationMs }),
      ...(options.failureRetryAfterMs === undefined
        ? {}
        : { failureRetryAfterMs: options.failureRetryAfterMs }),
      ...(options.onDiagnostic === undefined
        ? {}
        : { onDiagnostic: options.onDiagnostic }),
    });
  }

  async restore(): Promise<CollectivePeerNodeSnapshotV1> {
    const existing = await this.#options.repository.loadSnapshot(
      this.#durableScope,
    );
    if (existing) return this.#snapshot(existing);
    const transitionId = `node.init.${shortDigest(this.#scope)}`;
    const committed = await this.#options.repository.commitLocalTransition({
      scope: this.#durableScope,
      expectedSnapshotRevision: 0,
      transitionId,
      nextState: encodeCollectivePeerNodeStoredStateV1(this.#initial),
      nextStateDescriptor: {
        format: COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT,
        schemaVersion: COLLECTIVE_PEER_NODE_SCHEMA_VERSION,
      },
      journal: [{ entryId: transitionId, kind: "node.initialized" }],
      outbox: [],
    });
    if (committed.committed) {
      if (!committed.snapshot)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          "collective peer node initialization omitted its snapshot",
        );
      return this.#snapshot(committed.snapshot);
    }
    const raced = await this.#options.repository.loadSnapshot(
      this.#durableScope,
    );
    if (raced) return this.#snapshot(raced);
    throw new CollectivePeerRuntimeErrorV1(
      "STATE_CONFLICT",
      `collective peer node initialization failed: ${committed.code}`,
    );
  }

  async receive(
    input: CollectivePeerNodeReceiveInputV1,
  ): Promise<CollectivePeerNodeReceiveOutcomeV1> {
    if (!input || typeof input !== "object" || !input.envelope)
      invalid("a signed Mesh envelope is required");
    await this.restore();
    return this.#options.repository.receive({
      scope: this.#durableScope,
      envelope: input.envelope,
    });
  }

  async runOnce(signal?: AbortSignal): Promise<CollectivePeerNodeRunOutcomeV1> {
    const transport = await this.#worker.runOnce(signal);
    const reconciliation = signal?.aborted
      ? Object.freeze({
          status: "idle" as const,
          durableRevision: (await this.restore()).durableRevision,
        })
      : await this.reconcile();
    return Object.freeze({ transport, reconciliation });
  }

  async start(input: {
    readonly signal: AbortSignal;
    readonly idleDelayMs?: number;
  }): Promise<void> {
    if (!input?.signal) invalid("a node lifecycle signal is required");
    const idleDelayMs = boundedInteger(
      input.idleDelayMs ?? 100,
      "idleDelayMs",
      60_000,
    );
    await this.restore();
    while (!input.signal.aborted) {
      const cycle = await this.runOnce(input.signal);
      if (input.signal.aborted) break;
      if (
        cycle.reconciliation.status === "idle" &&
        cycle.transport.inbox.claimed === 0 &&
        cycle.transport.outbox.claimed === 0
      )
        await abortableDelay(idleDelayMs, input.signal);
    }
  }

  async plan(
    input: CollectivePeerNodePlanInputV1,
  ): Promise<CollectivePeerNodePlanOutcomeV1> {
    if (!input || typeof input !== "object")
      invalid("node plan input is required");
    const agentId = identifier(input.agentId, "agentId");
    const stepId = identifier(input.stepId, "stepId");
    const logicalTimeMs = nonNegativeInteger(
      input.logicalTimeMs,
      "logicalTimeMs",
    );
    if (
      logicalTimeMs < this.#planningRoleValidFromLogicalMs ||
      logicalTimeMs >= this.#planningRoleValidUntilLogicalMs
    )
      invalid("planning role is not valid at the requested logical time");
    const registration = this.#agents.get(agentId);
    if (!registration)
      throw new CollectivePeerRuntimeErrorV1(
        "VALIDATION_ERROR",
        `local planning agent "${agentId}" is not registered`,
      );

    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const snapshot = await this.restore();
      const readiness = await this.#readiness("planning", logicalTimeMs);
      if (!readiness.ready)
        return Object.freeze({
          status: "paused" as const,
          reasonCode: readiness.reasonCode,
          durableRevision: snapshot.durableRevision,
        });
      const planning = snapshot.state.runtime.planning;
      const tenant = input.tenant ?? { tenantId: this.#scope.tenantId };
      if (tenant.tenantId !== this.#scope.tenantId)
        invalid("ephemeral tenant scope does not match the node");
      const outcome = await this.#options.peerRuntime.plan({
        tenant,
        agent: registration.binding,
        missionIntent: planning.missionIntent,
        planView: planning.planView,
        observations: planning.observations,
        allowedInputReferenceDigests: Object.freeze(
          [
            ...new Set(
              planning.observations
                .map(({ contentReferenceDigest }) => contentReferenceDigest)
                .filter(
                  (value): value is NonNullable<typeof value> => value !== null,
                ),
            ),
          ].sort(),
        ),
        stepId,
        logicalTimeMs,
        roleValidFromLogicalMs: this.#planningRoleValidFromLogicalMs,
        roleValidUntilLogicalMs: this.#planningRoleValidUntilLogicalMs,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.credentials === undefined
          ? {}
          : { credentials: input.credentials }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      });
      this.#assertControlBinding(outcome.session.controlBinding);
      if (outcome.status !== "proposed")
        return Object.freeze({
          status: outcome.status,
          reasonCode: outcome.reasonCode,
          durableRevision: snapshot.durableRevision,
        });

      const prepared = await this.#preparePlanTransition(
        snapshot.state,
        outcome.proposal,
        logicalTimeMs,
      );
      const transitionId = `node.plan.${shortDigest({ stepId })}`;
      const committed = await this.#options.repository.commitLocalTransition({
        scope: this.#durableScope,
        expectedSnapshotRevision: snapshot.durableRevision,
        transitionId,
        nextState: encodeCollectivePeerNodeStoredStateV1(prepared.state),
        nextStateDescriptor: {
          format: COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT,
          schemaVersion: COLLECTIVE_PEER_NODE_SCHEMA_VERSION,
        },
        journal: [
          {
            entryId: transitionId,
            kind:
              prepared.status === "offered"
                ? "node.plan.offered"
                : prepared.status === "pending_recipients"
                  ? "node.plan.pending"
                  : "node.plan.recorded",
          },
        ],
        outbox: prepared.outbox,
      });
      if (committed.committed) {
        if (!committed.snapshot)
          throw new CollectivePeerRuntimeErrorV1(
            "STATE_CONFLICT",
            "collective peer node plan commit omitted its snapshot",
          );
        return Object.freeze({
          status: prepared.status,
          proposalDigest: outcome.proposal.proposalDigest,
          fragmentDigest: prepared.fragment?.fragmentDigest ?? null,
          workItemId: prepared.projection?.workItemId ?? null,
          recipientPeerIds: prepared.recipientPeerIds,
          durableRevision: committed.snapshot.revision,
        });
      }
      if (committed.code === "revision_conflict") continue;
      if (committed.code === "transition_conflict") {
        const current = await this.restore();
        const recovered = outcomeFromCommittedPlan(
          current,
          outcome.proposal.proposalDigest,
        );
        if (recovered) return recovered;
      }
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        `collective peer node plan commit failed: ${committed.code}`,
      );
    }
    throw new CollectivePeerRuntimeErrorV1(
      "STATE_CONFLICT",
      "collective peer node plan retry limit was exceeded",
    );
  }

  async execute(
    input: CollectivePeerNodeExecuteInputV1,
  ): Promise<CollectivePeerNodeExecuteOutcomeV1> {
    if (!input || typeof input !== "object")
      invalid("node execution input is required");
    const workItemId = identifier(input.workItemId, "workItemId");
    const stepId = identifier(input.stepId, "stepId");
    const logicalTimeMs = nonNegativeInteger(
      input.logicalTimeMs,
      "logicalTimeMs",
    );
    if (!Array.isArray(input.observations))
      invalid("execution observations must be an array");
    if (!Array.isArray(input.requestedOutputModalities))
      invalid("requestedOutputModalities must be an array");
    const initialSnapshot = await this.restore();
    const existing = releaseForStep(initialSnapshot.state, workItemId, stepId);
    if (existing)
      return Object.freeze({
        status: "committed",
        release: existing,
        durableRevision: initialSnapshot.durableRevision,
      });
    const executionReadiness = await this.#readiness(
      "execution",
      logicalTimeMs,
    );
    if (!executionReadiness.ready)
      return withheldExecution(
        executionReadiness.reasonCode,
        initialSnapshot.durableRevision,
      );
    if (
      logicalTimeMs <
      Math.max(
        initialSnapshot.state.runtime.mesh.coordination.lastLogicalTime,
        initialSnapshot.state.runtime.planning.planView.logicalTimeHighWaterMs,
      )
    )
      invalid("execution logical time is behind the durable node state");

    const initialCurrentLogicalTime = currentLogicalTime(
      initialSnapshot.state,
      logicalTimeMs,
      this.#options.clock.now(),
    );
    const initialAssignment = await this.#deriveExecutionAssignment(
      initialSnapshot.state,
      workItemId,
      initialCurrentLogicalTime,
    );
    if (!initialAssignment)
      return withheldExecution(
        "assignment_not_current",
        initialSnapshot.durableRevision,
      );
    const initialContinuity = await this.#resolveCurrentContinuity(
      initialAssignment,
      initialCurrentLogicalTime,
    );
    if (!initialContinuity)
      return withheldExecution(
        "owner_authority_not_current",
        initialSnapshot.durableRevision,
      );
    if (
      !(await this.#confirmCurrentAssignment(
        initialSnapshot.state,
        initialAssignment,
        initialCurrentLogicalTime,
      ))
    )
      return withheldExecution(
        "assignment_not_confirmed",
        initialSnapshot.durableRevision,
      );
    const releaseId = `node.release.${shortDigest({
      tenantId: this.#scope.tenantId,
      meshId: this.#scope.meshId,
      objectiveId: initialAssignment.execution.objectiveId,
      workItemId: initialAssignment.execution.workItemId,
      workItemRevision: initialAssignment.execution.workItemRevision,
      assignmentAuthorityId: initialAssignment.execution.assignmentAuthorityId,
      assignmentEpoch: initialAssignment.execution.assignmentEpoch,
      stepId,
    })}`;
    const tenant = input.tenant ?? { tenantId: this.#scope.tenantId };
    if (tenant.tenantId !== this.#scope.tenantId)
      invalid("ephemeral tenant scope does not match the node");
    const receivedAward =
      initialSnapshot.state.runtime.mesh.allocation.receivedAwards[
        initialAssignment.execution.awardId
      ];
    const resumeCheckpointId =
      receivedAward?.envelope.payload.resumeCheckpointId;
    if (resumeCheckpointId !== undefined) {
      if (!this.#options.executionCheckpoints)
        return withheldExecution(
          "execution_checkpoint_handoff_unavailable",
          initialSnapshot.durableRevision,
        );
      let artifact;
      try {
        artifact = await this.#options.executionCheckpoints.resolve({
          checkpointId: resumeCheckpointId,
          tenantId: this.#scope.tenantId,
          meshId: this.#scope.meshId,
          policyDomainId: this.#scope.policyDomainId,
          objectiveId: initialAssignment.execution.objectiveId,
          workItemId: initialAssignment.execution.workItemId,
          workItemRevision: initialAssignment.execution.workItemRevision,
          previousAssignmentEpoch:
            initialAssignment.execution.assignmentEpoch - 1,
          ...(input.signal ? { signal: input.signal } : {}),
        });
      } catch {
        artifact = null;
      }
      if (!artifact)
        return withheldExecution(
          "execution_checkpoint_not_resolved",
          initialSnapshot.durableRevision,
        );
      try {
        await this.#options.peerRuntime.importExecutionCheckpoint({
          tenant,
          agent: initialAssignment.agent.binding,
          assignment: initialAssignment.adaptiveRole,
          transfer: artifact.transfer,
          ...(input.signal ? { signal: input.signal } : {}),
          ...(input.credentials ? { credentials: input.credentials } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        });
      } catch {
        return withheldExecution(
          "execution_checkpoint_import_failed",
          initialSnapshot.durableRevision,
        );
      }
    }
    const executed = await this.#options.peerRuntime.execute({
      tenant,
      agent: initialAssignment.agent.binding,
      assignment: initialAssignment.adaptiveRole,
      stepId,
      logicalTimeMs,
      observations: input.observations,
      input: input.input,
      requestedOutputModalities: input.requestedOutputModalities,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.credentials === undefined
        ? {}
        : { credentials: input.credentials }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    });
    if (executed.status !== "released")
      return Object.freeze({
        status: executed.status,
        reasonCode: executed.reasonCode,
        durableRevision: initialSnapshot.durableRevision,
      });
    this.#assertControlBinding(executed.session.controlBinding);

    let checkpointDigest = executed.step.result.checkpoint
      ? await computeMeshDurableValueDigest(
          executed.step.result.checkpoint as unknown as MeshJsonValue,
        )
      : null;
    let checkpointReference =
      executed.step.result.checkpoint?.stateReference ?? null;
    if (
      executed.step.result.checkpoint !== null &&
      this.#options.executionCheckpoints
    ) {
      try {
        const transfer =
          await this.#options.peerRuntime.exportExecutionCheckpoint(
            executed.session.sessionId,
            {
              ...(input.signal ? { signal: input.signal } : {}),
              tenant,
              ...(input.credentials ? { credentials: input.credentials } : {}),
              ...(input.metadata ? { metadata: input.metadata } : {}),
            },
          );
        const certificate = await this.#options.executionCheckpoints.publish({
          transfer,
          objectiveId: initialAssignment.execution.objectiveId,
          workItemId: initialAssignment.execution.workItemId,
          workItemRevision: initialAssignment.execution.workItemRevision,
          assignmentEpoch: initialAssignment.execution.assignmentEpoch,
          assignmentAuthorityId:
            initialAssignment.execution.assignmentAuthorityId,
          fencingToken: initialAssignment.execution.fencingToken,
          workContractDigest:
            initialAssignment.adaptiveRole.workContract.workContractDigest,
          roleBindingDigest:
            initialAssignment.adaptiveRole.roleBinding.roleBindingDigest,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        checkpointDigest = certificate.artifactDigest;
        checkpointReference = certificate.contentReference;
      } catch {
        return withheldExecution(
          "execution_checkpoint_replication_failed",
          initialSnapshot.durableRevision,
        );
      }
    }

    const actionResolutions: CollectivePeerNodeActionResolutionV1[] = [];
    for (const proposal of executed.step.result.actionProposals) {
      const effectSnapshot = await this.restore();
      const effectLogicalTime = currentLogicalTime(
        effectSnapshot.state,
        logicalTimeMs,
        this.#options.clock.now(),
      );
      const effectAssignment = await this.#deriveExecutionAssignment(
        effectSnapshot.state,
        workItemId,
        effectLogicalTime,
      );
      if (
        !effectAssignment ||
        !sameExecutionAssignment(effectAssignment, initialAssignment)
      )
        return withheldExecution(
          "assignment_changed_before_action",
          effectSnapshot.durableRevision,
        );
      const effectContinuity = await this.#resolveCurrentContinuity(
        effectAssignment,
        effectLogicalTime,
      );
      if (
        !effectContinuity ||
        !sameContinuityHead(effectContinuity, initialContinuity)
      )
        return withheldExecution(
          "owner_authority_changed_before_action",
          effectSnapshot.durableRevision,
        );
      const effectConfirmation = await this.#confirmCurrentAssignment(
        effectSnapshot.state,
        effectAssignment,
        effectLogicalTime,
      );
      if (!effectConfirmation)
        return withheldExecution(
          "assignment_not_confirmed_before_action",
          effectSnapshot.durableRevision,
        );
      const effectId = `node.action.${shortDigest({
        tenantId: this.#scope.tenantId,
        meshId: this.#scope.meshId,
        objectiveId: effectAssignment.execution.objectiveId,
        workItemId: effectAssignment.execution.workItemId,
        workItemRevision: effectAssignment.execution.workItemRevision,
        stepId,
        actionId: proposal.actionId,
      })}`;
      const expectedDigest = await computeMeshDurableValueDigest(
        proposal as unknown as MeshJsonValue,
      );
      let resolution: CollectivePeerNodeActionResolutionV1;
      try {
        resolution = normalizeActionResolution(
          await this.#options.actions.execute({
            effectId,
            workContract: effectAssignment.adaptiveRole.workContract,
            roleBinding: effectAssignment.adaptiveRole.roleBinding,
            continuityBinding: effectContinuity,
            assignmentConfirmation: effectConfirmation,
            proposal,
            logicalTimeMs: effectLogicalTime,
          }),
          proposal.actionId,
          expectedDigest,
          effectId,
        );
      } catch {
        return withheldExecution(
          "action_gateway_unavailable",
          initialSnapshot.durableRevision,
        );
      }
      actionResolutions.push(resolution);
      if (resolution.status !== "dispatched")
        return withheldExecution(
          resolution.reasonCode ?? `action_${resolution.status}`,
          initialSnapshot.durableRevision,
        );
    }

    const stepRecordDigest = await computeMeshDurableValueDigest(
      executed.step as unknown as MeshJsonValue,
    );
    const resultDigest = await computeMeshDurableValueDigest({
      step: executed.step as unknown as MeshJsonValue,
      actions: actionResolutions as unknown as MeshJsonValue,
    });
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const snapshot = await this.restore();
      const recovered = releaseForStep(snapshot.state, workItemId, stepId);
      if (recovered)
        return Object.freeze({
          status: "committed",
          release: recovered,
          durableRevision: snapshot.durableRevision,
        });
      const commitLogicalTime = currentLogicalTime(
        snapshot.state,
        logicalTimeMs,
        this.#options.clock.now(),
      );
      const assignment = await this.#deriveExecutionAssignment(
        snapshot.state,
        workItemId,
        commitLogicalTime,
      );
      if (
        !assignment ||
        !sameExecutionAssignment(assignment, initialAssignment)
      )
        return withheldExecution(
          "assignment_changed_before_release",
          snapshot.durableRevision,
        );
      const continuity = await this.#resolveCurrentContinuity(
        assignment,
        commitLogicalTime,
      );
      if (!continuity || !sameContinuityHead(continuity, initialContinuity))
        return withheldExecution(
          "owner_authority_changed_before_release",
          snapshot.durableRevision,
        );
      const assignmentConfirmation = await this.#confirmCurrentAssignment(
        snapshot.state,
        assignment,
        commitLogicalTime,
      );
      if (!assignmentConfirmation)
        return withheldExecution(
          "assignment_not_confirmed_before_release",
          snapshot.durableRevision,
        );
      const prepared = await this.#prepareExecutionPublication({
        current: snapshot.state,
        assignment,
        continuity,
        assignmentConfirmation,
        releaseId,
        stepId,
        logicalTimeMs: commitLogicalTime,
        sessionId: executed.session.sessionId,
        sessionRevision: executed.session.revision,
        stepSequence: executed.step.stepSequence,
        stepRecordDigest,
        checkpoint: executed.step.result.checkpoint,
        checkpointDigest,
        checkpointReference,
        actions: Object.freeze(actionResolutions),
        resultDigest,
      });
      const transitionId = `node.execute.${shortDigest({ releaseId })}`;
      const committed = await this.#options.repository.commitLocalTransition({
        scope: this.#durableScope,
        expectedSnapshotRevision: snapshot.durableRevision,
        transitionId,
        nextState: encodeCollectivePeerNodeStoredStateV1(prepared.state),
        nextStateDescriptor: {
          format: COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT,
          schemaVersion: COLLECTIVE_PEER_NODE_SCHEMA_VERSION,
        },
        journal: [
          {
            entryId: transitionId,
            kind: "node.execution.committed",
          },
        ],
        outbox: prepared.outbox,
      });
      if (committed.committed) {
        if (!committed.snapshot)
          throw new CollectivePeerRuntimeErrorV1(
            "STATE_CONFLICT",
            "collective peer node execution omitted its snapshot",
          );
        return Object.freeze({
          status: "committed",
          release: prepared.release,
          durableRevision: committed.snapshot.revision,
        });
      }
      if (committed.code === "revision_conflict") continue;
      if (committed.code === "transition_conflict") {
        const current = await this.restore();
        const retained = releaseForStep(current.state, workItemId, stepId);
        if (retained)
          return Object.freeze({
            status: "committed",
            release: retained,
            durableRevision: current.durableRevision,
          });
      }
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        `collective peer node execution commit failed: ${committed.code}`,
      );
    }
    throw new CollectivePeerRuntimeErrorV1(
      "STATE_CONFLICT",
      "collective peer node execution retry limit was exceeded",
    );
  }

  async reconcile(): Promise<CollectivePeerNodeReconcileOutcomeV1> {
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const snapshot = await this.restore();
      const now = normalizeClockReading(this.#options.clock.now());
      const reconciliationLogicalTime = currentLogicalTime(
        snapshot.state,
        now.logicalTimeMs,
        now,
      );
      const readiness = await this.#readiness(
        "bidding",
        reconciliationLogicalTime,
      );
      if (!readiness.ready)
        return Object.freeze({
          status: "idle" as const,
          durableRevision: snapshot.durableRevision,
        });
      const prepared = await this.#prepareReconciliation(
        snapshot.state,
        now.wallTime,
        reconciliationLogicalTime,
      );
      if (!prepared)
        return Object.freeze({
          status: "idle",
          durableRevision: snapshot.durableRevision,
        });
      const transitionId = `node.reconcile.${shortDigest({
        status: prepared.status,
        recordId: prepared.recordId,
      })}`;
      const committed = await this.#options.repository.commitLocalTransition({
        scope: this.#durableScope,
        expectedSnapshotRevision: snapshot.durableRevision,
        transitionId,
        nextState: encodeCollectivePeerNodeStoredStateV1(prepared.state),
        nextStateDescriptor: {
          format: COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT,
          schemaVersion: COLLECTIVE_PEER_NODE_SCHEMA_VERSION,
        },
        journal: [
          {
            entryId: transitionId,
            kind: `node.reconcile.${prepared.status}`,
          },
        ],
        outbox: prepared.outbox,
      });
      if (committed.committed) {
        if (!committed.snapshot)
          throw new CollectivePeerRuntimeErrorV1(
            "STATE_CONFLICT",
            "collective peer node reconciliation omitted its snapshot",
          );
        return Object.freeze({
          status: prepared.status,
          recordId: prepared.recordId,
          durableRevision: committed.snapshot.revision,
        });
      }
      if (committed.code === "revision_conflict") continue;
      if (committed.code === "transition_conflict") {
        const current = await this.restore();
        return Object.freeze({
          status: prepared.status,
          recordId: prepared.recordId,
          durableRevision: current.durableRevision,
        });
      }
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        `collective peer node reconciliation failed: ${committed.code}`,
      );
    }
    throw new CollectivePeerRuntimeErrorV1(
      "STATE_CONFLICT",
      "collective peer node reconciliation retry limit was exceeded",
    );
  }

  async #readiness(
    operation: CollectivePeerNodeSynchronizationOperationV1,
    logicalTimeMs: number,
  ): Promise<{ readonly ready: boolean; readonly reasonCode: string }> {
    if (!this.#options.synchronization)
      return Object.freeze({
        ready: true,
        reasonCode: "synchronization_not_configured",
      });
    try {
      const decision = await this.#options.synchronization.readiness({
        scope: this.#scope,
        operation,
        logicalTimeMs,
      });
      return decision?.ready === true
        ? Object.freeze({
            ready: true,
            reasonCode: decision.reasonCode || "sync_ready",
          })
        : Object.freeze({
            ready: false,
            reasonCode: decision?.reasonCode || "sync_readiness_unavailable",
          });
    } catch {
      return Object.freeze({
        ready: false,
        reasonCode: "sync_readiness_unavailable",
      });
    }
  }

  async #deriveExecutionAssignment(
    current: CollectivePeerNodeStoredStateV1,
    workItemId: string,
    logicalTimeMs: number,
  ): Promise<DerivedExecutionAssignmentV1 | null> {
    const mesh = current.runtime.mesh;
    const execution = Object.values(mesh.allocation.executionHeads).find(
      (candidate) =>
        candidate.workItemId === workItemId &&
        candidate.assigneePeerId === this.#scope.peerId &&
        candidate.phase === "active" &&
        candidate.leaseExpiresAtLogical > logicalTimeMs &&
        candidate.workDeadlineAt > logicalTimeMs,
    );
    if (!execution) return null;
    const fenceHead = Object.values(mesh.allocation.assignmentFenceHeads).find(
      (candidate) =>
        candidate.workItemId === execution.workItemId &&
        candidate.workItemRevision === execution.workItemRevision &&
        candidate.ownerPeerId === execution.ownerPeerId &&
        candidate.ownerEpoch === execution.ownerEpoch &&
        candidate.assignmentEpoch === execution.assignmentEpoch &&
        candidate.assignmentAuthorityId === execution.assignmentAuthorityId &&
        candidate.fencingToken === execution.fencingToken &&
        candidate.assigneePeerId === this.#scope.peerId &&
        candidate.phase === "active",
    );
    if (!fenceHead) return null;
    const award = mesh.allocation.receivedAwards[execution.awardId];
    const response =
      mesh.allocation.localAssignmentResponses[execution.awardId];
    const offer = award
      ? mesh.allocation.receivedOffers[award.offerId]
      : undefined;
    if (
      !award ||
      award.status !== "accepted" ||
      !response ||
      response.kind !== "work.accept" ||
      response.responseId !== execution.acceptanceId ||
      !offer
    )
      return null;
    const objective = historicalObjectiveProjection(
      mesh,
      execution.objectiveId,
      execution.objectiveRevision,
    );
    if (!objective || objective.expiresAt <= logicalTimeMs) return null;
    const planning = current.runtime.planning;
    const mapping = planning.planView.workMappings.find(
      (candidate) =>
        candidate.workItemId === workItemId &&
        candidate.workItemRevision === execution.workItemRevision,
    );
    const fragment = mapping
      ? planning.planView.fragments.find(
          (candidate) =>
            candidate.fragmentDigest === mapping.fragmentDigest &&
            candidate.status === "offered",
        )
      : undefined;
    if (!mapping || !fragment) return null;
    const inputReference = offer.envelope.payload.inputReference;
    if (typeof inputReference !== "string")
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "assigned planning Work has no fragment reference",
      );
    const repositoryRecord = await this.#options.fragments.get(inputReference);
    if (!repositoryRecord)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "assigned planning fragment evidence is unavailable",
      );
    const rawExtension =
      offer.envelope.extensions?.[PLANNING_WORK_EXTENSION_KEY_V1];
    const extension = validatePlanningWorkExtensionV1(rawExtension);
    const agent = [
      ...(await this.#filterCapabilityStateLocalAgents({
        operation: "assignment_acceptance",
        objectiveId: execution.objectiveId,
        workItemId: execution.workItemId,
        workItemRevision: execution.workItemRevision,
        requiredCapabilityKeys: offer.envelope.payload.requiredCapabilityKeys,
        logicalTimeMs,
      })),
    ].sort((left, right) =>
      left.binding.agentId < right.binding.agentId
        ? -1
        : left.binding.agentId > right.binding.agentId
          ? 1
          : 0,
    )[0];
    if (!agent) return null;
    const capabilities = Object.values(mesh.discovery.capabilities);
    if (
      offer.envelope.payload.requiredCapabilityKeys.some(
        (key) =>
          !capabilities.some(
            (candidate) =>
              candidate.ownerPeerId === this.#scope.peerId &&
              candidate.instanceId === this.#scope.instanceId &&
              candidate.capabilityKey === key &&
              candidate.status === "active" &&
              candidate.expiresAt > logicalTimeMs,
          ),
      )
    )
      return null;
    const workItem = remoteWorkItem(objective, offer, execution);
    const source: MeshWorkContractSourceV1 = Object.freeze({
      workContractId: `node.work-contract.${shortDigest({
        workItemId,
        assignmentAuthorityId: execution.assignmentAuthorityId,
        assignmentEpoch: execution.assignmentEpoch,
      })}`,
      identity: mesh.coordination.identity,
      objective,
      workItem,
      execution,
      fenceHead,
      mandate: this.#options.authority.mandate,
      roleKey: fragment.roleKey,
      trustPolicyId: this.#options.authority.trustPolicyId,
      inferencePolicyId: this.#options.authority.inferencePolicyId,
      maximumActionBudgetUnits:
        this.#options.authority.maximumActionBudgetUnits,
      createdAtLogicalMs: response.preparedAt,
    });
    const adaptiveRole = createPlanningAdaptiveRoleV1({
      source,
      missionIntent: planning.missionIntent,
      planView: planning.planView,
      fragment,
      repositoryRecord,
      extension,
      roleBindingId: `node.role.${shortDigest({
        workItemId,
        assignmentAuthorityId: execution.assignmentAuthorityId,
        assignmentEpoch: execution.assignmentEpoch,
      })}`,
      targetStatus: "assigned",
    });
    return Object.freeze({
      source,
      adaptiveRole,
      agent,
      execution,
      fenceHead,
      offer,
      fragment,
      mapping,
      repositoryRecord,
      extension,
    });
  }

  async #resolveCurrentContinuity(
    assignment: DerivedExecutionAssignmentV1,
    logicalTimeMs: number,
  ): Promise<MeshAuthorityCurrentBindingV1 | null> {
    try {
      const expectedScopeKey = meshAuthorityScopeKeyV1({
        schemaVersion: 1,
        kind: "work_owner",
        tenantId: this.#scope.tenantId,
        meshId: this.#scope.meshId,
        objectiveId: assignment.adaptiveRole.workContract.objective.objectiveId,
        workItemId: assignment.adaptiveRole.workContract.assignment.workItemId,
      });
      const resolved = await this.#options.continuity.resolve({
        workContract: assignment.adaptiveRole.workContract,
        logicalTimeMs,
      });
      if (
        !resolved ||
        resolved.schemaVersion !== 1 ||
        resolved.scopeKey !== expectedScopeKey ||
        !Number.isSafeInteger(resolved.generation) ||
        resolved.generation < 1 ||
        typeof resolved.headDigest !== "string" ||
        typeof resolved.fencingToken !== "string" ||
        resolved.holder.peerId !== assignment.offer.envelope.sender.peerId ||
        resolved.holder.instanceId !==
          assignment.offer.envelope.sender.instanceId ||
        resolved.holder.keyId !== assignment.offer.envelope.proof.keyId
      )
        return null;
      const binding: MeshAuthorityCurrentBindingV1 = Object.freeze({
        schemaVersion: 1,
        scopeKey: resolved.scopeKey,
        generation: resolved.generation,
        holder: Object.freeze({
          schemaVersion: 1,
          peerId: resolved.holder.peerId,
          instanceId: resolved.holder.instanceId,
          keyId: resolved.holder.keyId,
        }),
        headDigest: resolved.headDigest,
        fencingToken: resolved.fencingToken,
        logicalTimeMs,
      });
      const decision = await this.#options.continuity.check(binding);
      return decision.current ? binding : null;
    } catch {
      return null;
    }
  }

  async #resolveLocalOwnerContinuity(
    objectiveId: string,
    workItemId: string,
    logicalTimeMs: number,
  ): Promise<MeshAuthorityCurrentBindingV1 | null> {
    const scope = Object.freeze({
      schemaVersion: 1,
      kind: "work_owner" as const,
      tenantId: this.#scope.tenantId,
      meshId: this.#scope.meshId,
      objectiveId,
      workItemId,
    });
    const scopeKey = meshAuthorityScopeKeyV1(scope);
    const resolved = await this.#options.continuity.resolveScope({
      scope,
      scopeKey,
      logicalTimeMs,
    });
    if (
      !resolved ||
      resolved.schemaVersion !== 1 ||
      resolved.scopeKey !== scopeKey ||
      !Number.isSafeInteger(resolved.generation) ||
      resolved.generation < 1 ||
      typeof resolved.headDigest !== "string" ||
      typeof resolved.fencingToken !== "string" ||
      resolved.holder.peerId !== this.#scope.peerId ||
      resolved.holder.instanceId !== this.#scope.instanceId ||
      resolved.holder.keyId !== this.#options.signing.keyId
    )
      return null;
    const binding: MeshAuthorityCurrentBindingV1 = Object.freeze({
      schemaVersion: 1,
      scopeKey,
      generation: resolved.generation,
      holder: Object.freeze({ ...resolved.holder }),
      headDigest: resolved.headDigest,
      fencingToken: resolved.fencingToken,
      logicalTimeMs,
    });
    const decision = await this.#options.continuity.check(binding);
    return decision.current ? binding : null;
  }

  async #checkOwnerContinuityEnvelope(
    state: CollectivePeerNodeStoredStateV1,
    envelope: SignedMeshEnvelope,
    logicalTimeMs: number,
  ): Promise<boolean> {
    const payload = envelope.payload;
    let objectiveId: string;
    let workItemId: string;
    let logicalOwnerPeerId: string;
    if (
      payload.type === "work.offer" ||
      payload.type === "work.award" ||
      payload.type === "work.cancel" ||
      (payload.type === "work.release" && payload.releaseAuthority === "owner")
    ) {
      objectiveId = payload.objectiveId;
      workItemId = payload.workItemId;
      logicalOwnerPeerId = payload.ownerPeerId;
    } else if (payload.type === "lease.certificate") {
      const proposal =
        state.runtime.mesh.allocation.takeoverProposals[
          payload.takeoverProposalId
        ]?.envelope.payload;
      if (!proposal) return false;
      objectiveId = proposal.objectiveId;
      workItemId = proposal.workItemId;
      logicalOwnerPeerId = proposal.ownerPeerId;
    } else {
      return true;
    }
    const embedded = parseOwnerContinuityExtension(
      envelope.extensions?.[COLLECTIVE_PEER_OWNER_CONTINUITY_EXTENSION_V1],
    );
    const expectedScopeKey = meshAuthorityScopeKeyV1({
      schemaVersion: 1,
      kind: "work_owner",
      tenantId: envelope.tenantId,
      meshId: envelope.meshId,
      objectiveId,
      workItemId,
    });
    if (
      !embedded ||
      embedded.scopeKey !== expectedScopeKey ||
      embedded.logicalTimeMs > logicalTimeMs ||
      logicalOwnerPeerId !== envelope.sender.peerId ||
      embedded.holder.peerId !== envelope.sender.peerId ||
      embedded.holder.instanceId !== envelope.sender.instanceId ||
      embedded.holder.keyId !== envelope.proof.keyId
    )
      return false;
    const decision = await this.#options.continuity.check(
      Object.freeze({
        ...embedded,
        holder: Object.freeze({ ...embedded.holder }),
        logicalTimeMs,
      }),
    );
    return decision.current;
  }

  async #checkRecoveryElectionEnvelope(
    state: CollectivePeerNodeStoredStateV1,
    envelope: SignedMeshEnvelope,
    logicalTimeMs: number,
  ): Promise<boolean> {
    if (envelope.payload.type !== "lease.certificate") return true;
    const proposal =
      state.runtime.mesh.allocation.takeoverProposals[
        envelope.payload.takeoverProposalId
      ]?.envelope.payload;
    const embedded = parseRecoveryElectionExtension(
      envelope.extensions?.[COLLECTIVE_PEER_RECOVERY_ELECTION_EXTENSION_V1],
    );
    if (!proposal || !embedded) return false;
    const expected = await this.#resolveRecoveryElection(
      state.runtime.mesh,
      proposal,
      logicalTimeMs,
    );
    if (!expected)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "threshold-certified recovery election is unavailable",
      );
    return (
      embedded.selectedProposalId === proposal.takeoverProposalId &&
      sameRecoveryElectionDecision(embedded, expected)
    );
  }

  async #confirmCurrentAssignment(
    current: CollectivePeerNodeStoredStateV1,
    assignment: DerivedExecutionAssignmentV1,
    logicalTimeMs: number,
  ): Promise<CollectivePeerNodeAssignmentConfirmationV1 | null> {
    if (
      !(await this.#readiness("assignment_confirmation", logicalTimeMs)).ready
    )
      return null;
    const mesh = current.runtime.mesh;
    const lease =
      mesh.allocation.leaseHeads[assignment.execution.executionScopeKey];
    const response =
      mesh.allocation.localAssignmentResponses[assignment.execution.awardId];
    const policy = historicalObjectivePolicy(
      mesh,
      assignment.execution.objectiveId,
      assignment.execution.objectiveRevision,
    );
    if (
      !lease ||
      lease.status !== "active" ||
      !policy ||
      lease.assignmentAuthorityId !==
        assignment.execution.assignmentAuthorityId ||
      lease.assignmentEpoch !== assignment.execution.assignmentEpoch ||
      lease.fencingToken !== assignment.execution.fencingToken ||
      lease.currentLeaseExpiresAt !== assignment.execution.leaseExpiresAt
    )
      return null;
    const eligibleWitnessPeerIds = recoveryWitnessPeerIds(
      policy.recoveryWitnessPeerIds,
      assignment.execution.ownerPeerId,
      assignment.execution.assigneePeerId,
      policy.recoveryWitnessThreshold,
    );
    const value = await this.#options.assignmentConfirmation.confirm({
      workContract: assignment.adaptiveRole.workContract,
      acceptanceMessageId: assignment.execution.acceptanceMessageId,
      latestLeaseRenewalId: lease.latestLeaseRenewalId ?? null,
      eligibleWitnessPeerIds,
      recoveryWitnessThreshold: policy.recoveryWitnessThreshold,
      logicalTimeMs,
    });
    if (!value || typeof value !== "object") return null;
    const witnessPeerIds = value.confirmedWitnessPeerIds;
    if (
      value.schemaVersion !== 1 ||
      !IDENTIFIER.test(value.confirmationId) ||
      value.ownerPeerId !== assignment.execution.ownerPeerId ||
      value.acceptanceId !== assignment.execution.acceptanceId ||
      value.assignmentAuthorityId !==
        assignment.execution.assignmentAuthorityId ||
      value.assignmentEpoch !== assignment.execution.assignmentEpoch ||
      value.fencingToken !== assignment.execution.fencingToken ||
      value.leaseRenewalId !== (lease.latestLeaseRenewalId ?? null) ||
      value.confirmedLeaseExpiresAt !== lease.currentLeaseExpiresAt ||
      !Array.isArray(witnessPeerIds) ||
      new Set(witnessPeerIds).size !== witnessPeerIds.length ||
      witnessPeerIds.length < policy.recoveryWitnessThreshold ||
      witnessPeerIds.some(
        (peerId) =>
          typeof peerId !== "string" ||
          !eligibleWitnessPeerIds.includes(peerId),
      ) ||
      !Number.isSafeInteger(value.confirmedAtLogicalMs) ||
      !response ||
      response.kind !== "work.accept" ||
      value.confirmedAtLogicalMs < response.preparedAt ||
      value.confirmedAtLogicalMs > logicalTimeMs ||
      logicalTimeMs >= lease.currentLeaseExpiresAtLogical
    )
      return null;
    return Object.freeze({
      ...value,
      confirmedWitnessPeerIds: Object.freeze([...witnessPeerIds].sort()),
    });
  }

  async #prepareExecutionPublication(input: {
    readonly current: CollectivePeerNodeStoredStateV1;
    readonly assignment: DerivedExecutionAssignmentV1;
    readonly continuity: MeshAuthorityCurrentBindingV1;
    readonly assignmentConfirmation: CollectivePeerNodeAssignmentConfirmationV1;
    readonly releaseId: string;
    readonly stepId: string;
    readonly logicalTimeMs: number;
    readonly sessionId: string;
    readonly sessionRevision: number;
    readonly stepSequence: number;
    readonly stepRecordDigest: string;
    readonly checkpoint: PortableAgentCheckpointV1 | null;
    readonly checkpointDigest: string | null;
    readonly checkpointReference: string | null;
    readonly actions: readonly CollectivePeerNodeActionResolutionV1[];
    readonly resultDigest: string;
  }): Promise<{
    readonly state: CollectivePeerNodeStoredStateV1;
    readonly release: CollectivePeerNodeExecutionReleaseV1;
    readonly outbox: readonly MeshDurableOutboundDraft[];
  }> {
    const { assignment } = input;
    let planning = input.current.runtime.planning;
    planning = applyPlanning(planning, {
      schemaVersion: 1,
      kind: "fragment.assignment.observe",
      expectedStateDigest: null,
      fragmentId: assignment.fragment.fragmentId,
      previousFragmentDigest: assignment.fragment.fragmentDigest,
      expectedWorkMapping: assignment.mapping,
      roleBinding: assignment.adaptiveRole.roleBinding,
    });
    const assignedFragment = planning.planView.fragments.find(
      (candidate) =>
        candidate.fragmentDigest ===
        assignment.adaptiveRole.roleBinding.fragmentDigest,
    );
    const assignedMapping = assignedFragment
      ? planning.planView.workMappings.find(
          (candidate) =>
            candidate.fragmentDigest === assignedFragment.fragmentDigest,
        )
      : undefined;
    if (!assignedFragment || !assignedMapping)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "planning assignment transition did not retain its Work mapping",
      );
    const executingRole = createPlanningAdaptiveRoleV1({
      source: assignment.source,
      missionIntent: planning.missionIntent,
      planView: planning.planView,
      fragment: assignedFragment,
      repositoryRecord: assignment.repositoryRecord,
      extension: assignment.extension,
      roleBindingId: `node.role.execution.${shortDigest({
        workContractDigest:
          assignment.adaptiveRole.workContract.workContractDigest,
        assignedRoleBindingDigest:
          assignment.adaptiveRole.roleBinding.roleBindingDigest,
      })}`,
      targetStatus: "executing",
    });
    planning = applyPlanning(planning, {
      schemaVersion: 1,
      kind: "fragment.execution.observe",
      expectedStateDigest: null,
      fragmentId: assignedFragment.fragmentId,
      previousFragmentDigest: assignedFragment.fragmentDigest,
      previousRoleBindingDigest:
        assignment.adaptiveRole.roleBinding.roleBindingDigest,
      roleBinding: executingRole.roleBinding,
    });
    const executingFragment = planning.planView.fragments.find(
      (candidate) =>
        candidate.fragmentDigest === executingRole.roleBinding.fragmentDigest,
    );
    const executingMapping = executingFragment
      ? planning.planView.workMappings.find(
          (candidate) =>
            candidate.fragmentDigest === executingFragment.fragmentDigest,
        )
      : undefined;
    if (!executingFragment || !executingMapping)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "planning execution transition did not retain its Work mapping",
      );
    if (input.logicalTimeMs > planning.planView.logicalTimeHighWaterMs)
      planning = applyPlanning(planning, {
        schemaVersion: 1,
        kind: "logical-time.advance",
        expectedStateDigest: null,
        logicalTimeMs: input.logicalTimeMs,
      });
    planning = applyPlanning(planning, {
      schemaVersion: 1,
      kind: "fragment.terminal.observe",
      expectedStateDigest: null,
      fragmentId: executingFragment.fragmentId,
      previousFragmentDigest: executingFragment.fragmentDigest,
      status: "completed",
      expectedWorkMapping: executingMapping,
      expectedRoleBindingDigest: executingRole.roleBinding.roleBindingDigest,
      transitionedAtLogicalMs: input.logicalTimeMs,
    });

    const now = normalizeClockReading(this.#options.clock.now());
    const expiresAt = earlierTimestamp(
      assignment.execution.leaseExpiresAt,
      assignment.execution.workDeadline,
    );
    if (new Date(now.wallTime).getTime() >= new Date(expiresAt).getTime())
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "assignment expired before execution evidence could be committed",
      );
    const authority = executionAuthority(assignment.execution);
    let mesh = input.current.runtime.mesh;
    let outboundSequence = input.current.outboundSequence;
    const outbox: MeshDurableOutboundDraft[] = [];
    let checkpointId: string | null = null;
    let checkpointMessageId: string | null = null;
    let checkpointEffectId: string | null = null;
    if (input.checkpoint) {
      if (!input.checkpointDigest)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          "portable checkpoint digest is missing",
        );
      const checkpointSequence =
        (assignment.execution.latestCheckpointSequence ?? 0) + 1;
      checkpointId = `node.checkpoint.${shortDigest({
        releaseId: input.releaseId,
        checkpointSequence,
      })}`;
      const checkpointPayload: WorkCheckpointPayload = {
        type: "work.checkpoint",
        ...authority,
        checkpointId,
        checkpointSequence,
        ...(assignment.execution.latestCheckpointId === undefined
          ? {}
          : {
              previousCheckpointId: assignment.execution.latestCheckpointId,
            }),
        checkpointDigest: input.checkpointDigest,
        checkpointReference:
          input.checkpointReference ?? input.checkpoint.stateReference,
      };
      outboundSequence += 1;
      checkpointMessageId = meshMessageId({
        kind: "work.checkpoint",
        releaseId: input.releaseId,
      });
      const envelope = await this.#signExecutionEnvelope({
        payload: checkpointPayload,
        messageId: checkpointMessageId,
        sequence: outboundSequence,
        sentAt: now.wallTime,
        expiresAt,
        causationId: assignment.execution.acceptanceMessageId,
        ownerPeerId: assignment.execution.ownerPeerId,
      });
      const checkpointed = evaluateMeshAllocationCommand(
        allocationRuntime(mesh),
        {
          kind: "allocation.execution",
          preparedAt: input.logicalTimeMs,
          envelope,
        },
        now.wallTime,
        input.logicalTimeMs,
      );
      if (!checkpointed.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `local checkpoint was rejected: ${checkpointed.code}`,
        );
      mesh = createMeshAllocationInboundRuntimeState(
        checkpointed.state.coordination,
        checkpointed.state.discovery,
        checkpointed.state.objectives,
        checkpointed.state.allocation,
        mesh.inbound,
      );
      checkpointEffectId = `node.checkpoint.${shortDigest({
        releaseId: input.releaseId,
        effect: true,
      })}`;
      outbox.push({
        effectId: checkpointEffectId,
        targetPeerId: assignment.execution.ownerPeerId,
        envelope,
      });
      const objectivePolicy = historicalObjectivePolicy(
        mesh,
        assignment.execution.objectiveId,
        assignment.execution.objectiveRevision,
      );
      if (!objectivePolicy)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          "execution Objective policy is unavailable for witness publication",
        );
      for (const witnessPeerId of recoveryWitnessPeerIds(
        objectivePolicy.recoveryWitnessPeerIds,
        assignment.execution.ownerPeerId,
        assignment.execution.assigneePeerId,
        objectivePolicy.recoveryWitnessThreshold,
      )) {
        outboundSequence += 1;
        const witnessEnvelope = await this.#signWitnessEnvelope({
          payload: checkpointPayload,
          messageId: meshMessageId({
            kind: "work.checkpoint.witness",
            checkpointId,
            witnessPeerId,
          }),
          sequence: outboundSequence,
          sentAt: now.wallTime,
          expiresAt,
          causationId: witnessAcceptanceMessageId(
            assignment.execution.acceptanceId,
            witnessPeerId,
          ),
          witnessPeerId,
        });
        outbox.push({
          effectId: `node.witness.checkpoint.${shortDigest({
            checkpointId,
            witnessPeerId,
          })}`,
          targetPeerId: witnessPeerId,
          dependsOnEffectId: witnessAcceptanceEffectId(
            assignment.execution.acceptanceId,
            witnessPeerId,
          ),
          envelope: witnessEnvelope,
        });
      }
    }

    const resultId = `node.result.${shortDigest({
      releaseId: input.releaseId,
    })}`;
    const resultPayload: WorkResultPayload = {
      type: "work.result",
      ...authority,
      resultId,
      resultDigest: input.resultDigest,
      ...(checkpointId === null ? {} : { checkpointId }),
      resultReference: `urn:agentplat:collective-runtime:release:${input.releaseId}`,
    };
    outboundSequence += 1;
    const resultMessageId = meshMessageId({
      kind: "work.result",
      releaseId: input.releaseId,
    });
    const resultEnvelope = await this.#signExecutionEnvelope({
      payload: resultPayload,
      messageId: resultMessageId,
      sequence: outboundSequence,
      sentAt: now.wallTime,
      expiresAt,
      causationId:
        checkpointMessageId ?? assignment.execution.acceptanceMessageId,
      ownerPeerId: assignment.execution.ownerPeerId,
    });
    const resulted = evaluateMeshAllocationCommand(
      allocationRuntime(mesh),
      {
        kind: "allocation.execution",
        preparedAt: input.logicalTimeMs,
        envelope: resultEnvelope,
      },
      now.wallTime,
      input.logicalTimeMs,
    );
    if (!resulted.accepted)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        `local result was rejected: ${resulted.code}`,
      );
    mesh = createMeshAllocationInboundRuntimeState(
      resulted.state.coordination,
      resulted.state.discovery,
      resulted.state.objectives,
      resulted.state.allocation,
      mesh.inbound,
    );
    outbox.push({
      effectId: `node.result.${shortDigest({
        releaseId: input.releaseId,
        effect: true,
      })}`,
      targetPeerId: assignment.execution.ownerPeerId,
      ...(checkpointEffectId === null
        ? {}
        : { dependsOnEffectId: checkpointEffectId }),
      envelope: resultEnvelope,
    });
    const releaseBody = {
      schemaVersion: 1 as const,
      releaseId: input.releaseId,
      workItemId: assignment.execution.workItemId,
      workContractId: assignment.adaptiveRole.workContract.workContractId,
      workContractDigest:
        assignment.adaptiveRole.workContract.workContractDigest,
      roleBindingDigest: assignment.adaptiveRole.roleBinding.roleBindingDigest,
      executionRoleBindingDigest: executingRole.roleBinding.roleBindingDigest,
      assignmentAuthorityId: assignment.execution.assignmentAuthorityId,
      assignmentEpoch: assignment.execution.assignmentEpoch,
      assignmentFencingToken: assignment.execution.fencingToken,
      continuityBinding: input.continuity,
      assignmentConfirmation: input.assignmentConfirmation,
      sessionId: input.sessionId,
      sessionRevision: input.sessionRevision,
      stepId: input.stepId,
      stepSequence: input.stepSequence,
      stepRecordDigest: input.stepRecordDigest,
      checkpointId,
      checkpointDigest: input.checkpointDigest,
      actions: input.actions,
      resultId,
      resultDigest: input.resultDigest,
      outboxEffectIds: Object.freeze(outbox.map(({ effectId }) => effectId)),
      committedAtLogicalMs: input.logicalTimeMs,
    };
    const release: CollectivePeerNodeExecutionReleaseV1 = Object.freeze({
      ...releaseBody,
      releaseDigest: digestPlanningJsonV1(
        "planning-reducer-command-identity",
        releaseBody as unknown as PlanningJson,
      ),
    });
    const state = createCollectivePeerNodeStoredStateV1({
      scope: this.#scope,
      outboundSequence,
      runtime: { mesh, planning },
      releases: [...input.current.releases, release],
      initialPlanningState: this.#initial.runtime.planning,
    });
    return Object.freeze({
      state,
      release,
      outbox: Object.freeze(outbox),
    });
  }

  async #signExecutionEnvelope(input: {
    readonly payload: WorkCheckpointPayload | WorkResultPayload;
    readonly messageId: string;
    readonly sequence: number;
    readonly sentAt: string;
    readonly expiresAt: string;
    readonly causationId: string;
    readonly ownerPeerId: string;
  }): Promise<SignedMeshEnvelope<WorkCheckpointPayload | WorkResultPayload>> {
    return this.#options.signing.signer.sign({
      envelope: {
        protocol: MESH_PROTOCOL,
        wireVersion: this.#options.signing.wireVersion,
        messageId: input.messageId,
        tenantId: this.#scope.tenantId,
        meshId: this.#scope.meshId,
        type: input.payload.type,
        sender: {
          peerId: this.#scope.peerId,
          instanceId: this.#scope.instanceId,
        },
        audience: { kind: "peer", peerId: input.ownerPeerId },
        sequence: input.sequence,
        sentAt: input.sentAt,
        expiresAt: input.expiresAt,
        objectiveId: input.payload.objectiveId,
        causationId: input.causationId,
        payload: input.payload,
        proof: {
          algorithm: this.#options.signing.algorithm,
          keyId: this.#options.signing.keyId,
        },
      },
      privateKey: this.#options.signing.privateKey,
    });
  }

  async #signWitnessEnvelope(input: {
    readonly payload:
      | WorkAwardPayload
      | WorkAcceptPayload
      | WorkCheckpointPayload
      | LeaseRenewPayload;
    readonly messageId: string;
    readonly sequence: number;
    readonly sentAt: string;
    readonly expiresAt: string;
    readonly causationId: string;
    readonly witnessPeerId: string;
    readonly ownerContinuity?: MeshAuthorityCurrentBindingV1;
  }): Promise<
    SignedMeshEnvelope<
      | WorkAwardPayload
      | WorkAcceptPayload
      | WorkCheckpointPayload
      | LeaseRenewPayload
    >
  > {
    return this.#options.signing.signer.sign({
      envelope: {
        protocol: MESH_PROTOCOL,
        wireVersion: this.#options.signing.wireVersion,
        messageId: input.messageId,
        tenantId: this.#scope.tenantId,
        meshId: this.#scope.meshId,
        type: input.payload.type,
        sender: {
          peerId: this.#scope.peerId,
          instanceId: this.#scope.instanceId,
        },
        audience: { kind: "peer", peerId: input.witnessPeerId },
        sequence: input.sequence,
        sentAt: input.sentAt,
        expiresAt: input.expiresAt,
        objectiveId: input.payload.objectiveId,
        causationId: input.causationId,
        payload: input.payload,
        ...(input.ownerContinuity === undefined
          ? {}
          : {
              extensions: {
                [COLLECTIVE_PEER_OWNER_CONTINUITY_EXTENSION_V1]:
                  ownerContinuityExtension(input.ownerContinuity),
              },
            }),
        proof: {
          algorithm: this.#options.signing.algorithm,
          keyId: this.#options.signing.keyId,
        },
      },
      privateKey: this.#options.signing.privateKey,
    });
  }

  async #deliverCurrentOutbox(
    outbox: MeshDurableOutboxRecord,
    signal?: AbortSignal,
  ): Promise<Awaited<ReturnType<MeshDurableOutboxDeliver>>> {
    const payload = outbox.envelope.payload;
    const executionPublication =
      payload.type === "work.checkpoint" || payload.type === "work.result";
    const ownerPublication =
      payload.type === "work.offer" ||
      payload.type === "work.award" ||
      payload.type === "work.cancel" ||
      (payload.type === "work.release" &&
        payload.releaseAuthority === "owner") ||
      payload.type === "lease.certificate";
    if (!executionPublication && !ownerPublication)
      return this.#options.deliverOutbox(outbox, signal);
    try {
      const durable = await this.#options.repository.loadSnapshot(
        this.#durableScope,
      );
      if (!durable)
        return {
          disposition: "retryable",
          retryAfterMs: 1_000,
          reasonCode: "node_snapshot_unavailable",
        };
      const state = this.#decodeSnapshot(durable);
      if (ownerPublication) {
        const now = normalizeClockReading(this.#options.clock.now());
        if (
          !(await this.#checkOwnerContinuityEnvelope(
            state,
            outbox.envelope,
            Math.max(
              now.logicalTimeMs,
              state.runtime.mesh.coordination.lastLogicalTime,
            ),
          ))
        )
          return {
            disposition: "permanent_rejection",
            reasonCode: "owner_authority_not_current",
          };
        if (
          !(await this.#checkRecoveryElectionEnvelope(
            state,
            outbox.envelope,
            Math.max(
              now.logicalTimeMs,
              state.runtime.mesh.coordination.lastLogicalTime,
            ),
          ))
        )
          return {
            disposition: "permanent_rejection",
            reasonCode: "recovery_election_not_current",
          };
        if (!executionPublication)
          return this.#options.deliverOutbox(outbox, signal);
      }
      if (payload.type !== "work.checkpoint" && payload.type !== "work.result")
        return this.#options.deliverOutbox(outbox, signal);
      const release = state.releases.find(({ outboxEffectIds }) =>
        outboxEffectIds.includes(outbox.effectId),
      );
      if (!release)
        return {
          disposition: "permanent_rejection",
          reasonCode: "execution_release_missing",
        };
      if (
        payload.workItemId !== release.workItemId ||
        payload.assignmentEpoch !== release.assignmentEpoch ||
        payload.assignmentAuthorityId !== release.assignmentAuthorityId ||
        payload.fencingToken !== release.assignmentFencingToken
      )
        return {
          disposition: "permanent_rejection",
          reasonCode: "execution_release_mismatch",
        };
      const fenceHead = Object.values(
        state.runtime.mesh.allocation.assignmentFenceHeads,
      ).find(
        (candidate) =>
          candidate.objectiveId === payload.objectiveId &&
          candidate.workItemId === payload.workItemId &&
          candidate.workItemRevision === payload.workItemRevision &&
          candidate.ownerPeerId === payload.ownerPeerId,
      );
      const executionHead = Object.values(
        state.runtime.mesh.allocation.executionHeads,
      ).find(
        (candidate) =>
          candidate.objectiveId === payload.objectiveId &&
          candidate.workItemId === payload.workItemId &&
          candidate.workItemRevision === payload.workItemRevision &&
          candidate.assignmentEpoch === payload.assignmentEpoch &&
          candidate.assignmentAuthorityId === payload.assignmentAuthorityId &&
          candidate.fencingToken === payload.fencingToken,
      );
      const exactFence =
        fenceHead?.assignmentEpoch === payload.assignmentEpoch &&
        fenceHead.assignmentAuthorityId === payload.assignmentAuthorityId &&
        fenceHead.fencingToken === payload.fencingToken &&
        fenceHead.assigneePeerId === this.#scope.peerId &&
        fenceHead.phase === "terminal";
      const exactTerminal =
        executionHead?.phase === "completed" &&
        (payload.type === "work.result"
          ? executionHead.resultId === payload.resultId
          : executionHead.latestCheckpointId === payload.checkpointId);
      if (!exactFence || !exactTerminal)
        return {
          disposition: "permanent_rejection",
          reasonCode: "assignment_fence_not_current",
        };
      const now = normalizeClockReading(this.#options.clock.now());
      if (
        new Date(now.wallTime).getTime() >=
        new Date(outbox.envelope.expiresAt).getTime()
      )
        return {
          disposition: "permanent_rejection",
          reasonCode: "execution_authority_expired",
        };
      const binding = Object.freeze({
        ...release.continuityBinding,
        holder: Object.freeze({ ...release.continuityBinding.holder }),
        logicalTimeMs: Math.max(
          now.logicalTimeMs,
          state.runtime.mesh.coordination.lastLogicalTime,
        ),
      });
      const decision = await this.#options.continuity.check(binding);
      if (!decision.current)
        return decision.reasonCode.includes("unavailable")
          ? {
              disposition: "retryable",
              retryAfterMs: 1_000,
              reasonCode: decision.reasonCode,
            }
          : {
              disposition: "permanent_rejection",
              reasonCode: decision.reasonCode,
            };
      return this.#options.deliverOutbox(outbox, signal);
    } catch {
      return {
        disposition: "retryable",
        retryAfterMs: 1_000,
        reasonCode: "execution_currentness_unavailable",
      };
    }
  }

  async #prepareReconciliation(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ): Promise<
    | {
        readonly status:
          | "timer_fired"
          | "bid_submitted"
          | "award_issued"
          | "assignment_accepted"
          | "work_reoffered"
          | "recovery_proposed"
          | "recovery_voted"
          | "recovery_certified"
          | "recovery_awarded"
          | "lease_renewed";
        readonly recordId: string;
        readonly state: CollectivePeerNodeStoredStateV1;
        readonly outbox: readonly MeshDurableOutboundDraft[];
      }
    | undefined
  > {
    const timer = this.#prepareDueTimer(current, logicalTimeMs);
    if (timer) return timer;
    const accepted = await this.#prepareAssignmentAcceptance(
      current,
      wallTime,
      logicalTimeMs,
    );
    if (accepted) return accepted;
    const renewal = await this.#prepareLeaseRenewal(
      current,
      wallTime,
      logicalTimeMs,
    );
    if (renewal) return renewal;
    const recoveryAward = await this.#prepareRecoveryAward(
      current,
      wallTime,
      logicalTimeMs,
    );
    if (recoveryAward) return recoveryAward;
    const certificate = await this.#prepareRecoveryCertificate(
      current,
      wallTime,
      logicalTimeMs,
    );
    if (certificate) return certificate;
    const vote = await this.#prepareRecoveryVote(
      current,
      wallTime,
      logicalTimeMs,
    );
    if (vote) return vote;
    const proposal = await this.#prepareRecoveryProposal(
      current,
      wallTime,
      logicalTimeMs,
    );
    if (proposal) return proposal;
    const bid = await this.#prepareBid(current, wallTime, logicalTimeMs);
    if (bid) return bid;
    const award = await this.#prepareAward(current, wallTime, logicalTimeMs);
    if (award) return award;
    return this.#prepareReoffer(current, wallTime, logicalTimeMs);
  }

  #prepareDueTimer(
    current: CollectivePeerNodeStoredStateV1,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const timer = Object.values(mesh.coordination.timers)
      .filter((candidate) => candidate.dueAt <= logicalTimeMs)
      .sort(
        (left, right) =>
          left.dueAt - right.dueAt ||
          (left.timerId < right.timerId
            ? -1
            : left.timerId > right.timerId
              ? 1
              : 0),
      )[0];
    if (!timer) return undefined;

    const input = Object.freeze({
      kind: "timer.fired" as const,
      timerId: timer.timerId,
      generation: timer.generation,
    });
    let nextMesh: MeshAllocationInboundRuntimeState;
    if (
      timer.kind === "work.bid_deadline" ||
      timer.kind === "work.acceptance_deadline" ||
      timer.kind === "lease.expiry"
    ) {
      const decision = evaluateMeshAllocationTimer(mesh, input, logicalTimeMs);
      if (!decision.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `due allocation timer was rejected: ${decision.code}`,
        );
      nextMesh = createMeshAllocationInboundRuntimeState(
        decision.state.coordination,
        decision.state.discovery,
        decision.state.objectives,
        decision.state.allocation,
        mesh.inbound,
      );
    } else if (
      timer.kind === "objective.expiry" ||
      timer.kind === "work.deadline"
    ) {
      const decision = evaluateMeshObjectiveWorkTimer(
        createMeshObjectiveWorkRuntimeState(
          mesh.coordination,
          mesh.discovery,
          mesh.objectives,
        ),
        input,
        logicalTimeMs,
      );
      if (!decision.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `due Objective/Work timer was rejected: ${decision.code}`,
        );
      nextMesh = createMeshAllocationInboundRuntimeState(
        decision.state.coordination,
        decision.state.discovery,
        decision.state.objectives,
        Object.freeze({
          ...mesh.allocation,
          lastLogicalTime: logicalTimeMs,
        }),
        mesh.inbound,
      );
    } else {
      const decision = evaluateMeshCoordinationTimer(
        mesh.coordination,
        input,
        logicalTimeMs,
      );
      if (!decision.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `due coordination timer was rejected: ${decision.code}`,
        );
      nextMesh = createMeshAllocationInboundRuntimeState(
        decision.state,
        Object.freeze({
          ...mesh.discovery,
          lastLogicalTime: logicalTimeMs,
        }),
        Object.freeze({
          ...mesh.objectives,
          lastLogicalTime: logicalTimeMs,
        }),
        Object.freeze({
          ...mesh.allocation,
          lastLogicalTime: logicalTimeMs,
        }),
        mesh.inbound,
      );
    }

    return Object.freeze({
      status: "timer_fired" as const,
      recordId: timer.timerId,
      state: createCollectivePeerNodeStoredStateV1({
        scope: this.#scope,
        outboundSequence: current.outboundSequence,
        runtime: Object.freeze({
          mesh: nextMesh,
          planning: current.runtime.planning,
        }),
        releases: current.releases,
        initialPlanningState: this.#initial.runtime.planning,
      }),
      outbox: Object.freeze([]),
    });
  }

  #advanceDueTimersInMemory(
    current: CollectivePeerNodeStoredStateV1,
    logicalTimeMs: number,
  ): CollectivePeerNodeStoredStateV1 {
    let state = current;
    const maximum = Object.keys(state.runtime.mesh.coordination.timers).length;
    for (let index = 0; index < maximum; index += 1) {
      const prepared = this.#prepareDueTimer(state, logicalTimeMs);
      if (!prepared) break;
      state = prepared.state;
    }
    return state;
  }

  #hasCurrentCapabilities(
    mesh: MeshAllocationInboundRuntimeState,
    offer: MeshReceivedOfferProjection,
    logicalTimeMs: number,
  ): boolean {
    const required = offer.envelope.payload.requiredCapabilityKeys;
    if (
      ![...this.#agents.values()].some((agent) =>
        required.every((capabilityKey) =>
          agent.capabilityKeys.includes(capabilityKey),
        ),
      )
    )
      return false;
    return required.every((capabilityKey) =>
      Object.values(mesh.discovery.capabilities).some(
        (capability) =>
          capability.ownerPeerId === this.#scope.peerId &&
          capability.instanceId === this.#scope.instanceId &&
          capability.capabilityKey === capabilityKey &&
          capability.status === "active" &&
          capability.expiresAt > logicalTimeMs,
      ),
    );
  }

  async #prepareLeaseRenewal(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const leases = Object.values(mesh.allocation.leaseHeads)
      .filter(
        (lease) =>
          lease.status === "active" &&
          lease.assigneePeerId === this.#scope.peerId,
      )
      .sort(
        (left, right) =>
          left.currentLeaseExpiresAtLogical -
            right.currentLeaseExpiresAtLogical ||
          (left.executionScopeKey < right.executionScopeKey
            ? -1
            : left.executionScopeKey > right.executionScopeKey
              ? 1
              : 0),
      );
    for (const lease of leases) {
      const objective = historicalObjectivePolicy(
        mesh,
        lease.objectiveId,
        lease.objectiveRevision,
      );
      const currentObjective = mesh.objectives.objectives[lease.objectiveId];
      if (
        !objective ||
        !currentObjective ||
        currentObjective.status !== "active" ||
        lease.leaseRenewalSequence >= objective.maximumLeaseRenewals ||
        logicalTimeMs >= lease.currentLeaseExpiresAtLogical ||
        logicalTimeMs >= lease.workDeadlineAt
      )
        continue;
      const renewalThresholdMs = Math.max(
        1,
        Math.floor(objective.maximumLeaseDurationMs / 3),
      );
      if (
        lease.currentLeaseExpiresAtLogical - logicalTimeMs >
        renewalThresholdMs
      )
        continue;
      const renewedLeaseExpiresAt = earlierTimestamp(
        earlierTimestamp(lease.workDeadline, objective.validUntil),
        addMilliseconds(
          lease.currentLeaseExpiresAt,
          objective.maximumLeaseDurationMs,
        ),
      );
      if (
        new Date(wallTime).getTime() >=
          new Date(lease.currentLeaseExpiresAt).getTime() ||
        new Date(renewedLeaseExpiresAt).getTime() <=
          new Date(lease.currentLeaseExpiresAt).getTime()
      )
        continue;
      const leaseRenewalSequence = lease.leaseRenewalSequence + 1;
      const leaseRenewalId = `node.lease.renewal.${shortDigest({
        executionScopeKey: lease.executionScopeKey,
        leaseRenewalSequence,
      })}`;
      const payload: LeaseRenewPayload = {
        type: "lease.renew",
        leaseRenewalId,
        leaseRenewalSequence,
        ...(lease.latestLeaseRenewalId === undefined
          ? {}
          : { previousLeaseRenewalId: lease.latestLeaseRenewalId }),
        objectiveId: lease.objectiveId,
        objectiveDocumentId: lease.objectiveDocumentId,
        objectiveRevision: lease.objectiveRevision,
        workItemId: lease.workItemId,
        workItemRevision: lease.workItemRevision,
        ownerPeerId: lease.ownerPeerId,
        ownerEpoch: lease.ownerEpoch,
        assigneePeerId: lease.assigneePeerId,
        awardId: lease.awardId,
        assignmentEpoch: lease.assignmentEpoch,
        assignmentAuthorityId: lease.assignmentAuthorityId,
        fencingToken: lease.fencingToken,
        acceptanceId: lease.acceptanceId,
        leaseExpiresAt: lease.currentLeaseExpiresAt,
        renewedLeaseExpiresAt,
      };
      const prior = lease.latestLeaseRenewalId
        ? mesh.allocation.leaseRenewals[lease.latestLeaseRenewalId]
        : undefined;
      const primaryCausationId =
        prior?.envelope.messageId ?? lease.acceptanceMessageId;
      let outboundSequence = current.outboundSequence;
      const outbox: MeshDurableOutboundDraft[] = [];
      for (const witnessPeerId of recoveryWitnessPeerIds(
        objective.recoveryWitnessPeerIds,
        lease.ownerPeerId,
        lease.assigneePeerId,
        objective.recoveryWitnessThreshold,
      )) {
        outboundSequence += 1;
        const causationId =
          lease.latestLeaseRenewalId === undefined
            ? witnessAcceptanceMessageId(lease.acceptanceId, witnessPeerId)
            : witnessLeaseRenewalMessageId(
                lease.latestLeaseRenewalId,
                witnessPeerId,
              );
        const envelope = await this.#signWitnessEnvelope({
          payload,
          messageId: witnessLeaseRenewalMessageId(
            leaseRenewalId,
            witnessPeerId,
          ),
          sequence: outboundSequence,
          sentAt: wallTime,
          expiresAt: lease.currentLeaseExpiresAt,
          causationId,
          witnessPeerId,
        });
        const effectId = witnessLeaseRenewalEffectId(
          leaseRenewalId,
          witnessPeerId,
        );
        outbox.push({
          effectId,
          targetPeerId: witnessPeerId,
          envelope,
        });
      }
      outboundSequence += 1;
      const envelope = await this.#options.signing.signer.sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion: this.#options.signing.wireVersion,
          messageId: meshMessageId({ kind: "lease.renew", leaseRenewalId }),
          tenantId: this.#scope.tenantId,
          meshId: this.#scope.meshId,
          type: "lease.renew",
          sender: {
            peerId: this.#scope.peerId,
            instanceId: this.#scope.instanceId,
          },
          audience: { kind: "peer", peerId: lease.ownerPeerId },
          sequence: outboundSequence,
          sentAt: wallTime,
          expiresAt: lease.currentLeaseExpiresAt,
          objectiveId: lease.objectiveId,
          causationId: primaryCausationId,
          payload,
          proof: {
            algorithm: this.#options.signing.algorithm,
            keyId: this.#options.signing.keyId,
          },
        },
        privateKey: this.#options.signing.privateKey,
      });
      const decision = evaluateMeshAllocationCommand(
        allocationRuntime(mesh),
        {
          kind: "allocation.lease_renew",
          preparedAt: logicalTimeMs,
          envelope,
        },
        wallTime,
        logicalTimeMs,
      );
      if (!decision.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `local lease renewal was rejected: ${decision.code}`,
        );
      outbox.push({
        effectId: `node.lease.renewal.${shortDigest({
          leaseRenewalId,
          effect: true,
        })}`,
        targetPeerId: lease.ownerPeerId,
        envelope,
      });
      const nextMesh = createMeshAllocationInboundRuntimeState(
        decision.state.coordination,
        decision.state.discovery,
        decision.state.objectives,
        decision.state.allocation,
        mesh.inbound,
      );
      return Object.freeze({
        status: "lease_renewed" as const,
        recordId: leaseRenewalId,
        state: createCollectivePeerNodeStoredStateV1({
          scope: this.#scope,
          outboundSequence,
          runtime: Object.freeze({
            mesh: nextMesh,
            planning: current.runtime.planning,
          }),
          releases: current.releases,
          initialPlanningState: this.#initial.runtime.planning,
        }),
        outbox: Object.freeze(outbox),
      });
    }
    return undefined;
  }

  async #prepareRecoveryProposal(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const candidates: Array<{
      readonly lease: MeshLeaseHeadProjection;
      readonly offerId: string;
      readonly causationId: string;
    }> = [];
    for (const lease of Object.values(mesh.allocation.leaseHeads)) {
      if (
        lease.status !== "expired" ||
        lease.assigneePeerId !== this.#scope.peerId
      )
        continue;
      const award = mesh.allocation.receivedAwards[lease.awardId];
      if (!award) continue;
      const renewal = lease.latestLeaseRenewalId
        ? mesh.allocation.leaseRenewals[lease.latestLeaseRenewalId]
        : undefined;
      candidates.push({
        lease,
        offerId: award.envelope.payload.offerId,
        causationId: renewal?.envelope.messageId ?? lease.acceptanceMessageId,
      });
    }
    for (const witness of Object.values(mesh.allocation.witnessAssignments)) {
      const lease = witness.leaseHead;
      if (!lease || lease.status !== "expired") continue;
      const renewal = lease.latestLeaseRenewalId
        ? witness.leaseRenewals.find(
            ({ leaseRenewalId }) =>
              leaseRenewalId === lease.latestLeaseRenewalId,
          )
        : undefined;
      candidates.push({
        lease,
        offerId: witness.awardEnvelope.payload.offerId,
        causationId: renewal?.envelope.messageId ?? lease.acceptanceMessageId,
      });
    }
    candidates.sort((left, right) =>
      left.lease.executionScopeKey < right.lease.executionScopeKey
        ? -1
        : left.lease.executionScopeKey > right.lease.executionScopeKey
          ? 1
          : 0,
    );
    for (const candidate of candidates) {
      const { lease } = candidate;
      if (lease.ownerPeerId === this.#scope.peerId) continue;
      const objective = historicalObjectivePolicy(
        mesh,
        lease.objectiveId,
        lease.objectiveRevision,
      );
      const currentObjective = mesh.objectives.objectives[lease.objectiveId];
      if (
        !objective ||
        !currentObjective ||
        currentObjective.status !== "active" ||
        logicalTimeMs <
          lease.currentLeaseExpiresAtLogical + objective.recoveryGraceMs ||
        logicalTimeMs >= lease.workDeadlineAt ||
        new Date(wallTime).getTime() >= new Date(lease.workDeadline).getTime()
      )
        continue;
      const bid = Object.values(mesh.allocation.localBids).find(
        (entry) =>
          entry.envelope.payload.offerId === candidate.offerId &&
          entry.envelope.payload.bidderPeerId === this.#scope.peerId,
      );
      const offer = mesh.allocation.receivedOffers[candidate.offerId];
      if (
        !bid ||
        !offer ||
        !this.#hasCurrentCapabilities(mesh, offer, logicalTimeMs)
      )
        continue;
      if (this.#options.capabilityState) {
        const recoveryAgents = await this.#filterCapabilityStateLocalAgents({
          operation: "recovery",
          objectiveId: lease.objectiveId,
          workItemId: lease.workItemId,
          workItemRevision: lease.workItemRevision,
          requiredCapabilityKeys: offer.envelope.payload.requiredCapabilityKeys,
          logicalTimeMs,
        });
        if (recoveryAgents.length === 0) continue;
      }
      if (
        Object.values(mesh.allocation.takeoverProposals).some(
          ({ envelope }) =>
            envelope.payload.objectiveId === lease.objectiveId &&
            envelope.payload.workItemId === lease.workItemId &&
            envelope.payload.proposedAssignmentEpoch ===
              lease.assignmentEpoch + 1 &&
            envelope.payload.proposedAssigneePeerId === this.#scope.peerId,
        )
      )
        continue;
      const takeoverProposalId = `node.recovery.proposal.${shortDigest({
        executionScopeKey: lease.executionScopeKey,
        assignmentEpoch: lease.assignmentEpoch + 1,
        candidatePeerId: this.#scope.peerId,
      })}`;
      const payload: LeaseTakeoverProposalPayload = {
        type: "lease.takeover_proposal",
        takeoverProposalId,
        proposalAuthority: "candidate",
        proposerPeerId: this.#scope.peerId,
        proposedAssigneePeerId: this.#scope.peerId,
        proposedAssignmentEpoch: lease.assignmentEpoch + 1,
        objectiveId: lease.objectiveId,
        objectiveDocumentId: lease.objectiveDocumentId,
        objectiveRevision: lease.objectiveRevision,
        workItemId: lease.workItemId,
        workItemRevision: lease.workItemRevision,
        ownerPeerId: lease.ownerPeerId,
        ownerEpoch: lease.ownerEpoch,
        assigneePeerId: lease.assigneePeerId,
        awardId: lease.awardId,
        acceptanceId: lease.acceptanceId,
        assignmentEpoch: lease.assignmentEpoch,
        assignmentAuthorityId: lease.assignmentAuthorityId,
        fencingToken: lease.fencingToken,
        leaseExpiresAt: lease.currentLeaseExpiresAt,
        leaseRenewalSequence: lease.leaseRenewalSequence,
        ...(lease.latestLeaseRenewalId === undefined
          ? {}
          : { latestLeaseRenewalId: lease.latestLeaseRenewalId }),
      };
      const recipients = recoveryParticipants(
        lease.ownerPeerId,
        lease.assigneePeerId,
        this.#scope.peerId,
        recoveryWitnessPeerIds(
          objective.recoveryWitnessPeerIds,
          lease.ownerPeerId,
          lease.assigneePeerId,
          objective.recoveryWitnessThreshold,
        ),
        this.#scope.peerId,
        lease.ownerPeerId,
      );
      if (recipients.length === 0) continue;
      return this.#prepareRecoveryTransition({
        current,
        payload,
        recipients,
        causationId: candidate.causationId,
        wallTime,
        expiresAt: earlierTimestamp(
          earlierTimestamp(objective.validUntil, lease.workDeadline),
          addMilliseconds(wallTime, DEFAULT_RECOVERY_ENVELOPE_TTL_MS),
        ),
        logicalTimeMs,
        status: "recovery_proposed",
        recordId: takeoverProposalId,
      });
    }
    return undefined;
  }

  async #prepareRecoveryVote(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const proposals = Object.values(mesh.allocation.takeoverProposals).sort(
      (left, right) =>
        left.takeoverProposalId < right.takeoverProposalId
          ? -1
          : left.takeoverProposalId > right.takeoverProposalId
            ? 1
            : 0,
    );
    for (const proposal of proposals) {
      if (proposal.direction !== "received") continue;
      const proposed = proposal.envelope.payload;
      const objective = historicalObjectivePolicy(
        mesh,
        proposed.objectiveId,
        proposed.objectiveRevision,
      );
      const currentObjective = mesh.objectives.objectives[proposed.objectiveId];
      if (
        !objective ||
        !currentObjective ||
        currentObjective.status !== "active" ||
        !recoveryWitnessPeerIds(
          objective.recoveryWitnessPeerIds,
          proposed.ownerPeerId,
          proposed.assigneePeerId,
          objective.recoveryWitnessThreshold,
        ).includes(this.#scope.peerId) ||
        proposed.proposerPeerId === this.#scope.peerId ||
        logicalTimeMs >= objective.expiresAt
      )
        continue;
      const election = await this.#resolveRecoveryElection(
        mesh,
        proposed,
        logicalTimeMs,
      ).catch(() => null);
      if (
        !election ||
        election.selectedProposalId !== proposed.takeoverProposalId
      )
        continue;
      if (
        Object.values(mesh.allocation.leaseVotes).some((vote) => {
          const votedProposal =
            mesh.allocation.takeoverProposals[vote.takeoverProposalId]?.envelope
              .payload;
          return (
            vote.witnessPeerId === this.#scope.peerId &&
            votedProposal !== undefined &&
            sameRecoveryElection(votedProposal, proposed)
          );
        })
      )
        continue;
      const leaseVoteId = `node.recovery.vote.${shortDigest({
        takeoverProposalId: proposed.takeoverProposalId,
        witnessPeerId: this.#scope.peerId,
      })}`;
      const payload: LeaseVotePayload = {
        type: "lease.vote",
        leaseVoteId,
        takeoverProposalId: proposed.takeoverProposalId,
        witnessPeerId: this.#scope.peerId,
        objectiveId: proposed.objectiveId,
      };
      const recipients = recoveryParticipants(
        proposed.ownerPeerId,
        proposed.assigneePeerId,
        proposed.proposedAssigneePeerId,
        recoveryWitnessPeerIds(
          objective.recoveryWitnessPeerIds,
          proposed.ownerPeerId,
          proposed.assigneePeerId,
          objective.recoveryWitnessThreshold,
        ),
        this.#scope.peerId,
        proposed.ownerPeerId,
      );
      if (recipients.length === 0) continue;
      return this.#prepareRecoveryTransition({
        current,
        payload,
        recipients,
        causationId: proposal.envelope.messageId,
        wallTime,
        expiresAt: earlierTimestamp(
          objective.validUntil,
          addMilliseconds(wallTime, DEFAULT_RECOVERY_ENVELOPE_TTL_MS),
        ),
        logicalTimeMs,
        status: "recovery_voted",
        recordId: leaseVoteId,
        recoveryElection: election,
      });
    }
    return undefined;
  }

  async #resolveRecoveryElection(
    mesh: MeshAllocationInboundRuntimeState,
    proposed: LeaseTakeoverProposalPayload,
    logicalTimeMs: number,
  ): Promise<CollectivePeerNodeRecoveryElectionDecisionV1 | null> {
    if (!(await this.#readiness("recovery_election", logicalTimeMs)).ready)
      return null;
    const objective = historicalObjectivePolicy(
      mesh,
      proposed.objectiveId,
      proposed.objectiveRevision,
    );
    if (!objective) return null;
    const eligibleWitnessPeerIds = recoveryWitnessPeerIds(
      objective.recoveryWitnessPeerIds,
      proposed.ownerPeerId,
      proposed.assigneePeerId,
      objective.recoveryWitnessThreshold,
    );
    const proposalRecords = Object.values(mesh.allocation.takeoverProposals)
      .filter((candidate) =>
        sameRecoveryElection(candidate.envelope.payload, proposed),
      )
      .sort((left, right) =>
        left.takeoverProposalId < right.takeoverProposalId
          ? -1
          : left.takeoverProposalId > right.takeoverProposalId
            ? 1
            : 0,
      );
    let proposals = proposalRecords.map((candidate) =>
      Object.freeze({
        takeoverProposalId: candidate.takeoverProposalId,
        proposedAssigneePeerId:
          candidate.envelope.payload.proposedAssigneePeerId,
        acceptedAtLogicalMs: candidate.acceptedAt,
      }),
    );
    if (this.#options.capabilityState) {
      const requiredCapabilityKeys = recoveryRequiredCapabilityKeys(
        mesh,
        proposed,
      );
      const proposalCandidates = proposalRecords.flatMap((record) => {
        const payload = record.envelope.payload;
        const peerCard =
          mesh.discovery.peerCards[payload.proposedAssigneePeerId];
        const instanceId =
          peerCard?.instanceId ??
          (record.envelope.sender.peerId === payload.proposedAssigneePeerId
            ? record.envelope.sender.instanceId
            : null);
        if (!instanceId) return [];
        const advertisedCapabilityKeys = [
          ...new Set(
            Object.values(mesh.discovery.capabilities)
              .filter(
                (capability) =>
                  capability.ownerPeerId === payload.proposedAssigneePeerId &&
                  capability.instanceId === instanceId &&
                  capability.status === "active" &&
                  capability.expiresAt > logicalTimeMs,
              )
              .map(({ capabilityKey }) => capabilityKey),
          ),
        ].sort();
        if (
          requiredCapabilityKeys.some(
            (capabilityKey) =>
              !advertisedCapabilityKeys.includes(capabilityKey),
          )
        )
          return [];
        return [
          {
            record,
            candidate: this.#capabilityStateCandidate({
              kind: "peer",
              peerId: payload.proposedAssigneePeerId,
              instanceId,
              agentId: null,
              requiredCapabilityKeys,
              advertisedCapabilityKeys,
              sourceRecordId: record.takeoverProposalId,
              sourceRevision: payload.proposedAssignmentEpoch,
              sourceEvidence: {
                takeoverProposalId: record.takeoverProposalId,
                proposedAssigneePeerId: payload.proposedAssigneePeerId,
                proposedAssignmentEpoch: payload.proposedAssignmentEpoch,
                acceptedAtLogicalMs: record.acceptedAt,
              },
            }),
          },
        ];
      });
      const fusionEligible = await this.#eligibleCapabilityStateCandidateIds({
        operation: "recovery",
        objectiveId: proposed.objectiveId,
        workItemId: proposed.workItemId,
        workItemRevision: proposed.workItemRevision,
        requiredCapabilityKeys,
        candidates: proposalCandidates.map(({ candidate }) => candidate),
        logicalTimeMs,
      });
      proposals = proposalCandidates
        .filter(({ candidate }) => fusionEligible.has(candidate.candidateId))
        .map(({ record: candidate }) =>
          Object.freeze({
            takeoverProposalId: candidate.takeoverProposalId,
            proposedAssigneePeerId:
              candidate.envelope.payload.proposedAssigneePeerId,
            acceptedAtLogicalMs: candidate.acceptedAt,
          }),
        );
    }
    if (proposals.length === 0) return null;
    const scopeDigest = recoveryElectionScopeDigest(proposed);
    const selected = await this.#options.recoveryElection.select({
      scopeDigest,
      objectiveId: proposed.objectiveId,
      objectiveRevision: proposed.objectiveRevision,
      objectiveExpiresAtLogicalMs: objective.expiresAt,
      workItemId: proposed.workItemId,
      workItemRevision: proposed.workItemRevision,
      priorAssignmentEpoch: proposed.assignmentEpoch,
      proposedAssignmentEpoch: proposed.proposedAssignmentEpoch,
      proposals: Object.freeze(proposals),
      eligibleWitnessPeerIds,
      recoveryWitnessThreshold: objective.recoveryWitnessThreshold,
      logicalTimeMs,
    });
    if (!selected || typeof selected !== "object") return null;
    const selectedProposal = proposals.find(
      ({ takeoverProposalId }) =>
        takeoverProposalId === selected.selectedProposalId,
    );
    const witnesses = selected.certifiedWitnessPeerIds;
    if (
      Object.keys(selected).sort().join("\u0000") !==
        "certifiedAtLogicalMs\u0000certifiedWitnessPeerIds\u0000electionId\u0000electionRound\u0000expiresAtLogicalMs\u0000schemaVersion\u0000scopeDigest\u0000selectedAssigneePeerId\u0000selectedProposalId" ||
      selected.schemaVersion !== 1 ||
      !IDENTIFIER.test(selected.electionId) ||
      !Number.isSafeInteger(selected.electionRound) ||
      selected.electionRound < 1 ||
      selected.scopeDigest !== scopeDigest ||
      !selectedProposal ||
      selected.selectedAssigneePeerId !==
        selectedProposal.proposedAssigneePeerId ||
      objective.recoveryWitnessPeerIds.includes(
        selected.selectedAssigneePeerId,
      ) ||
      !Array.isArray(witnesses) ||
      new Set(witnesses).size !== witnesses.length ||
      witnesses.length < objective.recoveryWitnessThreshold ||
      witnesses.some(
        (peerId) =>
          typeof peerId !== "string" ||
          !eligibleWitnessPeerIds.includes(peerId),
      ) ||
      !Number.isSafeInteger(selected.certifiedAtLogicalMs) ||
      selected.certifiedAtLogicalMs > logicalTimeMs ||
      !Number.isSafeInteger(selected.expiresAtLogicalMs) ||
      selected.expiresAtLogicalMs <= logicalTimeMs ||
      selected.expiresAtLogicalMs > objective.expiresAt
    )
      return null;
    return Object.freeze({
      ...selected,
      certifiedWitnessPeerIds: Object.freeze([...witnesses].sort()),
    });
  }

  async #prepareRecoveryCertificate(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const proposals = Object.values(mesh.allocation.takeoverProposals).sort(
      (left, right) =>
        left.takeoverProposalId < right.takeoverProposalId
          ? -1
          : left.takeoverProposalId > right.takeoverProposalId
            ? 1
            : 0,
    );
    for (const proposal of proposals) {
      const proposed = proposal.envelope.payload;
      if (
        proposal.direction !== "received" ||
        proposed.ownerPeerId !== this.#scope.peerId ||
        Object.values(mesh.allocation.recoveryCertificates).some(
          (certificate) =>
            certificate.takeoverProposalId === proposed.takeoverProposalId,
        )
      )
        continue;
      const objective = historicalObjectivePolicy(
        mesh,
        proposed.objectiveId,
        proposed.objectiveRevision,
      );
      const currentObjective = mesh.objectives.objectives[proposed.objectiveId];
      if (
        !objective ||
        !currentObjective ||
        currentObjective.status !== "active"
      )
        continue;
      const ownerContinuity = await this.#resolveLocalOwnerContinuity(
        proposed.objectiveId,
        proposed.workItemId,
        logicalTimeMs,
      );
      if (!ownerContinuity) continue;
      const eligibleWitnessPeerIds = recoveryWitnessPeerIds(
        objective.recoveryWitnessPeerIds,
        proposed.ownerPeerId,
        proposed.assigneePeerId,
        objective.recoveryWitnessThreshold,
      );
      const election = await this.#resolveRecoveryElection(
        mesh,
        proposed,
        logicalTimeMs,
      ).catch(() => null);
      if (
        !election ||
        election.selectedProposalId !== proposed.takeoverProposalId
      )
        continue;
      const votes = Object.values(mesh.allocation.leaseVotes)
        .filter((vote) => {
          const voteElection = parseRecoveryElectionExtension(
            vote.envelope.extensions?.[
              COLLECTIVE_PEER_RECOVERY_ELECTION_EXTENSION_V1
            ],
          );
          return (
            vote.takeoverProposalId === proposed.takeoverProposalId &&
            eligibleWitnessPeerIds.includes(vote.witnessPeerId) &&
            voteElection !== null &&
            sameRecoveryElectionDecision(voteElection, election)
          );
        })
        .sort((left, right) =>
          left.leaseVoteId < right.leaseVoteId
            ? -1
            : left.leaseVoteId > right.leaseVoteId
              ? 1
              : 0,
        );
      if (votes.length < objective.recoveryWitnessThreshold) continue;
      const certificateId = `node.recovery.certificate.${shortDigest({
        takeoverProposalId: proposed.takeoverProposalId,
        leaseVoteIds: votes.map(({ leaseVoteId }) => leaseVoteId),
      })}`;
      const payload: LeaseCertificatePayload = {
        type: "lease.certificate",
        certificateId,
        certificateAssemblerPeerId: this.#scope.peerId,
        takeoverProposalId: proposed.takeoverProposalId,
        leaseVoteIds: Object.freeze(
          votes.map(({ leaseVoteId }) => leaseVoteId),
        ),
        objectiveId: proposed.objectiveId,
      };
      const recipients = recoveryParticipants(
        proposed.ownerPeerId,
        proposed.assigneePeerId,
        proposed.proposedAssigneePeerId,
        Object.freeze(votes.map(({ witnessPeerId }) => witnessPeerId)),
        this.#scope.peerId,
        proposed.proposedAssigneePeerId,
      );
      if (recipients.length === 0) continue;
      return this.#prepareRecoveryTransition({
        current,
        payload,
        recipients,
        causationId: proposal.envelope.messageId,
        wallTime,
        expiresAt: earlierTimestamp(
          objective.validUntil,
          addMilliseconds(wallTime, DEFAULT_RECOVERY_ENVELOPE_TTL_MS),
        ),
        logicalTimeMs,
        status: "recovery_certified",
        recordId: certificateId,
        ownerContinuity,
        recoveryElection: election,
      });
    }
    return undefined;
  }

  async #prepareRecoveryAward(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const certificates = Object.values(
      mesh.allocation.recoveryCertificates,
    ).sort((left, right) =>
      left.certificateId < right.certificateId
        ? -1
        : left.certificateId > right.certificateId
          ? 1
          : 0,
    );
    for (const certificate of certificates) {
      if (certificate.direction !== "local") continue;
      const proposed =
        mesh.allocation.takeoverProposals[certificate.takeoverProposalId]
          ?.envelope.payload;
      if (!proposed || proposed.ownerPeerId !== this.#scope.peerId) continue;
      if (
        Object.values(mesh.allocation.localAwards).some(
          ({ recipientAward }) =>
            recipientAward.envelope.payload.authorityKind ===
              "recovery_certificate" &&
            recipientAward.envelope.payload.recoveryCertificateId ===
              certificate.certificateId,
        )
      )
        continue;
      const oldAward = mesh.allocation.localAwards[proposed.awardId];
      if (!oldAward) continue;
      const bid = Object.values(mesh.allocation.bidHeads).find(
        (candidate) =>
          candidate.offerId === oldAward.offerId &&
          candidate.bidderPeerId === proposed.proposedAssigneePeerId,
      );
      const offer = mesh.allocation.localOffers[oldAward.offerId];
      const objective = historicalObjectivePolicy(
        mesh,
        proposed.objectiveId,
        proposed.objectiveRevision,
      );
      const currentObjective = mesh.objectives.objectives[proposed.objectiveId];
      if (
        !bid ||
        !offer ||
        !objective ||
        !currentObjective ||
        currentObjective.status !== "active" ||
        logicalTimeMs >= offer.work.workDeadlineAt
      )
        continue;
      const ownerContinuity = await this.#resolveLocalOwnerContinuity(
        proposed.objectiveId,
        proposed.workItemId,
        logicalTimeMs,
      );
      if (!ownerContinuity) continue;
      const checkpointIds = new Set(
        [
          ...Object.values(mesh.allocation.executionHeads)
            .filter(
              (head) =>
                head.objectiveId === proposed.objectiveId &&
                head.workItemId === proposed.workItemId &&
                head.assignmentEpoch === proposed.assignmentEpoch,
            )
            .map(({ latestCheckpointId }) => latestCheckpointId),
          ...Object.values(mesh.allocation.witnessAssignments)
            .filter(({ awardEnvelope }) => {
              const award = awardEnvelope.payload;
              return (
                award.objectiveId === proposed.objectiveId &&
                award.workItemId === proposed.workItemId &&
                award.assignmentEpoch === proposed.assignmentEpoch
              );
            })
            .map(({ latestCheckpoint }) => latestCheckpoint?.recordId),
        ].filter((value): value is string => value !== undefined),
      );
      if (checkpointIds.size > 1)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          "recovery checkpoint witnesses disagree",
        );
      const resumeCheckpointId = [...checkpointIds][0];
      const awardId = `node.recovery.award.${shortDigest({
        certificateId: certificate.certificateId,
        bidId: bid.bidId,
      })}`;
      const leaseExpiresAt = earlierTimestamp(
        offer.work.workDeadline,
        addMilliseconds(wallTime, objective.maximumLeaseDurationMs),
      );
      const acceptanceDeadline = earlierTimestamp(
        leaseExpiresAt,
        addMilliseconds(wallTime, objective.acceptanceWindowMs),
      );
      if (
        new Date(acceptanceDeadline).getTime() <= new Date(wallTime).getTime()
      )
        continue;
      const payload: WorkAwardPayload = {
        type: "work.award",
        awardId,
        offerId: offer.offerId,
        bidId: bid.bidId,
        bidRevision: bid.bidRevision,
        objectiveId: proposed.objectiveId,
        objectiveDocumentId: proposed.objectiveDocumentId,
        objectiveRevision: proposed.objectiveRevision,
        workItemId: proposed.workItemId,
        workItemRevision: proposed.workItemRevision,
        ownerPeerId: proposed.ownerPeerId,
        ownerEpoch: proposed.ownerEpoch,
        offerAttempt: offer.offerAttempt,
        assigneePeerId: proposed.proposedAssigneePeerId,
        assignmentEpoch: proposed.proposedAssignmentEpoch,
        authorityKind: "recovery_certificate",
        recoveryCertificateId: certificate.certificateId,
        assignmentAuthorityId: certificate.certificateId,
        fencingToken: certificate.certificateId,
        budgetReservationUnits: offer.work.budgetReservationUnits,
        workDeadline: offer.work.workDeadline,
        ...(resumeCheckpointId === undefined ? {} : { resumeCheckpointId }),
        leaseStartsAt: wallTime,
        leaseExpiresAt,
        acceptanceDeadline,
      };
      let outboundSequence = current.outboundSequence;
      const outbox: MeshDurableOutboundDraft[] = [];
      for (const witnessPeerId of recoveryWitnessPeerIds(
        objective.recoveryWitnessPeerIds,
        proposed.ownerPeerId,
        proposed.proposedAssigneePeerId,
        objective.recoveryWitnessThreshold,
      )) {
        outboundSequence += 1;
        const envelope = await this.#signWitnessEnvelope({
          payload,
          messageId: witnessAwardMessageId(awardId, witnessPeerId),
          sequence: outboundSequence,
          sentAt: wallTime,
          expiresAt: acceptanceDeadline,
          causationId: recoveryMessageId(
            "lease.certificate",
            certificate.certificateId,
            witnessPeerId,
          ),
          witnessPeerId,
          ownerContinuity,
        });
        const effectId = witnessAwardEffectId(awardId, witnessPeerId);
        outbox.push({
          effectId,
          targetPeerId: witnessPeerId,
          dependsOnEffectId: recoveryEffectId(
            "lease.certificate",
            certificate.certificateId,
            witnessPeerId,
          ),
          envelope,
        });
      }
      outboundSequence += 1;
      const envelope = await this.#options.signing.signer.sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion: this.#options.signing.wireVersion,
          messageId: meshMessageId({ kind: "work.recovery_award", awardId }),
          tenantId: this.#scope.tenantId,
          meshId: this.#scope.meshId,
          type: "work.award",
          sender: {
            peerId: this.#scope.peerId,
            instanceId: this.#scope.instanceId,
          },
          audience: {
            kind: "peer",
            peerId: proposed.proposedAssigneePeerId,
          },
          sequence: outboundSequence,
          sentAt: wallTime,
          expiresAt: acceptanceDeadline,
          objectiveId: proposed.objectiveId,
          causationId: recoveryMessageId(
            "lease.certificate",
            certificate.certificateId,
            proposed.proposedAssigneePeerId,
          ),
          payload,
          extensions: {
            [COLLECTIVE_PEER_OWNER_CONTINUITY_EXTENSION_V1]:
              ownerContinuityExtension(ownerContinuity),
          },
          proof: {
            algorithm: this.#options.signing.algorithm,
            keyId: this.#options.signing.keyId,
          },
        },
        privateKey: this.#options.signing.privateKey,
      });
      const decision = evaluateMeshAllocationCommand(
        allocationRuntime(mesh),
        {
          kind: "allocation.recovery_award",
          certificateId: certificate.certificateId,
          recipient: {
            recipientPeerId: proposed.proposedAssigneePeerId,
            preparedAt: logicalTimeMs,
            envelope,
          },
        },
        wallTime,
        logicalTimeMs,
      );
      if (!decision.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `local recovery award was rejected: ${decision.code}`,
        );
      outbox.push({
        effectId: `node.recovery.award.${shortDigest({
          awardId,
          effect: true,
        })}`,
        targetPeerId: proposed.proposedAssigneePeerId,
        dependsOnEffectId: recoveryEffectId(
          "lease.certificate",
          certificate.certificateId,
          proposed.proposedAssigneePeerId,
        ),
        envelope,
      });
      const nextMesh = createMeshAllocationInboundRuntimeState(
        decision.state.coordination,
        decision.state.discovery,
        decision.state.objectives,
        decision.state.allocation,
        mesh.inbound,
      );
      return Object.freeze({
        status: "recovery_awarded" as const,
        recordId: awardId,
        state: createCollectivePeerNodeStoredStateV1({
          scope: this.#scope,
          outboundSequence,
          runtime: Object.freeze({
            mesh: nextMesh,
            planning: current.runtime.planning,
          }),
          releases: current.releases,
          initialPlanningState: this.#initial.runtime.planning,
        }),
        outbox: Object.freeze(outbox),
      });
    }
    return undefined;
  }

  async #prepareRecoveryTransition(input: {
    readonly current: CollectivePeerNodeStoredStateV1;
    readonly payload:
      LeaseTakeoverProposalPayload | LeaseVotePayload | LeaseCertificatePayload;
    readonly recipients: readonly string[];
    readonly causationId: string;
    readonly wallTime: string;
    readonly expiresAt: string;
    readonly logicalTimeMs: number;
    readonly status:
      "recovery_proposed" | "recovery_voted" | "recovery_certified";
    readonly recordId: string;
    readonly ownerContinuity?: MeshAuthorityCurrentBindingV1;
    readonly recoveryElection?: CollectivePeerNodeRecoveryElectionDecisionV1;
  }) {
    let outboundSequence = input.current.outboundSequence;
    const prepared = [];
    const outbox: MeshDurableOutboundDraft[] = [];
    for (const recipientPeerId of input.recipients) {
      outboundSequence += 1;
      const envelope = await this.#options.signing.signer.sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion: this.#options.signing.wireVersion,
          messageId: recoveryMessageId(
            input.payload.type,
            input.recordId,
            recipientPeerId,
          ),
          tenantId: this.#scope.tenantId,
          meshId: this.#scope.meshId,
          type: input.payload.type,
          sender: {
            peerId: this.#scope.peerId,
            instanceId: this.#scope.instanceId,
          },
          audience: { kind: "peer", peerId: recipientPeerId },
          sequence: outboundSequence,
          sentAt: input.wallTime,
          expiresAt: input.expiresAt,
          objectiveId: input.payload.objectiveId,
          causationId: input.causationId,
          payload: input.payload,
          ...(input.ownerContinuity === undefined &&
          input.recoveryElection === undefined
            ? {}
            : {
                extensions: {
                  ...(input.ownerContinuity === undefined
                    ? {}
                    : {
                        [COLLECTIVE_PEER_OWNER_CONTINUITY_EXTENSION_V1]:
                          ownerContinuityExtension(input.ownerContinuity),
                      }),
                  ...(input.recoveryElection === undefined
                    ? {}
                    : {
                        [COLLECTIVE_PEER_RECOVERY_ELECTION_EXTENSION_V1]:
                          recoveryElectionExtension(input.recoveryElection),
                      }),
                },
              }),
          proof: {
            algorithm: this.#options.signing.algorithm,
            keyId: this.#options.signing.keyId,
          },
        },
        privateKey: this.#options.signing.privateKey,
      });
      prepared.push({
        recipientPeerId,
        preparedAt: input.logicalTimeMs,
        envelope,
      });
      const effectId = recoveryEffectId(
        input.payload.type,
        input.recordId,
        recipientPeerId,
      );
      outbox.push({
        effectId,
        targetPeerId: recipientPeerId,
        envelope,
      });
    }
    const decision = evaluateMeshAllocationCommand(
      allocationRuntime(input.current.runtime.mesh),
      { kind: "allocation.recovery", recipients: prepared },
      input.wallTime,
      input.logicalTimeMs,
    );
    if (!decision.accepted)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        `local recovery record was rejected: ${decision.code}`,
      );
    const nextMesh = createMeshAllocationInboundRuntimeState(
      decision.state.coordination,
      decision.state.discovery,
      decision.state.objectives,
      decision.state.allocation,
      input.current.runtime.mesh.inbound,
    );
    return Object.freeze({
      status: input.status,
      recordId: input.recordId,
      state: createCollectivePeerNodeStoredStateV1({
        scope: this.#scope,
        outboundSequence,
        runtime: Object.freeze({
          mesh: nextMesh,
          planning: input.current.runtime.planning,
        }),
        releases: input.current.releases,
        initialPlanningState: this.#initial.runtime.planning,
      }),
      outbox: Object.freeze(outbox),
    });
  }

  async #prepareReoffer(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const candidates = Object.values(mesh.allocation.workAllocations)
      .filter(
        (candidate) =>
          candidate.phase === "ready" &&
          candidate.work.status === "ready" &&
          candidate.work.workDeadlineAt > logicalTimeMs,
      )
      .sort((left, right) =>
        left.workKey < right.workKey
          ? -1
          : left.workKey > right.workKey
            ? 1
            : 0,
      );
    for (const candidate of candidates) {
      const priorOffers = Object.values(mesh.allocation.localOffers)
        .filter(
          (offer) =>
            offer.objectiveId === candidate.objectiveId &&
            offer.work.workItemId === candidate.work.workItemId,
        )
        .sort((left, right) => left.offerAttempt - right.offerAttempt);
      if (priorOffers.length >= mesh.allocation.limits.maximumOffersPerWorkItem)
        continue;
      const objective = candidate.objectivePolicy;
      const currentObjective =
        mesh.objectives.objectives[candidate.objectiveId];
      if (
        !currentObjective ||
        currentObjective.status !== "active" ||
        objective.expiresAt <= logicalTimeMs ||
        new Date(objective.validUntil).getTime() <= new Date(wallTime).getTime()
      )
        continue;
      const ownerContinuity = await this.#resolveLocalOwnerContinuity(
        candidate.objectiveId,
        candidate.work.workItemId,
        logicalTimeMs,
      );
      if (!ownerContinuity) continue;
      const mapping = current.runtime.planning.planView.workMappings.find(
        (entry) =>
          entry.meshId === this.#scope.meshId &&
          entry.objectiveId === candidate.objectiveId &&
          entry.workItemId === candidate.work.workItemId &&
          entry.workItemRevision === candidate.work.workItemRevision,
      );
      const fragment = mapping
        ? current.runtime.planning.planView.fragments.find(
            (entry) => entry.fragmentDigest === mapping.fragmentDigest,
          )
        : undefined;
      if (!mapping || !fragment || fragment.status !== "offered") continue;
      const projection = createPlanningLocalWorkProjectionV1({
        missionIntent: current.runtime.planning.missionIntent,
        sourcePlanView: current.runtime.planning.planView,
        fragment,
        workItemRevision: candidate.work.workItemRevision,
      });
      await this.#options.fragments.put(projection.repositoryRecord);
      if (
        projection.work.inputReference === undefined ||
        projection.work.inputReference !== candidate.work.inputReference
      )
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          "ready planning Work no longer matches its content-addressed fragment",
        );
      let recipients = selectPlanningOfferRecipientsV1({
        discovery: mesh.discovery,
        logicalTimeMs,
        verifiedAt: wallTime,
        localSupportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
        requiredCapabilityKeys: candidate.work.requiredCapabilityKeys,
        maximumRecipients: this.#maximumOfferRecipients,
      });
      recipients = await this.#filterCapabilityStateRecipients({
        recipients,
        mesh,
        objectiveId: candidate.objectiveId,
        workItemId: candidate.work.workItemId,
        workItemRevision: candidate.work.workItemRevision,
        requiredCapabilityKeys: candidate.work.requiredCapabilityKeys,
        logicalTimeMs,
      });
      if (recipients.length === 0) continue;
      const bidDeadline = earlierTimestamp(
        addMilliseconds(wallTime, currentObjective.bidWindowMs),
        candidate.work.workDeadline,
      );
      if (new Date(bidDeadline).getTime() <= new Date(wallTime).getTime())
        continue;
      const previousOffer = priorOffers.at(-1);
      const offerAttempt = priorOffers.length + 1;
      const offerId = `node.offer.${shortDigest({
        workItemId: candidate.work.workItemId,
        offerAttempt,
      })}`;
      const payload: WorkOfferPayload = {
        type: "work.offer",
        offerId,
        ...(previousOffer === undefined
          ? {}
          : { previousOfferId: previousOffer.offerId }),
        objectiveId: candidate.objectiveId,
        objectiveDocumentId: candidate.objectiveDocumentId,
        objectiveRevision: candidate.objectiveRevision,
        workItemId: candidate.work.workItemId,
        workItemRevision: candidate.work.workItemRevision,
        ownerPeerId: this.#scope.peerId,
        ownerEpoch: 1,
        offerAttempt,
        requiredCapabilityKeys: candidate.work.requiredCapabilityKeys,
        matchingAttributes: candidate.work.matchingAttributes,
        inputReference: candidate.work.inputReference,
        completionCriteria: candidate.work.completionCriteria,
        budgetReservationUnits: candidate.work.budgetReservationUnits,
        bidDeadline,
        workDeadline: candidate.work.workDeadline,
      };
      let outboundSequence = current.outboundSequence;
      const prepared = [];
      const outbox: MeshDurableOutboundDraft[] = [];
      for (const recipient of recipients) {
        outboundSequence += 1;
        const envelope = await this.#options.signing.signer.sign({
          envelope: {
            protocol: MESH_PROTOCOL,
            wireVersion: this.#options.signing.wireVersion,
            messageId: meshMessageId({
              kind: "work.reoffer",
              offerId,
              recipient: recipient.peerId,
            }),
            tenantId: this.#scope.tenantId,
            meshId: this.#scope.meshId,
            type: "work.offer",
            sender: {
              peerId: this.#scope.peerId,
              instanceId: this.#scope.instanceId,
            },
            audience: { kind: "peer", peerId: recipient.peerId },
            sequence: outboundSequence,
            sentAt: wallTime,
            expiresAt: bidDeadline,
            objectiveId: candidate.objectiveId,
            payload,
            extensions: {
              ...projection.extensions,
              [COLLECTIVE_PEER_OWNER_CONTINUITY_EXTENSION_V1]:
                ownerContinuityExtension(ownerContinuity),
            },
            criticalExtensions: projection.criticalExtensions,
            proof: {
              algorithm: this.#options.signing.algorithm,
              keyId: this.#options.signing.keyId,
            },
          },
          privateKey: this.#options.signing.privateKey,
        });
        prepared.push({
          recipientPeerId: recipient.peerId,
          preparedAt: logicalTimeMs,
          envelope,
        });
        outbox.push({
          effectId: `node.reoffer.${shortDigest({
            offerId,
            peerId: recipient.peerId,
          })}`,
          targetPeerId: recipient.peerId,
          envelope,
        });
      }
      const offered = evaluateMeshAllocationCommand(
        allocationRuntime(mesh),
        {
          kind: "allocation.offer",
          objectiveId: candidate.objectiveId,
          workItemId: candidate.work.workItemId,
          expectedWorkItemRevision: candidate.work.workItemRevision,
          recipients: prepared,
        },
        wallTime,
        logicalTimeMs,
        [PLANNING_WORK_EXTENSION_KEY_V1],
        Object.freeze(recipients.map(({ peerId }) => peerId).sort()),
      );
      if (!offered.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `local Work reoffer was rejected: ${offered.code}`,
        );
      const nextMesh = createMeshAllocationInboundRuntimeState(
        offered.state.coordination,
        offered.state.discovery,
        offered.state.objectives,
        offered.state.allocation,
        mesh.inbound,
      );
      return Object.freeze({
        status: "work_reoffered" as const,
        recordId: offerId,
        state: createCollectivePeerNodeStoredStateV1({
          scope: this.#scope,
          outboundSequence,
          runtime: Object.freeze({
            mesh: nextMesh,
            planning: current.runtime.planning,
          }),
          releases: current.releases,
          initialPlanningState: this.#initial.runtime.planning,
        }),
        outbox: Object.freeze(outbox),
      });
    }
    return undefined;
  }

  async #prepareBid(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const localBids = Object.values(mesh.allocation.localBids);
    const offers = Object.values(mesh.allocation.receivedOffers).sort((a, b) =>
      a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0,
    );
    for (const offer of offers) {
      if (
        localBids.some((bid) => bid.offerId === offer.offerId) ||
        offer.bidDeadlineAt <= logicalTimeMs ||
        offer.workDeadlineAt <= logicalTimeMs
      )
        continue;
      const payload = offer.envelope.payload;
      const objectivePolicy = historicalObjectivePolicy(
        mesh,
        payload.objectiveId,
        payload.objectiveRevision,
      );
      if (
        !objectivePolicy ||
        objectivePolicy.recoveryWitnessPeerIds.includes(this.#scope.peerId)
      )
        continue;
      recoveryWitnessPeerIds(
        objectivePolicy.recoveryWitnessPeerIds,
        payload.ownerPeerId,
        this.#scope.peerId,
        objectivePolicy.recoveryWitnessThreshold,
      );
      const agent = (
        await this.#filterCapabilityStateLocalAgents({
          operation: "bid",
          objectiveId: payload.objectiveId,
          workItemId: payload.workItemId,
          workItemRevision: payload.workItemRevision,
          requiredCapabilityKeys: payload.requiredCapabilityKeys,
          logicalTimeMs,
        })
      )[0];
      if (!agent) continue;
      const capability = Object.values(mesh.discovery.capabilities)
        .filter(
          (candidate) =>
            candidate.ownerPeerId === this.#scope.peerId &&
            candidate.instanceId === this.#scope.instanceId &&
            candidate.status === "active" &&
            candidate.expiresAt > logicalTimeMs &&
            payload.requiredCapabilityKeys.includes(candidate.capabilityKey),
        )
        .sort((left, right) =>
          left.capabilityId < right.capabilityId
            ? -1
            : left.capabilityId > right.capabilityId
              ? 1
              : 0,
        )[0];
      if (!capability) continue;
      const bidId = `node.bid.${shortDigest({
        offerId: offer.offerId,
        peerId: this.#scope.peerId,
      })}`;
      const bidExpiresAt = earlierTimestamp(
        payload.bidDeadline,
        payload.workDeadline,
      );
      const expectedCompletionAt = earlierTimestamp(
        payload.workDeadline,
        addMilliseconds(wallTime, 300_000),
      );
      const bidPayload: WorkBidPayload = {
        type: "work.bid",
        bidId,
        bidRevision: 1,
        offerId: payload.offerId,
        objectiveId: payload.objectiveId,
        objectiveDocumentId: payload.objectiveDocumentId,
        objectiveRevision: payload.objectiveRevision,
        workItemId: payload.workItemId,
        workItemRevision: payload.workItemRevision,
        ownerPeerId: payload.ownerPeerId,
        ownerEpoch: payload.ownerEpoch,
        offerAttempt: payload.offerAttempt,
        bidderPeerId: this.#scope.peerId,
        advertisementId: capability.advertisementId,
        capabilityId: capability.capabilityId,
        capabilityRevision: capability.capabilityRevision,
        capacityReservationUnits: 1,
        budgetUnits: Math.max(1, payload.budgetReservationUnits),
        bidDeadline: payload.bidDeadline,
        workDeadline: payload.workDeadline,
        expectedCompletionAt,
        bidExpiresAt,
        assumptions: [],
      };
      const outboundSequence = current.outboundSequence + 1;
      const envelope = await this.#options.signing.signer.sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion: this.#options.signing.wireVersion,
          messageId: meshMessageId({ kind: "work.bid", bidId }),
          tenantId: this.#scope.tenantId,
          meshId: this.#scope.meshId,
          type: "work.bid",
          sender: {
            peerId: this.#scope.peerId,
            instanceId: this.#scope.instanceId,
          },
          audience: { kind: "peer", peerId: payload.ownerPeerId },
          sequence: outboundSequence,
          sentAt: wallTime,
          expiresAt: bidExpiresAt,
          objectiveId: payload.objectiveId,
          causationId: offer.envelope.messageId,
          payload: bidPayload,
          proof: {
            algorithm: this.#options.signing.algorithm,
            keyId: this.#options.signing.keyId,
          },
        },
        privateKey: this.#options.signing.privateKey,
      });
      const decision = evaluateMeshAllocationCommand(
        allocationRuntime(mesh),
        {
          kind: "allocation.bid",
          offerId: offer.offerId,
          preparedAt: logicalTimeMs,
          envelope,
        },
        wallTime,
        logicalTimeMs,
      );
      if (!decision.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `local bid was rejected: ${decision.code}`,
        );
      const nextMesh = createMeshAllocationInboundRuntimeState(
        decision.state.coordination,
        decision.state.discovery,
        decision.state.objectives,
        decision.state.allocation,
        mesh.inbound,
      );
      return {
        status: "bid_submitted" as const,
        recordId: bidId,
        state: createCollectivePeerNodeStoredStateV1({
          scope: this.#scope,
          outboundSequence,
          runtime: { mesh: nextMesh, planning: current.runtime.planning },
          releases: current.releases,
          initialPlanningState: this.#initial.runtime.planning,
        }),
        outbox: Object.freeze([
          {
            effectId: `node.bid.${shortDigest({ bidId, effect: true })}`,
            targetPeerId: payload.ownerPeerId,
            envelope,
          },
        ]),
      };
    }
    return undefined;
  }

  async #prepareAward(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const offers = Object.values(mesh.allocation.localOffers).sort((a, b) =>
      a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0,
    );
    for (const offer of offers) {
      if (
        Object.values(mesh.allocation.localAwards).some(
          (award) => award.offerId === offer.offerId,
        )
      )
        continue;
      const objective = offer.objectivePolicy;
      const eligibleWitnessPeerIds = [
        ...new Set(objective.recoveryWitnessPeerIds),
      ].filter((peerId) => peerId !== this.#scope.peerId);
      if (eligibleWitnessPeerIds.length < objective.recoveryWitnessThreshold)
        continue;
      const bidCandidates = Object.values(mesh.allocation.bidHeads)
        .filter(
          (bid) =>
            bid.offerId === offer.offerId &&
            bid.bidExpiresAtLogical > logicalTimeMs &&
            !objective.recoveryWitnessPeerIds.includes(bid.bidderPeerId),
        )
        .flatMap((bid) => {
          const accepted = mesh.allocation.acceptedBidEvidence[bid.bidId];
          if (!accepted) return [];
          return [
            {
              bid,
              candidate: this.#capabilityStateCandidate({
                kind: "peer",
                peerId: bid.bidderPeerId,
                instanceId: accepted.envelope.sender.instanceId,
                agentId: null,
                requiredCapabilityKeys: offer.work.requiredCapabilityKeys,
                advertisedCapabilityKeys: offer.work.requiredCapabilityKeys,
                sourceRecordId: bid.bidId,
                sourceRevision: bid.bidRevision,
                sourceEvidence: {
                  bidId: bid.bidId,
                  bidRevision: bid.bidRevision,
                  acceptedMessageId: bid.acceptedMessageId,
                  capacityReservationUnits: bid.capacityReservationUnits,
                  expectedCompletionAt: bid.expectedCompletionAt,
                },
              }),
            },
          ];
        });
      const fusionEligible = await this.#eligibleCapabilityStateCandidateIds({
        operation: "award",
        objectiveId: offer.objectiveId,
        workItemId: offer.work.workItemId,
        workItemRevision: offer.work.workItemRevision,
        requiredCapabilityKeys: offer.work.requiredCapabilityKeys,
        candidates: bidCandidates.map(({ candidate }) => candidate),
        logicalTimeMs,
      });
      const excludedBidderPeerIds = Object.freeze(
        [
          ...new Set([
            ...objective.recoveryWitnessPeerIds,
            ...bidCandidates
              .filter(
                ({ candidate }) => !fusionEligible.has(candidate.candidateId),
              )
              .map(({ bid }) => bid.bidderPeerId),
          ]),
        ].sort(),
      );
      const selection = selectMeshAllocationBid(allocationRuntime(mesh), {
        offerId: offer.offerId,
        evaluatedAt: logicalTimeMs,
        excludedBidderPeerIds,
      });
      if (selection.reason !== "selected" || !selection.bid) continue;
      const evidence = mesh.allocation.acceptedBidEvidence[selection.bid.bidId];
      if (!evidence)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          "selected bid evidence is missing",
        );
      const currentObjective = mesh.objectives.objectives[offer.objectiveId];
      if (!currentObjective || currentObjective.status !== "active") continue;
      const ownerContinuity = await this.#resolveLocalOwnerContinuity(
        offer.objectiveId,
        offer.work.workItemId,
        logicalTimeMs,
      );
      if (!ownerContinuity) continue;
      const assignmentEpoch =
        Object.values(mesh.allocation.assignmentFenceHeads)
          .filter(
            (head) =>
              head.objectiveId === offer.objectiveId &&
              head.workItemId === offer.work.workItemId,
          )
          .reduce(
            (maximum, head) => Math.max(maximum, head.assignmentEpoch),
            0,
          ) + 1;
      const awardId = `node.award.${shortDigest({
        offerId: offer.offerId,
        bidId: selection.bid.bidId,
        assignmentEpoch,
      })}`;
      const leaseExpiresAt = earlierTimestamp(
        offer.work.workDeadline,
        addMilliseconds(wallTime, objective.maximumLeaseDurationMs),
      );
      const acceptanceDeadline = earlierTimestamp(
        leaseExpiresAt,
        addMilliseconds(wallTime, objective.acceptanceWindowMs),
      );
      const awardPayload: WorkAwardPayload = {
        type: "work.award",
        awardId,
        offerId: offer.offerId,
        bidId: selection.bid.bidId,
        bidRevision: selection.bid.bidRevision,
        objectiveId: offer.objectiveId,
        objectiveDocumentId: offer.objectiveDocumentId,
        objectiveRevision: offer.objectiveRevision,
        workItemId: offer.work.workItemId,
        workItemRevision: offer.work.workItemRevision,
        ownerPeerId: this.#scope.peerId,
        ownerEpoch: 1,
        offerAttempt: offer.offerAttempt,
        assigneePeerId: selection.bid.bidderPeerId,
        assignmentEpoch,
        authorityKind: "award",
        assignmentAuthorityId: awardId,
        fencingToken: awardId,
        budgetReservationUnits: offer.work.budgetReservationUnits,
        workDeadline: offer.work.workDeadline,
        leaseStartsAt: wallTime,
        leaseExpiresAt,
        acceptanceDeadline,
      };
      let outboundSequence = current.outboundSequence;
      const outbox: MeshDurableOutboundDraft[] = [];
      for (const witnessPeerId of recoveryWitnessPeerIds(
        objective.recoveryWitnessPeerIds,
        this.#scope.peerId,
        selection.bid.bidderPeerId,
        objective.recoveryWitnessThreshold,
      )) {
        outboundSequence += 1;
        const witnessEnvelope = await this.#signWitnessEnvelope({
          payload: awardPayload,
          messageId: witnessAwardMessageId(awardId, witnessPeerId),
          sequence: outboundSequence,
          sentAt: wallTime,
          expiresAt: acceptanceDeadline,
          causationId: evidence.envelope.messageId,
          witnessPeerId,
          ownerContinuity,
        });
        const effectId = witnessAwardEffectId(awardId, witnessPeerId);
        outbox.push({
          effectId,
          targetPeerId: witnessPeerId,
          envelope: witnessEnvelope,
        });
      }
      outboundSequence += 1;
      const envelope = await this.#options.signing.signer.sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion: this.#options.signing.wireVersion,
          messageId: meshMessageId({ kind: "work.award", awardId }),
          tenantId: this.#scope.tenantId,
          meshId: this.#scope.meshId,
          type: "work.award",
          sender: {
            peerId: this.#scope.peerId,
            instanceId: this.#scope.instanceId,
          },
          audience: { kind: "peer", peerId: selection.bid.bidderPeerId },
          sequence: outboundSequence,
          sentAt: wallTime,
          expiresAt: acceptanceDeadline,
          objectiveId: offer.objectiveId,
          causationId: evidence.envelope.messageId,
          payload: awardPayload,
          extensions: {
            [COLLECTIVE_PEER_OWNER_CONTINUITY_EXTENSION_V1]:
              ownerContinuityExtension(ownerContinuity),
          },
          proof: {
            algorithm: this.#options.signing.algorithm,
            keyId: this.#options.signing.keyId,
          },
        },
        privateKey: this.#options.signing.privateKey,
      });
      const decision = evaluateMeshAllocationCommand(
        allocationRuntime(mesh),
        {
          kind: "allocation.award",
          offerId: offer.offerId,
          bidId: selection.bid.bidId,
          bidRevision: selection.bid.bidRevision,
          excludedBidderPeerIds,
          recipient: {
            recipientPeerId: selection.bid.bidderPeerId,
            preparedAt: logicalTimeMs,
            envelope,
          },
        },
        wallTime,
        logicalTimeMs,
      );
      if (!decision.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `local award was rejected: ${decision.code}`,
        );
      const nextMesh = createMeshAllocationInboundRuntimeState(
        decision.state.coordination,
        decision.state.discovery,
        decision.state.objectives,
        decision.state.allocation,
        mesh.inbound,
      );
      return {
        status: "award_issued" as const,
        recordId: awardId,
        state: createCollectivePeerNodeStoredStateV1({
          scope: this.#scope,
          outboundSequence,
          runtime: { mesh: nextMesh, planning: current.runtime.planning },
          releases: current.releases,
          initialPlanningState: this.#initial.runtime.planning,
        }),
        outbox: Object.freeze([
          ...outbox,
          {
            effectId: `node.award.${shortDigest({ awardId, effect: true })}`,
            targetPeerId: selection.bid.bidderPeerId,
            envelope,
          },
        ]),
      };
    }
    return undefined;
  }

  async #prepareAssignmentAcceptance(
    current: CollectivePeerNodeStoredStateV1,
    wallTime: string,
    logicalTimeMs: number,
  ) {
    const mesh = current.runtime.mesh;
    const awards = Object.values(mesh.allocation.receivedAwards).sort((a, b) =>
      a.awardId < b.awardId ? -1 : a.awardId > b.awardId ? 1 : 0,
    );
    for (const award of awards) {
      if (award.status !== "awaiting_response") continue;
      const payload = award.envelope.payload;
      const offer = mesh.allocation.receivedOffers[payload.offerId];
      if (!offer) continue;
      if (payload.resumeCheckpointId !== undefined) {
        if (!this.#options.executionCheckpoints) continue;
        let recoverable = false;
        try {
          recoverable = Boolean(
            await this.#options.executionCheckpoints.resolve({
              checkpointId: payload.resumeCheckpointId,
              tenantId: this.#scope.tenantId,
              meshId: this.#scope.meshId,
              policyDomainId: this.#scope.policyDomainId,
              objectiveId: payload.objectiveId,
              workItemId: payload.workItemId,
              workItemRevision: payload.workItemRevision,
              previousAssignmentEpoch: payload.assignmentEpoch - 1,
            }),
          );
        } catch {
          recoverable = false;
        }
        if (!recoverable) continue;
      }
      const eligibleAgents = await this.#filterCapabilityStateLocalAgents({
        operation: "assignment_acceptance",
        objectiveId: payload.objectiveId,
        workItemId: payload.workItemId,
        workItemRevision: payload.workItemRevision,
        requiredCapabilityKeys: offer.envelope.payload.requiredCapabilityKeys,
        logicalTimeMs,
      });
      if (eligibleAgents.length === 0) continue;
      const acceptanceId = `node.acceptance.${shortDigest({
        awardId: award.awardId,
        peerId: this.#scope.peerId,
      })}`;
      const acceptancePayload: WorkAcceptPayload = {
        type: "work.accept",
        acceptanceId,
        awardId: payload.awardId,
        objectiveId: payload.objectiveId,
        objectiveDocumentId: payload.objectiveDocumentId,
        objectiveRevision: payload.objectiveRevision,
        workItemId: payload.workItemId,
        workItemRevision: payload.workItemRevision,
        ownerPeerId: payload.ownerPeerId,
        ownerEpoch: payload.ownerEpoch,
        assigneePeerId: this.#scope.peerId,
        assignmentEpoch: payload.assignmentEpoch,
        assignmentAuthorityId: payload.assignmentAuthorityId,
        fencingToken: payload.fencingToken,
        acceptanceDeadline: payload.acceptanceDeadline,
      };
      const objective = historicalObjectivePolicy(
        mesh,
        payload.objectiveId,
        payload.objectiveRevision,
      );
      const currentObjective = mesh.objectives.objectives[payload.objectiveId];
      if (
        !objective ||
        !currentObjective ||
        currentObjective.status !== "active"
      )
        continue;
      let outboundSequence = current.outboundSequence;
      const outbox: MeshDurableOutboundDraft[] = [];
      for (const witnessPeerId of recoveryWitnessPeerIds(
        objective.recoveryWitnessPeerIds,
        payload.ownerPeerId,
        this.#scope.peerId,
        objective.recoveryWitnessThreshold,
      )) {
        outboundSequence += 1;
        const witnessEnvelope = await this.#signWitnessEnvelope({
          payload: acceptancePayload,
          messageId: witnessAcceptanceMessageId(acceptanceId, witnessPeerId),
          sequence: outboundSequence,
          sentAt: wallTime,
          expiresAt: payload.acceptanceDeadline,
          causationId: witnessAwardMessageId(payload.awardId, witnessPeerId),
          witnessPeerId,
        });
        const effectId = witnessAcceptanceEffectId(acceptanceId, witnessPeerId);
        outbox.push({
          effectId,
          targetPeerId: witnessPeerId,
          envelope: witnessEnvelope,
        });
      }
      outboundSequence += 1;
      const envelope = await this.#options.signing.signer.sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion: this.#options.signing.wireVersion,
          messageId: meshMessageId({
            kind: "work.accept",
            acceptanceId,
          }),
          tenantId: this.#scope.tenantId,
          meshId: this.#scope.meshId,
          type: "work.accept",
          sender: {
            peerId: this.#scope.peerId,
            instanceId: this.#scope.instanceId,
          },
          audience: { kind: "peer", peerId: payload.ownerPeerId },
          sequence: outboundSequence,
          sentAt: wallTime,
          expiresAt: payload.acceptanceDeadline,
          objectiveId: payload.objectiveId,
          causationId: award.envelope.messageId,
          payload: acceptancePayload,
          proof: {
            algorithm: this.#options.signing.algorithm,
            keyId: this.#options.signing.keyId,
          },
        },
        privateKey: this.#options.signing.privateKey,
      });
      const decision = evaluateMeshAllocationCommand(
        allocationRuntime(mesh),
        {
          kind: "allocation.assignment_response",
          awardId: award.awardId,
          preparedAt: logicalTimeMs,
          envelope,
        },
        wallTime,
        logicalTimeMs,
      );
      if (!decision.accepted)
        throw new CollectivePeerRuntimeErrorV1(
          "STATE_CONFLICT",
          `local assignment acceptance was rejected: ${decision.code}`,
        );
      const nextMesh = createMeshAllocationInboundRuntimeState(
        decision.state.coordination,
        decision.state.discovery,
        decision.state.objectives,
        decision.state.allocation,
        mesh.inbound,
      );
      return {
        status: "assignment_accepted" as const,
        recordId: acceptanceId,
        state: createCollectivePeerNodeStoredStateV1({
          scope: this.#scope,
          outboundSequence,
          runtime: { mesh: nextMesh, planning: current.runtime.planning },
          releases: current.releases,
          initialPlanningState: this.#initial.runtime.planning,
        }),
        outbox: Object.freeze([
          ...outbox,
          {
            effectId: `node.acceptance.${shortDigest({
              acceptanceId,
              effect: true,
            })}`,
            targetPeerId: payload.ownerPeerId,
            envelope,
          },
        ]),
      };
    }
    return undefined;
  }

  async #preparePlanTransition(
    current: CollectivePeerNodeStoredStateV1,
    proposal: PlanFragmentProposalV1,
    logicalTimeMs: number,
  ): Promise<{
    readonly state: CollectivePeerNodeStoredStateV1;
    readonly status: "recorded" | "pending_recipients" | "offered";
    readonly fragment: PlanFragmentV1 | null;
    readonly projection: PlanningLocalWorkProjectionV1 | null;
    readonly recipientPeerIds: readonly string[];
    readonly outbox: readonly MeshDurableOutboundDraft[];
  }> {
    let planning = current.runtime.planning;
    if (logicalTimeMs > planning.planView.logicalTimeHighWaterMs)
      planning = applyPlanning(planning, {
        schemaVersion: 1,
        kind: "logical-time.advance",
        expectedStateDigest: null,
        logicalTimeMs,
      });
    planning = applyPlanning(planning, {
      schemaVersion: 1,
      kind: "proposal.record",
      expectedStateDigest: null,
      proposal,
    });
    if (
      !planning.planView.decisions.some(
        ({ proposalDigest }) => proposalDigest === proposal.proposalDigest,
      )
    ) {
      const decided = new Set(
        planning.planView.decisions.map(({ proposalDigest }) => proposalDigest),
      );
      const candidateProposalDigests = planning.planView.proposals
        .filter(
          (candidate) =>
            candidate.semanticSlotKey === proposal.semanticSlotKey &&
            !decided.has(candidate.proposalDigest),
        )
        .map(({ proposalDigest }) => proposalDigest)
        .sort();
      planning = applyPlanning(planning, {
        schemaVersion: 1,
        kind: "slot.evaluate",
        expectedStateDigest: null,
        semanticSlotKey: proposal.semanticSlotKey,
        candidateProposalDigests,
        decidedAtLogicalMs: logicalTimeMs,
      });
    }
    let fragment = fragmentForProposal(planning, proposal.proposalDigest);
    if (!fragment) {
      return {
        state: this.#state(current, current.runtime.mesh, planning),
        status: "recorded",
        fragment: null,
        projection: null,
        recipientPeerIds: Object.freeze([]),
        outbox: Object.freeze([]),
      };
    }
    const workItemId = planningWorkItemIdV1(proposal.proposalDigest);
    if (fragment.status === "active") {
      planning = applyPlanning(planning, {
        schemaVersion: 1,
        kind: "fragment.project-to-work",
        expectedStateDigest: null,
        fragmentId: fragment.fragmentId,
        previousFragmentDigest: fragment.fragmentDigest,
        workTarget: {
          schemaVersion: 1,
          meshId: this.#scope.meshId,
          objectiveId: planning.missionIntent.objective.objectiveId,
          workItemId,
          workItemRevision: 1,
        },
        transitionedAtLogicalMs: logicalTimeMs,
      });
      fragment = fragmentForProposal(planning, proposal.proposalDigest);
    }
    if (!fragment || fragment.status !== "offered")
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "selected planning fragment is not offerable",
      );
    const projection = createPlanningLocalWorkProjectionV1({
      missionIntent: planning.missionIntent,
      sourcePlanView: planning.planView,
      fragment,
    });
    await this.#options.fragments.put(projection.repositoryRecord);

    const now = normalizeClockReading(this.#options.clock.now());
    const objectiveId = planning.missionIntent.objective.objectiveId;
    const objective = current.runtime.mesh.objectives.objectives[objectiveId];
    if (!objective || objective.status !== "active")
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "the planning Objective is not current in the local Mesh view",
      );
    const ownerContinuity = await this.#resolveLocalOwnerContinuity(
      objectiveId,
      workItemId,
      logicalTimeMs,
    );
    if (!ownerContinuity)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "local Work owner authority is not current",
      );
    const created = evaluateMeshObjectiveWorkCommand(
      createMeshObjectiveWorkRuntimeState(
        current.runtime.mesh.coordination,
        current.runtime.mesh.discovery,
        current.runtime.mesh.objectives,
      ),
      { kind: "work.create", input: projection.work },
      { verifiedAt: now.wallTime, receivedAt: logicalTimeMs },
    );
    if (!created.accepted)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        `local Work creation was rejected: ${created.code}`,
      );
    let mesh = createMeshAllocationInboundRuntimeState(
      created.state.coordination,
      created.state.discovery,
      created.state.objectives,
      current.runtime.mesh.allocation,
      current.runtime.mesh.inbound,
    );
    let recipients = selectPlanningOfferRecipientsV1({
      discovery: mesh.discovery,
      logicalTimeMs,
      verifiedAt: now.wallTime,
      localSupportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
      requiredCapabilityKeys: projection.work.requiredCapabilityKeys,
      maximumRecipients: this.#maximumOfferRecipients,
    });
    recipients = await this.#filterCapabilityStateRecipients({
      recipients,
      mesh,
      objectiveId,
      workItemId,
      workItemRevision: projection.workItemRevision,
      requiredCapabilityKeys: projection.work.requiredCapabilityKeys,
      logicalTimeMs,
    });
    const recipientPeerIds = Object.freeze(
      recipients.map(({ peerId }) => peerId).sort(),
    );
    if (recipients.length === 0) {
      return {
        state: this.#state(current, mesh, planning),
        status: "pending_recipients",
        fragment,
        projection,
        recipientPeerIds,
        outbox: Object.freeze([]),
      };
    }

    const work = mesh.objectives.workItems[workItemId];
    if (!work)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "the locally created Work projection is missing",
      );
    const offerId = `planning.offer.${proposal.proposalDigest.slice(7)}`;
    const bidDeadline = addMilliseconds(now.wallTime, objective.bidWindowMs);
    if (projection.work.inputReference === undefined)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        "the planning Work projection has no content reference",
      );
    const payload: WorkOfferPayload = {
      type: "work.offer",
      offerId,
      objectiveId,
      objectiveDocumentId: objective.objectiveDocumentId,
      objectiveRevision: objective.objectiveRevision,
      workItemId,
      workItemRevision: projection.workItemRevision,
      ownerPeerId: this.#scope.peerId,
      ownerEpoch: 1,
      offerAttempt: work.offerAttempt + 1,
      requiredCapabilityKeys: projection.work.requiredCapabilityKeys,
      matchingAttributes: projection.work.matchingAttributes ?? {},
      inputReference: projection.work.inputReference,
      completionCriteria: projection.work.completionCriteria,
      budgetReservationUnits: projection.work.budgetReservationUnits,
      bidDeadline,
      workDeadline: projection.work.workDeadline,
    };
    let outboundSequence = current.outboundSequence;
    const prepared = [];
    const outbox: MeshDurableOutboundDraft[] = [];
    for (const recipient of recipients) {
      outboundSequence += 1;
      const messageId = meshMessageId({
        kind: "work.offer",
        step: proposal.proposalId,
        recipient: recipient.peerId,
      });
      const envelope = await this.#options.signing.signer.sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion: this.#options.signing.wireVersion,
          messageId,
          tenantId: this.#scope.tenantId,
          meshId: this.#scope.meshId,
          type: "work.offer",
          sender: {
            peerId: this.#scope.peerId,
            instanceId: this.#scope.instanceId,
          },
          audience: { kind: "peer", peerId: recipient.peerId },
          sequence: outboundSequence,
          sentAt: now.wallTime,
          expiresAt: bidDeadline,
          objectiveId,
          payload,
          extensions: {
            ...projection.extensions,
            [COLLECTIVE_PEER_OWNER_CONTINUITY_EXTENSION_V1]:
              ownerContinuityExtension(ownerContinuity),
          },
          criticalExtensions: projection.criticalExtensions,
          proof: {
            algorithm: this.#options.signing.algorithm,
            keyId: this.#options.signing.keyId,
          },
        },
        privateKey: this.#options.signing.privateKey,
      });
      prepared.push({
        recipientPeerId: recipient.peerId,
        preparedAt: logicalTimeMs,
        envelope,
      });
      outbox.push({
        effectId: `node.offer.${shortDigest({ offerId, peerId: recipient.peerId })}`,
        targetPeerId: recipient.peerId,
        envelope,
      });
    }
    const offered = evaluateMeshAllocationCommand(
      allocationRuntime(mesh),
      {
        kind: "allocation.offer",
        objectiveId,
        workItemId,
        expectedWorkItemRevision: projection.workItemRevision,
        recipients: prepared,
      },
      now.wallTime,
      logicalTimeMs,
      [PLANNING_WORK_EXTENSION_KEY_V1],
      recipientPeerIds,
    );
    if (!offered.accepted)
      throw new CollectivePeerRuntimeErrorV1(
        "STATE_CONFLICT",
        `local Work offer was rejected: ${offered.code}`,
      );
    mesh = createMeshAllocationInboundRuntimeState(
      offered.state.coordination,
      offered.state.discovery,
      offered.state.objectives,
      offered.state.allocation,
      mesh.inbound,
    );
    return {
      state: createCollectivePeerNodeStoredStateV1({
        scope: this.#scope,
        outboundSequence,
        runtime: { mesh, planning },
        releases: current.releases,
        initialPlanningState: this.#initial.runtime.planning,
      }),
      status: "offered",
      fragment,
      projection,
      recipientPeerIds,
      outbox: Object.freeze(outbox),
    };
  }

  #state(
    current: CollectivePeerNodeStoredStateV1,
    mesh: MeshAllocationInboundRuntimeState,
    planning: PlanningReducerStateV1,
  ): CollectivePeerNodeStoredStateV1 {
    return createCollectivePeerNodeStoredStateV1({
      scope: this.#scope,
      outboundSequence: current.outboundSequence,
      runtime: { mesh, planning },
      releases: current.releases,
      initialPlanningState: this.#initial.runtime.planning,
    });
  }

  #capabilityStateCandidate(input: {
    readonly kind: "peer" | "local_agent";
    readonly peerId: string;
    readonly instanceId: string;
    readonly agentId: string | null;
    readonly requiredCapabilityKeys: readonly string[];
    readonly advertisedCapabilityKeys: readonly string[];
    readonly sourceRecordId: string | null;
    readonly sourceRevision: number;
    readonly sourceEvidence: PlanningJson;
  }): CapabilityStateCandidateV1 {
    const candidateId = `capability-state-candidate.${shortDigest({
      kind: input.kind,
      peerId: input.peerId,
      instanceId: input.instanceId,
      agentId: input.agentId,
      sourceRecordId: input.sourceRecordId,
    })}`;
    return createCapabilityStateCandidateV1({
      schemaVersion: 1,
      candidateId,
      kind: input.kind,
      peerId: input.peerId,
      instanceId: input.instanceId,
      agentId: input.agentId,
      requiredCapabilityKeys: Object.freeze(
        [...new Set(input.requiredCapabilityKeys)].sort(),
      ),
      advertisedCapabilityKeys: Object.freeze(
        [...new Set(input.advertisedCapabilityKeys)].sort(),
      ),
      sourceEvidenceDigest: digestPlanningJsonV1(
        "capability-state-candidate",
        input.sourceEvidence,
      ),
      sourceRecordId: input.sourceRecordId,
      sourceRevision: input.sourceRevision,
    });
  }

  async #eligibleCapabilityStateCandidateIds(input: {
    readonly operation: CapabilityStateOperationV1;
    readonly objectiveId: string;
    readonly workItemId: string | null;
    readonly workItemRevision: number | null;
    readonly requiredCapabilityKeys: readonly string[];
    readonly candidates: readonly CapabilityStateCandidateV1[];
    readonly logicalTimeMs: number;
  }): Promise<ReadonlySet<string>> {
    if (input.candidates.length === 0) return new Set();
    const ordered = Object.freeze(
      [...input.candidates].sort((left, right) =>
        left.candidateId < right.candidateId
          ? -1
          : left.candidateId > right.candidateId
            ? 1
            : 0,
      ),
    );
    const port = this.#options.capabilityState;
    if (!port) return new Set(ordered.map(({ candidateId }) => candidateId));
    try {
      const request = createCapabilityStateFusionRequestV1({
        schemaVersion: 1,
        requestId: `node.capability-state.${shortDigest({
          operation: input.operation,
          objectiveId: input.objectiveId,
          workItemId: input.workItemId,
          workItemRevision: input.workItemRevision,
          logicalTimeMs: input.logicalTimeMs,
          candidateDigests: ordered.map(
            ({ candidateDigest }) => candidateDigest,
          ),
        })}`,
        operation: input.operation,
        scope: {
          tenantId: this.#scope.tenantId,
          meshId: this.#scope.meshId,
          policyDomainId: this.#scope.policyDomainId,
          missionIntentId: this.#scope.missionIntentId,
          objectiveId: input.objectiveId,
          workItemId: input.workItemId,
          workItemRevision: input.workItemRevision,
        },
        logicalTimeMs: input.logicalTimeMs,
        requiredCapabilityKeys: Object.freeze(
          [...new Set(input.requiredCapabilityKeys)].sort(),
        ),
        candidates: ordered,
      });
      const decision = validateCapabilityStateFusionDecisionV1({
        decision: await port.evaluate(request),
        request,
        expected: port,
        logicalTimeMs: input.logicalTimeMs,
      });
      return new Set(
        decision.candidates
          .filter(({ disposition }) => disposition === "eligible")
          .map(({ candidateId }) => candidateId),
      );
    } catch {
      return new Set();
    }
  }

  async #filterCapabilityStateRecipients(input: {
    readonly recipients: readonly Readonly<{
      readonly peerId: string;
      readonly peerCardId: string;
      readonly cardRevision: number;
      readonly planningCapabilityId: string;
      readonly planningCapabilityRevision: number;
    }>[];
    readonly mesh: MeshAllocationInboundRuntimeState;
    readonly objectiveId: string;
    readonly workItemId: string;
    readonly workItemRevision: number;
    readonly requiredCapabilityKeys: readonly string[];
    readonly logicalTimeMs: number;
  }) {
    if (!this.#options.capabilityState) return input.recipients;
    const pairs = input.recipients.flatMap((recipient) => {
      const card = input.mesh.discovery.peerCards[recipient.peerId];
      if (!card) return [];
      const capabilities = Object.values(input.mesh.discovery.capabilities)
        .filter(
          (capability) =>
            capability.ownerPeerId === recipient.peerId &&
            capability.instanceId === card.instanceId &&
            capability.status === "active" &&
            capability.expiresAt > input.logicalTimeMs,
        )
        .sort((left, right) =>
          left.capabilityId < right.capabilityId
            ? -1
            : left.capabilityId > right.capabilityId
              ? 1
              : 0,
        );
      const candidate = this.#capabilityStateCandidate({
        kind: "peer",
        peerId: recipient.peerId,
        instanceId: card.instanceId,
        agentId: null,
        requiredCapabilityKeys: input.requiredCapabilityKeys,
        advertisedCapabilityKeys: capabilities.map(
          ({ capabilityKey }) => capabilityKey,
        ),
        sourceRecordId: recipient.peerCardId,
        sourceRevision: recipient.cardRevision,
        sourceEvidence: {
          peerCardId: recipient.peerCardId,
          cardRevision: recipient.cardRevision,
          planningCapabilityId: recipient.planningCapabilityId,
          planningCapabilityRevision: recipient.planningCapabilityRevision,
          capabilityBindings: capabilities.map((capability) => ({
            capabilityId: capability.capabilityId,
            capabilityRevision: capability.capabilityRevision,
            capabilityKey: capability.capabilityKey,
          })),
        },
      });
      return [{ recipient, candidate }];
    });
    const eligible = await this.#eligibleCapabilityStateCandidateIds({
      operation: "offer_recipient",
      objectiveId: input.objectiveId,
      workItemId: input.workItemId,
      workItemRevision: input.workItemRevision,
      requiredCapabilityKeys: input.requiredCapabilityKeys,
      candidates: pairs.map(({ candidate }) => candidate),
      logicalTimeMs: input.logicalTimeMs,
    });
    return Object.freeze(
      pairs
        .filter(({ candidate }) => eligible.has(candidate.candidateId))
        .map(({ recipient }) => recipient),
    );
  }

  async #filterCapabilityStateLocalAgents(input: {
    readonly operation: "bid" | "assignment_acceptance" | "recovery";
    readonly objectiveId: string;
    readonly workItemId: string;
    readonly workItemRevision: number;
    readonly requiredCapabilityKeys: readonly string[];
    readonly logicalTimeMs: number;
  }): Promise<readonly CollectivePeerNodeAgentRegistrationV1[]> {
    const agents = [...this.#agents.values()].filter((agent) =>
      input.requiredCapabilityKeys.every((capabilityKey) =>
        agent.capabilityKeys.includes(capabilityKey),
      ),
    );
    if (!this.#options.capabilityState) return Object.freeze(agents);
    const pairs = agents.map((agent) => ({
      agent,
      candidate: this.#capabilityStateCandidate({
        kind: "local_agent",
        peerId: this.#scope.peerId,
        instanceId: this.#scope.instanceId,
        agentId: agent.binding.agentId,
        requiredCapabilityKeys: input.requiredCapabilityKeys,
        advertisedCapabilityKeys: agent.capabilityKeys,
        sourceRecordId: agent.binding.agentId,
        sourceRevision: 1,
        sourceEvidence: {
          agentId: agent.binding.agentId,
          adapterId: agent.binding.adapterId,
          adapterVersion: agent.binding.adapterVersion,
          capabilityKeys: [...agent.capabilityKeys],
          maximumConcurrency: agent.maximumConcurrency ?? 1,
        },
      }),
    }));
    const eligible = await this.#eligibleCapabilityStateCandidateIds({
      operation: input.operation,
      objectiveId: input.objectiveId,
      workItemId: input.workItemId,
      workItemRevision: input.workItemRevision,
      requiredCapabilityKeys: input.requiredCapabilityKeys,
      candidates: pairs.map(({ candidate }) => candidate),
      logicalTimeMs: input.logicalTimeMs,
    });
    return Object.freeze(
      pairs
        .filter(({ candidate }) => eligible.has(candidate.candidateId))
        .map(({ agent }) => agent),
    );
  }

  #decodeSnapshot(snapshot: MeshDurablePeerSnapshot) {
    return restoreCollectivePeerNodeStoredStateV1({
      value: snapshot.state,
      expectedScope: this.#scope,
      initialPlanningState: this.#initial.runtime.planning,
    });
  }

  #snapshot(snapshot: MeshDurablePeerSnapshot) {
    return createCollectivePeerNodeSnapshotV1({
      durable: snapshot,
      expectedScope: this.#scope,
      initialPlanningState: this.#initial.runtime.planning,
    });
  }

  #assertControlBinding(actual: {
    readonly controlId: string;
    readonly controlVersion: number;
    readonly implementationId: string;
  }): void {
    const expected = this.#options.expectedControlBinding;
    if (
      actual.controlId !== expected.controlId ||
      actual.controlVersion !== expected.controlVersion ||
      actual.implementationId !== expected.implementationId
    )
      throw new CollectivePeerRuntimeErrorV1(
        "SESSION_BINDING_INVALID",
        "portable agent session is not bound to the node control policy",
      );
  }
}

interface DerivedExecutionAssignmentV1 {
  readonly source: MeshWorkContractSourceV1;
  readonly adaptiveRole: PlanningAdaptiveRoleResultV1;
  readonly agent: CollectivePeerNodeAgentRegistrationV1;
  readonly execution: MeshExecutionHeadProjection;
  readonly fenceHead: MeshAssignmentFenceHeadProjection;
  readonly offer: MeshReceivedOfferProjection;
  readonly fragment: PlanFragmentV1;
  readonly mapping: PlanningReducerStateV1["planView"]["workMappings"][number];
  readonly repositoryRecord: PlanningFragmentRepositoryRecordV1;
  readonly extension: PlanningWorkExtensionV1;
}

function sameExecutionAssignment(
  left: DerivedExecutionAssignmentV1,
  right: DerivedExecutionAssignmentV1,
): boolean {
  return (
    left.execution.executionScopeKey === right.execution.executionScopeKey &&
    left.execution.assignmentAuthorityId ===
      right.execution.assignmentAuthorityId &&
    left.execution.assignmentEpoch === right.execution.assignmentEpoch &&
    left.execution.fencingToken === right.execution.fencingToken &&
    left.execution.assigneePeerId === right.execution.assigneePeerId &&
    left.fragment.fragmentDigest === right.fragment.fragmentDigest &&
    left.agent.binding.agentId === right.agent.binding.agentId
  );
}

function remoteWorkItem(
  objective: MeshObjectiveProjection,
  offer: MeshReceivedOfferProjection,
  execution: MeshExecutionHeadProjection,
): MeshWorkItemProjection {
  const payload = offer.envelope.payload;
  if (
    payload.objectiveId !== objective.objectiveId ||
    payload.objectiveDocumentId !== objective.objectiveDocumentId ||
    payload.objectiveRevision !== objective.objectiveRevision ||
    payload.workItemId !== execution.workItemId ||
    payload.workItemRevision !== execution.workItemRevision ||
    payload.ownerPeerId !== execution.ownerPeerId ||
    payload.ownerEpoch !== execution.ownerEpoch
  )
    throw new CollectivePeerRuntimeErrorV1(
      "STATE_CONFLICT",
      "received Work evidence does not match the active assignment",
    );
  return Object.freeze({
    objectiveId: payload.objectiveId,
    objectiveDocumentId: payload.objectiveDocumentId,
    objectiveRevision: payload.objectiveRevision,
    objectivePolicy: Object.freeze({
      objectiveId: objective.objectiveId,
      objectiveDocumentId: objective.objectiveDocumentId,
      objectiveRevision: objective.objectiveRevision,
      acceptedMessageId: objective.acceptedMessageId,
      acceptedAt: objective.acceptedAt,
      expiresAt: objective.expiresAt,
      permittedCapabilityKeys: Object.freeze([
        ...objective.permittedCapabilityKeys,
      ]),
      maximumBudgetUnits: objective.maximumBudgetUnits,
      acceptanceWindowMs: objective.acceptanceWindowMs,
      maximumLeaseDurationMs: objective.maximumLeaseDurationMs,
      recoveryGraceMs: objective.recoveryGraceMs,
      maximumLeaseRenewals: objective.maximumLeaseRenewals,
      recoveryWitnessPeerIds: Object.freeze([
        ...objective.recoveryWitnessPeerIds,
      ]),
      recoveryWitnessThreshold: objective.recoveryWitnessThreshold,
      validUntil: objective.validUntil,
    }),
    workItemId: payload.workItemId,
    workItemRevision: payload.workItemRevision,
    ownerPeerId: payload.ownerPeerId,
    ownerEpoch: 1,
    requiredCapabilityKeys: Object.freeze([...payload.requiredCapabilityKeys]),
    matchingAttributes: Object.freeze({ ...payload.matchingAttributes }),
    completionCriteria: Object.freeze([...payload.completionCriteria]),
    ...(payload.inputReference === undefined
      ? {}
      : { inputReference: payload.inputReference }),
    budgetReservationUnits: payload.budgetReservationUnits,
    workDeadline: payload.workDeadline,
    workDeadlineAt: offer.workDeadlineAt,
    offerAttempt: payload.offerAttempt,
    status: "ready",
    createdAt: offer.receivedAt,
    updatedAt: offer.receivedAt,
  });
}

function executionAuthority(execution: MeshExecutionHeadProjection) {
  return Object.freeze({
    objectiveId: execution.objectiveId,
    objectiveDocumentId: execution.objectiveDocumentId,
    objectiveRevision: execution.objectiveRevision,
    workItemId: execution.workItemId,
    workItemRevision: execution.workItemRevision,
    ownerPeerId: execution.ownerPeerId,
    ownerEpoch: execution.ownerEpoch,
    assigneePeerId: execution.assigneePeerId,
    awardId: execution.awardId,
    acceptanceId: execution.acceptanceId,
    assignmentEpoch: execution.assignmentEpoch,
    assignmentAuthorityId: execution.assignmentAuthorityId,
    fencingToken: execution.fencingToken,
    leaseExpiresAt: execution.leaseExpiresAt,
  });
}

function releaseForStep(
  state: CollectivePeerNodeStoredStateV1,
  workItemId: string,
  stepId: string,
): CollectivePeerNodeExecutionReleaseV1 | undefined {
  const currentFence = Object.values(
    state.runtime.mesh.allocation.assignmentFenceHeads,
  )
    .filter((candidate) => candidate.workItemId === workItemId)
    .sort((left, right) => right.assignmentEpoch - left.assignmentEpoch)[0];
  if (!currentFence) return undefined;
  return state.releases.find(
    (release) =>
      release.workItemId === workItemId &&
      release.stepId === stepId &&
      release.assignmentEpoch === currentFence.assignmentEpoch &&
      release.assignmentAuthorityId === currentFence.assignmentAuthorityId &&
      release.assignmentFencingToken === currentFence.fencingToken,
  );
}

function withheldExecution(
  reasonCode: string,
  durableRevision: number,
): CollectivePeerNodeExecuteOutcomeV1 {
  return Object.freeze({
    status: "withheld",
    reasonCode: safeReasonCode(reasonCode),
    durableRevision,
  });
}

function normalizeActionResolution(
  value: CollectivePeerNodeActionResolutionV1,
  actionId: string,
  actionDigest: string,
  effectId: string,
): CollectivePeerNodeActionResolutionV1 {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).sort().join("\u0000") !==
      "actionDigest\u0000actionId\u0000effectId\u0000outcomeId\u0000reasonCode\u0000status" ||
    value.effectId !== effectId ||
    value.actionId !== actionId ||
    value.actionDigest !== actionDigest ||
    !["dispatched", "failed", "indeterminate"].includes(value.status) ||
    !IDENTIFIER.test(value.outcomeId) ||
    (value.reasonCode !== null && !IDENTIFIER.test(value.reasonCode)) ||
    (value.status === "dispatched" && value.reasonCode !== null) ||
    (value.status !== "dispatched" && value.reasonCode === null)
  )
    throw new TypeError("action gateway returned an invalid resolution");
  return Object.freeze({ ...value });
}

function sameContinuityHead(
  left: MeshAuthorityCurrentBindingV1,
  right: MeshAuthorityCurrentBindingV1,
): boolean {
  return (
    left.scopeKey === right.scopeKey &&
    left.generation === right.generation &&
    left.headDigest === right.headDigest &&
    left.fencingToken === right.fencingToken &&
    left.holder.peerId === right.holder.peerId &&
    left.holder.instanceId === right.holder.instanceId &&
    left.holder.keyId === right.holder.keyId
  );
}

function ownerContinuityExtension(
  binding: MeshAuthorityCurrentBindingV1,
): MeshJsonValue {
  return {
    schemaVersion: 1,
    scopeKey: binding.scopeKey,
    generation: binding.generation,
    holder: {
      schemaVersion: 1,
      peerId: binding.holder.peerId,
      instanceId: binding.holder.instanceId,
      keyId: binding.holder.keyId,
    },
    headDigest: binding.headDigest,
    fencingToken: binding.fencingToken,
    logicalTimeMs: binding.logicalTimeMs,
  };
}

function parseOwnerContinuityExtension(
  value: MeshJsonValue | undefined,
): MeshAuthorityCurrentBindingV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as unknown as MeshAuthorityCurrentBindingV1;
  if (
    Object.keys(value).sort().join("\u0000") !==
      "fencingToken\u0000generation\u0000headDigest\u0000holder\u0000logicalTimeMs\u0000schemaVersion\u0000scopeKey" ||
    candidate.schemaVersion !== 1 ||
    typeof candidate.scopeKey !== "string" ||
    !Number.isSafeInteger(candidate.generation) ||
    candidate.generation < 1 ||
    !candidate.holder ||
    typeof candidate.holder !== "object" ||
    Object.keys(candidate.holder).sort().join("\u0000") !==
      "instanceId\u0000keyId\u0000peerId\u0000schemaVersion" ||
    candidate.holder.schemaVersion !== 1 ||
    !IDENTIFIER.test(candidate.holder.peerId) ||
    !IDENTIFIER.test(candidate.holder.instanceId) ||
    !IDENTIFIER.test(candidate.holder.keyId) ||
    !AUTHORITY_DIGEST.test(candidate.headDigest) ||
    !IDENTIFIER.test(candidate.fencingToken) ||
    !Number.isSafeInteger(candidate.logicalTimeMs) ||
    candidate.logicalTimeMs < 0
  )
    return null;
  return Object.freeze({
    ...candidate,
    holder: Object.freeze({ ...candidate.holder }),
  });
}

function recoveryElectionScopeDigest(proposed: LeaseTakeoverProposalPayload) {
  return digestPlanningJsonV1("planning-reducer-command-identity", {
    schemaVersion: 1,
    kind: "collective.recovery-election",
    objectiveId: proposed.objectiveId,
    objectiveRevision: proposed.objectiveRevision,
    workItemId: proposed.workItemId,
    workItemRevision: proposed.workItemRevision,
    ownerPeerId: proposed.ownerPeerId,
    ownerEpoch: proposed.ownerEpoch,
    priorAssignmentAuthorityId: proposed.assignmentAuthorityId,
    priorAssignmentEpoch: proposed.assignmentEpoch,
    proposedAssignmentEpoch: proposed.proposedAssignmentEpoch,
  });
}

function recoveryRequiredCapabilityKeys(
  mesh: MeshAllocationInboundRuntimeState,
  proposed: LeaseTakeoverProposalPayload,
): readonly string[] {
  const receivedAward = mesh.allocation.receivedAwards[proposed.awardId];
  const receivedOffer = receivedAward
    ? mesh.allocation.receivedOffers[receivedAward.offerId]
    : undefined;
  if (receivedOffer)
    return Object.freeze(
      [...receivedOffer.envelope.payload.requiredCapabilityKeys].sort(),
    );
  const localAward = mesh.allocation.localAwards[proposed.awardId];
  const localOffer = localAward
    ? mesh.allocation.localOffers[localAward.offerId]
    : undefined;
  if (localOffer)
    return Object.freeze([...localOffer.work.requiredCapabilityKeys].sort());
  const work = mesh.objectives.workItems[proposed.workItemId];
  if (
    work &&
    work.objectiveId === proposed.objectiveId &&
    work.workItemRevision === proposed.workItemRevision
  )
    return Object.freeze([...work.requiredCapabilityKeys].sort());
  return Object.freeze([]);
}

function recoveryElectionExtension(
  decision: CollectivePeerNodeRecoveryElectionDecisionV1,
): MeshJsonValue {
  return {
    schemaVersion: 1,
    electionId: decision.electionId,
    electionRound: decision.electionRound,
    scopeDigest: decision.scopeDigest,
    selectedProposalId: decision.selectedProposalId,
    selectedAssigneePeerId: decision.selectedAssigneePeerId,
    certifiedWitnessPeerIds: [...decision.certifiedWitnessPeerIds],
    certifiedAtLogicalMs: decision.certifiedAtLogicalMs,
    expiresAtLogicalMs: decision.expiresAtLogicalMs,
  };
}

function parseRecoveryElectionExtension(
  value: MeshJsonValue | undefined,
): CollectivePeerNodeRecoveryElectionDecisionV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate =
    value as unknown as CollectivePeerNodeRecoveryElectionDecisionV1;
  const witnesses = candidate.certifiedWitnessPeerIds;
  if (
    Object.keys(value).sort().join("\u0000") !==
      "certifiedAtLogicalMs\u0000certifiedWitnessPeerIds\u0000electionId\u0000electionRound\u0000expiresAtLogicalMs\u0000schemaVersion\u0000scopeDigest\u0000selectedAssigneePeerId\u0000selectedProposalId" ||
    candidate.schemaVersion !== 1 ||
    !IDENTIFIER.test(candidate.electionId) ||
    !Number.isSafeInteger(candidate.electionRound) ||
    candidate.electionRound < 1 ||
    !PLANNING_DIGEST.test(candidate.scopeDigest) ||
    !IDENTIFIER.test(candidate.selectedProposalId) ||
    !IDENTIFIER.test(candidate.selectedAssigneePeerId) ||
    !Array.isArray(witnesses) ||
    witnesses.length === 0 ||
    witnesses.some(
      (peerId) => typeof peerId !== "string" || !IDENTIFIER.test(peerId),
    ) ||
    new Set(witnesses).size !== witnesses.length ||
    witnesses.some(
      (peerId, index) => index > 0 && witnesses[index - 1]! > peerId,
    ) ||
    !Number.isSafeInteger(candidate.certifiedAtLogicalMs) ||
    candidate.certifiedAtLogicalMs < 0 ||
    !Number.isSafeInteger(candidate.expiresAtLogicalMs) ||
    candidate.expiresAtLogicalMs <= candidate.certifiedAtLogicalMs
  )
    return null;
  return Object.freeze({
    ...candidate,
    certifiedWitnessPeerIds: Object.freeze([...witnesses]),
  });
}

function sameRecoveryElectionDecision(
  left: CollectivePeerNodeRecoveryElectionDecisionV1,
  right: CollectivePeerNodeRecoveryElectionDecisionV1,
): boolean {
  // Different peers may assemble different signed proof sets for the same
  // Paxos value. Mesh interoperability depends on semantic decision equality,
  // while each configured port remains responsible for validating its local
  // threshold certificate and expiry before returning it.
  return (
    left.scopeDigest === right.scopeDigest &&
    left.selectedProposalId === right.selectedProposalId &&
    left.selectedAssigneePeerId === right.selectedAssigneePeerId
  );
}

function currentLogicalTime(
  state: CollectivePeerNodeStoredStateV1,
  requestedLogicalTimeMs: number,
  clock: CollectivePeerNodeClockReadingV1,
): number {
  const reading = normalizeClockReading(clock);
  return Math.max(
    requestedLogicalTimeMs,
    reading.logicalTimeMs,
    state.runtime.mesh.coordination.lastLogicalTime,
    state.runtime.planning.planView.logicalTimeHighWaterMs,
  );
}

function safeReasonCode(value: string): string {
  return IDENTIFIER.test(value) ? value : "execution_withheld";
}

function applyPlanning(
  state: PlanningReducerStateV1,
  command: Parameters<typeof createPlanningReducerCommandV1>[0],
): PlanningReducerStateV1 {
  const decision = reducePlanningCommandV1(
    state,
    createPlanningReducerCommandV1(command),
  );
  if (decision.status === "applied" || decision.status === "idempotent")
    return decision.state;
  throw new CollectivePeerRuntimeErrorV1(
    "STATE_CONFLICT",
    `peer-local planning transition was rejected: ${decision.error?.code ?? decision.status}`,
  );
}

function fragmentForProposal(
  state: PlanningReducerStateV1,
  proposalDigest: string,
): PlanFragmentV1 | undefined {
  const proposal = state.planView.proposals.find(
    (candidate) => candidate.proposalDigest === proposalDigest,
  );
  const head =
    proposal &&
    state.planView.selectedHeads.find(
      (candidate) => candidate.semanticSlotKey === proposal.semanticSlotKey,
    );
  return head
    ? state.planView.fragments.find(
        (fragment) =>
          fragment.fragmentDigest === head.fragmentDigest &&
          fragment.proposalDigest === proposalDigest,
      )
    : undefined;
}

function allocationRuntime(state: MeshAllocationInboundRuntimeState) {
  return {
    coordination: state.coordination,
    discovery: state.discovery,
    objectives: state.objectives,
    allocation: state.allocation,
  };
}

function isAllocationEnvelope(
  envelope: SignedMeshEnvelope,
): envelope is SignedMeshEnvelope<MeshAllocationPayload> {
  return new Set([
    "work.offer",
    "work.bid",
    "work.award",
    "work.accept",
    "work.decline",
    "work.progress",
    "work.checkpoint",
    "work.result",
    "work.release",
    "work.cancel",
    "lease.renew",
    "lease.takeover_proposal",
    "lease.vote",
    "lease.certificate",
  ]).has(envelope.payload.type);
}

function planningArtifactAvailabilityRequestV1(
  scope: ReturnType<typeof normalizeCollectivePeerNodeScopeV1>,
  envelope: SignedMeshEnvelope<MeshAllocationPayload>,
  receivedAtLogicalMs: number,
  signal?: AbortSignal,
) {
  if (
    envelope.payload.type !== "work.offer" ||
    typeof envelope.payload.inputReference !== "string"
  )
    return null;
  let extension: PlanningWorkExtensionV1;
  try {
    extension = validatePlanningWorkExtensionV1(
      envelope.extensions?.[PLANNING_WORK_EXTENSION_KEY_V1],
    );
  } catch {
    return null;
  }
  return Object.freeze({
    tenantId: scope.tenantId,
    meshId: scope.meshId,
    policyDomainId: scope.policyDomainId,
    objectiveId: envelope.payload.objectiveId,
    missionIntentId: extension.missionIntentId,
    intentRevision: extension.intentRevision,
    intentDigest: extension.intentDigest,
    proposalDigest: extension.proposalDigest,
    fragmentDigest: extension.fragmentDigest,
    planViewDigest: extension.planViewDigest,
    contentReference: envelope.payload.inputReference,
    sourcePeerId: envelope.sender.peerId,
    sourceInstanceId: envelope.sender.instanceId,
    receivedAtLogicalMs,
    ...(signal ? { signal } : {}),
  });
}

function isCausalPredecessorRejectionV1(code: string): boolean {
  return new Set([
    "award_missing",
    "assignment_response_invalid",
    "execution_authority_invalid",
    "lease_renewal_authority_invalid",
    "lease_renewal_predecessor_invalid",
    "received_award_invalid",
    "recovery_authority_stale",
    "recovery_checkpoint_invalid",
    "recovery_invalid",
    "recovery_quorum_insufficient",
    "witness_assignment_invalid",
  ]).has(code);
}

function missingInboundPredecessorV1(
  state: CollectivePeerNodeStoredStateV1,
  envelope: SignedMeshEnvelope<MeshAllocationPayload>,
): string | null {
  if (
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== state.scope.peerId
  )
    return null;
  const payload = envelope.payload;
  const allocation = state.runtime.mesh.allocation;
  const witnessAssignments = Object.values(allocation.witnessAssignments);
  const hasAward = (awardId: string) =>
    allocation.localAwards[awardId] !== undefined ||
    allocation.receivedAwards[awardId] !== undefined ||
    witnessAssignments.some(
      ({ awardEnvelope }) => awardEnvelope.payload.awardId === awardId,
    );
  const hasLease = (authority: {
    readonly awardId: string;
    readonly acceptanceId: string;
    readonly assignmentAuthorityId: string;
    readonly assignmentEpoch: number;
    readonly fencingToken: string;
  }) =>
    [
      ...Object.values(allocation.leaseHeads),
      ...witnessAssignments.flatMap(({ leaseHead }) =>
        leaseHead ? [leaseHead] : [],
      ),
    ].some(
      (lease) =>
        lease.awardId === authority.awardId &&
        lease.acceptanceId === authority.acceptanceId &&
        lease.assignmentAuthorityId === authority.assignmentAuthorityId &&
        lease.assignmentEpoch === authority.assignmentEpoch &&
        lease.fencingToken === authority.fencingToken,
    );
  const hasRenewal = (leaseRenewalId: string) =>
    allocation.leaseRenewals[leaseRenewalId] !== undefined ||
    witnessAssignments.some(({ leaseRenewals }) =>
      leaseRenewals.some(
        (renewal) => renewal.leaseRenewalId === leaseRenewalId,
      ),
    );
  const hasCheckpoint = (checkpointId: string) =>
    allocation.executionRecords[checkpointId] !== undefined ||
    witnessAssignments.some(
      ({ latestCheckpoint }) => latestCheckpoint?.recordId === checkpointId,
    );

  switch (payload.type) {
    case "work.award":
      return payload.authorityKind === "recovery_certificate" &&
        allocation.recoveryCertificates[payload.recoveryCertificateId] ===
          undefined
        ? "recovery certificate"
        : null;
    case "work.accept":
    case "work.decline":
      return hasAward(payload.awardId) ? null : "assignment award";
    case "lease.renew":
      if (!hasLease(payload)) return "accepted assignment";
      return payload.previousLeaseRenewalId !== undefined &&
        !hasRenewal(payload.previousLeaseRenewalId)
        ? "previous lease renewal"
        : null;
    case "lease.takeover_proposal":
      return hasLease(payload) ? null : "accepted assignment lease";
    case "lease.vote":
      return allocation.takeoverProposals[payload.takeoverProposalId] ===
        undefined
        ? "takeover proposal"
        : null;
    case "lease.certificate":
      if (
        allocation.takeoverProposals[payload.takeoverProposalId] === undefined
      )
        return "takeover proposal";
      return payload.leaseVoteIds.some(
        (leaseVoteId) => allocation.leaseVotes[leaseVoteId] === undefined,
      )
        ? "certificate vote set"
        : null;
    case "work.progress":
      if (!hasLease(payload)) return "accepted assignment";
      return payload.checkpointId !== undefined &&
        !hasCheckpoint(payload.checkpointId)
        ? "referenced checkpoint"
        : null;
    case "work.checkpoint":
      if (!hasLease(payload)) return "accepted assignment";
      return payload.previousCheckpointId !== undefined &&
        !hasCheckpoint(payload.previousCheckpointId)
        ? "previous checkpoint"
        : null;
    case "work.result":
      if (!hasLease(payload)) return "accepted assignment";
      return payload.checkpointId !== undefined &&
        !hasCheckpoint(payload.checkpointId)
        ? "result checkpoint"
        : null;
    case "work.release":
      return hasLease(payload) ? null : "accepted assignment";
    case "work.cancel":
      return payload.assignmentState === "active"
        ? hasLease(payload)
          ? null
          : "accepted assignment"
        : hasAward(payload.awardId)
          ? null
          : "pending assignment award";
    default:
      return null;
  }
}

function outcomeFromCommittedPlan(
  snapshot: CollectivePeerNodeSnapshotV1,
  proposalDigest: string,
): CollectivePeerNodePlanOutcomeV1 | null {
  const planning = snapshot.state.runtime.planning;
  const proposal = planning.planView.proposals.find(
    (candidate) => candidate.proposalDigest === proposalDigest,
  );
  if (!proposal) return null;
  const fragment = fragmentForProposal(planning, proposalDigest) ?? null;
  const mapping =
    fragment &&
    planning.planView.workMappings.find(
      (candidate) => candidate.fragmentDigest === fragment.fragmentDigest,
    );
  const localOffers = mapping
    ? Object.values(snapshot.state.runtime.mesh.allocation.localOffers).filter(
        (offer) => offer.work.workItemId === mapping.workItemId,
      )
    : [];
  const recipientPeerIds = Object.freeze(
    [
      ...new Set(
        localOffers.flatMap((offer) => Object.keys(offer.recipientOffers)),
      ),
    ].sort(),
  );
  return Object.freeze({
    status:
      recipientPeerIds.length > 0
        ? "offered"
        : mapping
          ? "pending_recipients"
          : "recorded",
    proposalDigest,
    fragmentDigest: fragment?.fragmentDigest ?? null,
    workItemId: mapping?.workItemId ?? null,
    recipientPeerIds,
    durableRevision: snapshot.durableRevision,
  });
}

function normalizeAgents(
  input: readonly CollectivePeerNodeAgentRegistrationV1[],
  scope: ReturnType<typeof normalizeCollectivePeerNodeScopeV1>,
): ReadonlyMap<string, CollectivePeerNodeAgentRegistrationV1> {
  if (!Array.isArray(input) || input.length < 1 || input.length > 1_024)
    invalid("collective peer node agents are invalid");
  const agents = new Map<string, CollectivePeerNodeAgentRegistrationV1>();
  for (const registration of input) {
    if (!registration || typeof registration !== "object")
      invalid("collective peer node agent registration is invalid");
    const binding = registration.binding;
    if (
      !binding ||
      binding.peerId !== scope.peerId ||
      binding.peerInstanceId !== scope.instanceId
    )
      invalid("collective peer node agent host binding is invalid");
    identifier(binding.agentId, "agent.agentId");
    if (agents.has(binding.agentId))
      invalid("collective peer node agent is duplicated");
    const capabilityKeys = sortedIdentifiers(
      registration.capabilityKeys,
      "agent.capabilityKeys",
    );
    agents.set(
      binding.agentId,
      Object.freeze({
        ...registration,
        binding: Object.freeze({ ...binding }),
        capabilityKeys,
        maximumConcurrency: positiveInteger(
          registration.maximumConcurrency ?? 1,
          "agent.maximumConcurrency",
        ),
        metadata: Object.freeze({ ...(registration.metadata ?? {}) }),
      }),
    );
  }
  return agents;
}

function normalizeControlBinding(
  input: CollectivePeerNodeRuntimeConfigV1["expectedControlBinding"],
): void {
  if (!input || typeof input !== "object")
    invalid("control binding is required");
  identifier(input.controlId, "controlId");
  identifier(input.implementationId, "control implementationId");
  positiveInteger(input.controlVersion, "controlVersion");
}

function normalizeClockReading(input: {
  readonly wallTime: string;
  readonly logicalTimeMs: number;
}) {
  if (!input || typeof input !== "object")
    invalid("node clock reading is invalid");
  const wall = new Date(input.wallTime);
  if (!Number.isFinite(wall.getTime()) || wall.toISOString() !== input.wallTime)
    invalid("node wall time is invalid");
  return Object.freeze({
    wallTime: input.wallTime,
    logicalTimeMs: nonNegativeInteger(
      input.logicalTimeMs,
      "clock.logicalTimeMs",
    ),
  });
}

function addMilliseconds(timestamp: string, durationMs: number): string {
  const value =
    new Date(timestamp).getTime() + positiveInteger(durationMs, "durationMs");
  if (!Number.isSafeInteger(value)) invalid("timestamp duration is invalid");
  return new Date(value).toISOString();
}

function earlierTimestamp(left: string, right: string): string {
  const leftMs = new Date(left).getTime();
  const rightMs = new Date(right).getTime();
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs))
    invalid("timestamp comparison is invalid");
  return leftMs <= rightMs
    ? new Date(leftMs).toISOString()
    : new Date(rightMs).toISOString();
}

function recoveryWitnessPeerIds(
  configured: readonly string[],
  ownerPeerId: string,
  assigneePeerId: string,
  threshold: number,
): readonly string[] {
  const eligible = [...new Set(configured)]
    .filter((peerId) => peerId !== ownerPeerId && peerId !== assigneePeerId)
    .sort();
  if (eligible.length < threshold)
    throw new CollectivePeerRuntimeErrorV1(
      "STATE_CONFLICT",
      "assignment leaves fewer eligible recovery witnesses than its threshold",
    );
  return Object.freeze(eligible);
}

function sameRecoveryElection(
  left: LeaseTakeoverProposalPayload,
  right: LeaseTakeoverProposalPayload,
): boolean {
  return (
    left.objectiveId === right.objectiveId &&
    left.objectiveDocumentId === right.objectiveDocumentId &&
    left.objectiveRevision === right.objectiveRevision &&
    left.workItemId === right.workItemId &&
    left.workItemRevision === right.workItemRevision &&
    left.ownerPeerId === right.ownerPeerId &&
    left.ownerEpoch === right.ownerEpoch &&
    left.awardId === right.awardId &&
    left.assignmentEpoch === right.assignmentEpoch &&
    left.assignmentAuthorityId === right.assignmentAuthorityId &&
    left.fencingToken === right.fencingToken &&
    left.proposedAssignmentEpoch === right.proposedAssignmentEpoch
  );
}

function historicalObjectivePolicy(
  mesh: MeshAllocationInboundRuntimeState,
  objectiveId: string,
  objectiveRevision: number,
): MeshWorkObjectivePolicySnapshot | undefined {
  return mesh.objectives.objectivePolicies[
    JSON.stringify([objectiveId, objectiveRevision])
  ];
}

function historicalObjectiveProjection(
  mesh: MeshAllocationInboundRuntimeState,
  objectiveId: string,
  objectiveRevision: number,
): MeshObjectiveProjection | undefined {
  const key = JSON.stringify([objectiveId, objectiveRevision]);
  const current = mesh.objectives.objectives[objectiveId];
  const policy = mesh.objectives.objectivePolicies[key];
  const document = mesh.objectives.objectiveDocuments[key];
  if (!current || current.status !== "active" || !policy || !document)
    return undefined;
  const payload = document.envelope.payload;
  if (
    payload.type !== "objective.announce" &&
    payload.type !== "objective.revise"
  )
    return undefined;
  return Object.freeze({
    objectiveId: payload.objectiveId,
    objectiveDocumentId: payload.objectiveDocumentId,
    objectiveRevision: payload.objectiveRevision,
    issuerPeerId: payload.issuerPeerId,
    issuerKeyId: document.envelope.proof.keyId,
    ...(payload.summary === undefined
      ? { contentReference: payload.contentReference }
      : { summary: payload.summary }),
    successCriteria: Object.freeze([...payload.successCriteria]),
    permittedCapabilityKeys: Object.freeze([
      ...payload.permittedCapabilityKeys,
    ]),
    maximumWorkItems: payload.maximumWorkItems,
    maximumConcurrentAssignments: payload.maximumConcurrentAssignments,
    maximumBudgetUnits: policy.maximumBudgetUnits,
    bidWindowMs: payload.bidWindowMs,
    acceptanceWindowMs: policy.acceptanceWindowMs,
    maximumLeaseDurationMs: policy.maximumLeaseDurationMs,
    recoveryGraceMs: policy.recoveryGraceMs,
    maximumLeaseRenewals: policy.maximumLeaseRenewals,
    recoveryWitnessPeerIds: Object.freeze([...policy.recoveryWitnessPeerIds]),
    recoveryWitnessThreshold: policy.recoveryWitnessThreshold,
    ...(payload.authorizedObserverPeerIds === undefined
      ? {}
      : {
          authorizedObserverPeerIds: Object.freeze([
            ...payload.authorizedObserverPeerIds,
          ]),
        }),
    validFrom: payload.validFrom,
    validUntil: policy.validUntil,
    validityVerifiedAt: document.validityVerifiedAt,
    acceptedMessageId: policy.acceptedMessageId,
    acceptedAt: policy.acceptedAt,
    expiresAt: policy.expiresAt,
    workItemCount: current.workItemCount,
    reservedBudgetUnits: current.reservedBudgetUnits,
    committedBudgetUnits: current.committedBudgetUnits,
    status: "active" as const,
  });
}

function recoveryParticipants(
  ownerPeerId: string,
  assigneePeerId: string,
  proposedAssigneePeerId: string,
  witnessPeerIds: readonly string[],
  senderPeerId: string,
  finalRecipientPeerId: string,
): readonly string[] {
  const recipients = [
    ...new Set([ownerPeerId, proposedAssigneePeerId, ...witnessPeerIds]),
  ]
    .filter((peerId) => peerId !== senderPeerId)
    .sort();
  const finalIndex = recipients.indexOf(finalRecipientPeerId);
  if (finalIndex >= 0) {
    recipients.splice(finalIndex, 1);
    recipients.push(finalRecipientPeerId);
  }
  return Object.freeze(recipients);
}

function recoveryMessageId(
  type: "lease.takeover_proposal" | "lease.vote" | "lease.certificate",
  recordId: string,
  recipientPeerId: string,
): string {
  return meshMessageId({ kind: type, recordId, recipientPeerId });
}

function recoveryEffectId(
  type: "lease.takeover_proposal" | "lease.vote" | "lease.certificate",
  recordId: string,
  recipientPeerId: string,
): string {
  return `node.recovery.${shortDigest({ type, recordId, recipientPeerId })}`;
}

function witnessAwardMessageId(awardId: string, witnessPeerId: string): string {
  return meshMessageId({ kind: "work.award.witness", awardId, witnessPeerId });
}

function witnessAwardEffectId(awardId: string, witnessPeerId: string): string {
  return `node.witness.award.${shortDigest({ awardId, witnessPeerId })}`;
}

function witnessAcceptanceMessageId(
  acceptanceId: string,
  witnessPeerId: string,
): string {
  return meshMessageId({
    kind: "work.accept.witness",
    acceptanceId,
    witnessPeerId,
  });
}

function witnessAcceptanceEffectId(
  acceptanceId: string,
  witnessPeerId: string,
): string {
  return `node.witness.acceptance.${shortDigest({
    acceptanceId,
    witnessPeerId,
  })}`;
}

function witnessLeaseRenewalMessageId(
  leaseRenewalId: string,
  witnessPeerId: string,
): string {
  return meshMessageId({
    kind: "lease.renew.witness",
    leaseRenewalId,
    witnessPeerId,
  });
}

function witnessLeaseRenewalEffectId(
  leaseRenewalId: string,
  witnessPeerId: string,
): string {
  return `node.witness.lease.${shortDigest({
    leaseRenewalId,
    witnessPeerId,
  })}`;
}

function abortableDelay(
  durationMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, durationMs);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

function shortDigest(value: unknown): string {
  return digestPlanningJsonV1(
    "planning-reducer-command-identity",
    value as PlanningJson,
  ).slice(7, 47);
}

function meshMessageId(value: PlanningJson): string {
  const digest = digestPlanningJsonV1(
    "planning-reducer-command-identity",
    value,
  ).slice("sha256:".length);
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(digest.slice(index * 2, index * 2 + 2), 16);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += alphabet[first >> 2];
    encoded += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      encoded += alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) encoded += alphabet[third & 0x3f];
  }
  return encoded;
}

function sortedIdentifiers(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256)
    invalid(`${label} is invalid`);
  const result = value.map((item) => identifier(item, label)).sort();
  if (new Set(result).size !== result.length) invalid(`${label} is duplicated`);
  return Object.freeze(result);
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    !IDENTIFIER.test(value)
  )
    invalid(`${label} is invalid`);
  return value;
}

function boundedInteger(
  value: unknown,
  label: string,
  maximum: number,
): number {
  const result = positiveInteger(value, label);
  if (result > maximum) invalid(`${label} exceeds its bound`);
  return result;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    invalid(`${label} is invalid`);
  return value as number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    invalid(`${label} is invalid`);
  return value as number;
}

function invalid(message: string): never {
  throw new CollectivePeerRuntimeErrorV1("VALIDATION_ERROR", message);
}
