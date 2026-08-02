import {
  createMeshAllocationInboundRuntimeState,
  type MeshAllocationInboundDecision,
  type MeshAllocationInboundRuntimeState,
  type MeshLocalWorkCreateInput,
  type MeshObjectiveWorkCommand,
} from "@agentplat/mesh/coordination";
import {
  compareMeshTimestamps,
  type MeshJsonValue,
  type WorkOfferPayload,
} from "@agentplat/mesh-protocol";
import {
  createWorkContractFromMeshV1,
  parseDelegationMandateReferenceV1,
} from "@agentplat/collective-control/mesh";

import type {
  MissionIntentV1,
  PlanFragmentDecisionV1,
  PlanFragmentProposalV1,
  PlanFragmentV1,
  PlanningReducerStateV1,
  PlanViewV1,
} from "./contracts.js";
import { canonicalizePlanningJsonV1 } from "./canonical.js";
import {
  createAdaptiveRoleBindingV1,
  createPlanFragmentV1,
  validateMissionIntentV1,
  validatePlanFragmentDecisionV1,
  validatePlanFragmentProposalV1,
  validatePlanFragmentV1,
  validatePlanViewV1,
} from "./validation.js";
import {
  createPlanningReducerCommandV1,
  reducePlanningCommandV1,
  validatePlanningReducerStateV1,
} from "./reducer.js";
import {
  PLANNING_FRAGMENT_REFERENCE_PREFIX_V1,
  PLANNING_MESH_CAPABILITY_PROFILE_V1,
  PLANNING_WORK_EXTENSION_KEY_V1,
  type InMemoryPlanningFragmentRepositoryOptionsV1,
  type PlanningAdaptiveRoleInputV1,
  type PlanningAdaptiveRoleResultV1,
  type PlanningFragmentRepositoryRecordV1,
  type PlanningFragmentRepositoryV1,
  type PlanningLocalWorkProjectionV1,
  type PlanningMeshInboundDecisionV1,
  type PlanningMeshAdmissionDecisionV1,
  type PlanningMeshAdmissionInputV1,
  type PlanningMeshAdmissionPortV1,
  type PlanningMeshInboundProcessorOptionsV1,
  type PlanningMeshInboundProcessorV1,
  type PlanningMeshInboundRejectionCodeV1,
  type PlanningMeshInboundRuntimeStateV1,
  type PlanningMeshWorkLifecycleCommandV1,
  type PlanningRecipientSelectionInputV1,
  type PlanningRecipientV1,
  type PlanningWorkExtensionV1,
  type PlanningWorkProjectionValidationInputV1,
} from "./mesh-contracts.js";

export * from "./mesh-contracts.js";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const utf8 = new TextEncoder();

export function validatePlanningWorkExtensionV1(
  value: unknown,
): PlanningWorkExtensionV1 {
  exact(
    value,
    [
      "schemaVersion",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "proposalDigest",
      "fragmentDigest",
      "semanticSlotKey",
      "predecessorFragmentDigest",
      "dependencyFragmentDigests",
      "planViewDigest",
    ],
    "planning work extension",
  );
  const candidate = value as unknown as PlanningWorkExtensionV1;
  if (
    candidate.schemaVersion !== 1 ||
    !identifierPattern.test(candidate.missionIntentId) ||
    !Number.isSafeInteger(candidate.intentRevision) ||
    candidate.intentRevision < 1 ||
    !digestPattern.test(candidate.intentDigest) ||
    !digestPattern.test(candidate.proposalDigest) ||
    !digestPattern.test(candidate.fragmentDigest) ||
    !identifierPattern.test(candidate.semanticSlotKey) ||
    (candidate.predecessorFragmentDigest !== null &&
      !digestPattern.test(candidate.predecessorFragmentDigest)) ||
    !safeDataArray(candidate.dependencyFragmentDigests) ||
    candidate.dependencyFragmentDigests.length > 1_024 ||
    candidate.dependencyFragmentDigests.some(
      (digest) => !digestPattern.test(digest),
    ) ||
    new Set(candidate.dependencyFragmentDigests).size !==
      candidate.dependencyFragmentDigests.length ||
    !digestPattern.test(candidate.planViewDigest)
  )
    throw new TypeError("Planning work extension is invalid");
  return freezeExtension(candidate);
}

export function planningFragmentContentReferenceV1(
  fragmentDigest: string,
): string {
  if (!digestPattern.test(fragmentDigest))
    throw new TypeError("Planning fragment digest is invalid");
  return `${PLANNING_FRAGMENT_REFERENCE_PREFIX_V1}${fragmentDigest}`;
}

export function validatePlanningFragmentRepositoryRecordV1(
  value: unknown,
): PlanningFragmentRepositoryRecordV1 {
  exact(
    value,
    [
      "schemaVersion",
      "contentReference",
      "tenantId",
      "policyDomainId",
      "meshId",
      "objectiveId",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "proposalDigest",
      "fragmentDigest",
      "proposal",
      "decision",
      "fragment",
      "sourcePlanView",
    ],
    "planning fragment repository record",
  );
  const candidate = value as unknown as PlanningFragmentRepositoryRecordV1;
  const proposal = validatePlanFragmentProposalV1(candidate.proposal);
  const decision = validatePlanFragmentDecisionV1(candidate.decision);
  const fragment = validatePlanFragmentV1(candidate.fragment);
  const view = validatePlanViewV1(candidate.sourcePlanView);
  if (
    candidate.schemaVersion !== 1 ||
    !identifierPattern.test(candidate.tenantId) ||
    !identifierPattern.test(candidate.policyDomainId) ||
    !identifierPattern.test(candidate.meshId) ||
    !identifierPattern.test(candidate.objectiveId) ||
    candidate.missionIntentId !== proposal.missionIntentId ||
    candidate.intentRevision !== proposal.intentRevision ||
    candidate.intentDigest !== proposal.intentDigest ||
    candidate.proposalDigest !== proposal.proposalDigest ||
    candidate.fragmentDigest !== fragment.fragmentDigest ||
    candidate.contentReference !==
      planningFragmentContentReferenceV1(fragment.fragmentDigest) ||
    decision.status !== "accepted" ||
    decision.proposalId !== proposal.proposalId ||
    decision.proposalDigest !== proposal.proposalDigest ||
    fragment.proposalId !== proposal.proposalId ||
    fragment.proposalDigest !== proposal.proposalDigest ||
    fragment.decisionDigest !== decision.decisionDigest ||
    fragment.status !== "offered" ||
    view.tenantId !== candidate.tenantId ||
    view.policyDomainId !== candidate.policyDomainId ||
    view.missionIntentId !== candidate.missionIntentId ||
    view.intentRevision !== candidate.intentRevision ||
    view.intentDigest !== candidate.intentDigest ||
    view.peerId !== proposal.proposerPeerId ||
    view.peerInstanceId !== proposal.proposerInstanceId ||
    !view.proposals.some(
      (record) => record.proposalDigest === proposal.proposalDigest,
    ) ||
    !view.decisions.some(
      (record) => record.decisionDigest === decision.decisionDigest,
    ) ||
    !view.fragments.some(
      (record) => record.fragmentDigest === fragment.fragmentDigest,
    ) ||
    view.selectedHeads.find(
      (head) => head.semanticSlotKey === fragment.semanticSlotKey,
    )?.fragmentDigest !== fragment.fragmentDigest
  )
    throw new TypeError(
      "Planning fragment repository record binding is invalid",
    );
  return Object.freeze({
    ...candidate,
    proposal,
    decision,
    fragment,
    sourcePlanView: view,
  });
}

/** Bounded immutable-content repository intended for tests and ephemeral peers. */
export class InMemoryPlanningFragmentRepositoryV1 implements PlanningFragmentRepositoryV1 {
  readonly #maximumRecords: number;
  readonly #maximumRecordBytes: number;
  readonly #records = new Map<string, PlanningFragmentRepositoryRecordV1>();
  readonly #domainHeads = new Map<string, string>();

  constructor(options: InMemoryPlanningFragmentRepositoryOptionsV1 = {}) {
    exact(
      options,
      ["maximumRecords", "maximumRecordBytes"],
      "repository options",
      true,
    );
    const maximumRecords = options.maximumRecords as number | undefined;
    const maximumRecordBytes = options.maximumRecordBytes as number | undefined;
    this.#maximumRecords = maximumRecords ?? 16_384;
    this.#maximumRecordBytes = maximumRecordBytes ?? 262_144;
    if (!positive(this.#maximumRecords) || !positive(this.#maximumRecordBytes))
      throw new RangeError(
        "Planning repository limits must be positive safe integers",
      );
  }

  put(
    input: PlanningFragmentRepositoryRecordV1,
  ): PlanningFragmentRepositoryRecordV1 {
    const record = validatePlanningFragmentRepositoryRecordV1(input);
    const canonical = canonicalizePlanningJsonV1(record as never);
    if (utf8.encode(canonical).byteLength > this.#maximumRecordBytes)
      throw new RangeError("Planning repository record exceeds its byte limit");
    const existing = this.#records.get(record.contentReference);
    if (existing) {
      if (canonicalizePlanningJsonV1(existing as never) !== canonical)
        throw new TypeError("Planning repository content-address conflict");
      return existing;
    }
    const domainKey = JSON.stringify([
      record.tenantId,
      record.policyDomainId,
      record.meshId,
      record.objectiveId,
      record.missionIntentId,
      record.intentRevision,
      record.fragment.fragmentId,
      record.fragment.fragmentRevision,
    ]);
    const prior = this.#domainHeads.get(domainKey);
    if (prior !== undefined && prior !== record.fragmentDigest)
      throw new TypeError("Planning repository domain identity conflict");
    if (this.#records.size >= this.#maximumRecords)
      throw new RangeError("Planning repository capacity exceeded");
    this.#records.set(record.contentReference, record);
    this.#domainHeads.set(domainKey, record.fragmentDigest);
    return record;
  }

  get(contentReference: string): PlanningFragmentRepositoryRecordV1 | null {
    if (typeof contentReference !== "string")
      throw new TypeError("Planning content reference is invalid");
    return this.#records.get(contentReference) ?? null;
  }

  get size(): number {
    return this.#records.size;
  }
}

/** Derives a stable cross-peer Work identity from proposal content, never an assignee. */
export function planningWorkItemIdV1(proposalDigest: string): string {
  if (!digestPattern.test(proposalDigest))
    throw new TypeError("Planning proposal digest is invalid");
  return `planning.work.${proposalDigest.slice("sha256:".length)}`;
}

export function createPlanningLocalWorkProjectionV1(input: {
  readonly missionIntent: MissionIntentV1;
  readonly sourcePlanView: PlanViewV1;
  readonly fragment: PlanFragmentV1;
  readonly workItemRevision?: number;
}): PlanningLocalWorkProjectionV1 {
  exact(
    input,
    ["missionIntent", "sourcePlanView", "fragment", "workItemRevision"],
    "local Work projection input",
    true,
  );
  const intent = validateMissionIntentV1(input.missionIntent);
  const view = validatePlanViewV1(input.sourcePlanView);
  const fragment = validatePlanFragmentV1(input.fragment);
  const revision = input.workItemRevision ?? 1;
  if (!positive(revision)) throw new TypeError("Work Item revision is invalid");
  assertCurrentSource(intent, view, fragment);
  const sourceMapping = view.workMappings.find(
    (mapping) => mapping.fragmentDigest === fragment.fragmentDigest,
  );
  if (
    !sourceMapping ||
    sourceMapping.meshId !== intent.objective.meshId ||
    sourceMapping.objectiveId !== intent.objective.objectiveId ||
    sourceMapping.workItemId !==
      planningWorkItemIdV1(fragment.proposalDigest) ||
    sourceMapping.workItemRevision !== revision
  )
    throw new TypeError("Planning fragment Work mapping is not current");
  const proposal = findProposal(view, fragment.proposalDigest);
  const decision = findDecision(view, fragment.decisionDigest);
  const record = validatePlanningFragmentRepositoryRecordV1({
    schemaVersion: 1,
    contentReference: planningFragmentContentReferenceV1(
      fragment.fragmentDigest,
    ),
    tenantId: intent.tenantId,
    policyDomainId: intent.policyDomainId,
    meshId: intent.objective.meshId,
    objectiveId: intent.objective.objectiveId,
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    proposalDigest: proposal.proposalDigest,
    fragmentDigest: fragment.fragmentDigest,
    proposal,
    decision,
    fragment,
    sourcePlanView: view,
  });
  const extension = validatePlanningWorkExtensionV1({
    schemaVersion: 1,
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    proposalDigest: fragment.proposalDigest,
    fragmentDigest: fragment.fragmentDigest,
    semanticSlotKey: fragment.semanticSlotKey,
    predecessorFragmentDigest: fragment.predecessorFragmentDigest,
    dependencyFragmentDigests: fragment.dependencyFragmentDigests,
    planViewDigest: view.stateDigest,
  });
  const workItemId = planningWorkItemIdV1(fragment.proposalDigest);
  const work: MeshLocalWorkCreateInput = Object.freeze({
    objectiveId: intent.objective.objectiveId,
    workItemId,
    requiredCapabilityKeys: Object.freeze([...fragment.requiredCapabilityKeys]),
    matchingAttributes: Object.freeze({}),
    completionCriteria: Object.freeze([...fragment.outcomeStatements]),
    inputReference: record.contentReference,
    budgetReservationUnits: fragment.requestedBudgetUnits,
    workDeadline: fragment.workDeadline,
  });
  return validatePlanningLocalWorkProjectionV1({
    workItemId,
    workItemRevision: revision,
    work,
    extensionKey: PLANNING_WORK_EXTENSION_KEY_V1,
    extension,
    extensions: Object.freeze({
      [PLANNING_WORK_EXTENSION_KEY_V1]: extension as unknown as MeshJsonValue,
    }),
    criticalExtensions: Object.freeze([
      PLANNING_WORK_EXTENSION_KEY_V1,
    ]) as readonly [typeof PLANNING_WORK_EXTENSION_KEY_V1],
    repositoryRecord: record,
  });
}

/** Revalidates a detached projection before it can compose a Mesh mutation. */
export function validatePlanningLocalWorkProjectionV1(
  value: unknown,
): PlanningLocalWorkProjectionV1 {
  exact(
    value,
    [
      "workItemId",
      "workItemRevision",
      "work",
      "extensionKey",
      "extension",
      "extensions",
      "criticalExtensions",
      "repositoryRecord",
    ],
    "planning local Work projection",
  );
  const candidate = value as unknown as PlanningLocalWorkProjectionV1;
  const record = validatePlanningFragmentRepositoryRecordV1(
    candidate.repositoryRecord,
  );
  const extension = validatePlanningWorkExtensionV1(candidate.extension);
  exact(
    candidate.work,
    [
      "objectiveId",
      "workItemId",
      "requiredCapabilityKeys",
      "matchingAttributes",
      "completionCriteria",
      "inputReference",
      "budgetReservationUnits",
      "workDeadline",
    ],
    "planning local Work input",
  );
  exact(
    candidate.work.matchingAttributes,
    [],
    "planning Work matching attributes",
  );
  exact(
    candidate.extensions,
    [PLANNING_WORK_EXTENSION_KEY_V1],
    "planning extensions",
  );
  const mapping = record.sourcePlanView.workMappings.find(
    (item) => item.fragmentDigest === record.fragmentDigest,
  );
  if (
    candidate.extensionKey !== PLANNING_WORK_EXTENSION_KEY_V1 ||
    !safeDataArray(candidate.criticalExtensions) ||
    candidate.criticalExtensions.length !== 1 ||
    candidate.criticalExtensions[0] !== PLANNING_WORK_EXTENSION_KEY_V1 ||
    !positive(candidate.workItemRevision) ||
    candidate.workItemId !== planningWorkItemIdV1(record.proposalDigest) ||
    candidate.work.workItemId !== candidate.workItemId ||
    candidate.work.objectiveId !== record.objectiveId ||
    !safeDataArray(candidate.work.requiredCapabilityKeys) ||
    !same(
      candidate.work.requiredCapabilityKeys,
      record.fragment.requiredCapabilityKeys,
    ) ||
    !safeDataArray(candidate.work.completionCriteria) ||
    !same(
      candidate.work.completionCriteria,
      record.fragment.outcomeStatements,
    ) ||
    candidate.work.inputReference !== record.contentReference ||
    candidate.work.budgetReservationUnits !==
      record.fragment.requestedBudgetUnits ||
    candidate.work.workDeadline !== record.fragment.workDeadline ||
    !mapping ||
    mapping.meshId !== record.meshId ||
    mapping.objectiveId !== record.objectiveId ||
    mapping.workItemId !== candidate.workItemId ||
    mapping.workItemRevision !== candidate.workItemRevision ||
    extension.missionIntentId !== record.missionIntentId ||
    extension.intentRevision !== record.intentRevision ||
    extension.intentDigest !== record.intentDigest ||
    extension.proposalDigest !== record.proposalDigest ||
    extension.fragmentDigest !== record.fragmentDigest ||
    extension.semanticSlotKey !== record.fragment.semanticSlotKey ||
    extension.predecessorFragmentDigest !==
      record.fragment.predecessorFragmentDigest ||
    !same(
      extension.dependencyFragmentDigests,
      record.fragment.dependencyFragmentDigests,
    ) ||
    extension.planViewDigest !== record.sourcePlanView.stateDigest ||
    canonicalizePlanningJsonV1(
      candidate.extensions[PLANNING_WORK_EXTENSION_KEY_V1] as never,
    ) !== canonicalizePlanningJsonV1(extension as never)
  )
    throw new TypeError("Planning local Work projection is inconsistent");
  return Object.freeze({
    ...candidate,
    work: Object.freeze({
      ...candidate.work,
      requiredCapabilityKeys: Object.freeze([
        ...candidate.work.requiredCapabilityKeys,
      ]),
      matchingAttributes: Object.freeze({}),
      completionCriteria: Object.freeze([...candidate.work.completionCriteria]),
    }),
    extension,
    extensions: Object.freeze({
      [PLANNING_WORK_EXTENSION_KEY_V1]: extension as unknown as MeshJsonValue,
    }),
    criticalExtensions: Object.freeze([
      PLANNING_WORK_EXTENSION_KEY_V1,
    ]) as readonly [typeof PLANNING_WORK_EXTENSION_KEY_V1],
    repositoryRecord: record,
  });
}

/** Reference admission path: proposal -> local decision -> local Work projection. */
export function createReducerPlanningMeshAdmissionPortV1(): PlanningMeshAdmissionPortV1 {
  return Object.freeze({
    evaluate(
      inputState: PlanningReducerStateV1,
      input: PlanningMeshAdmissionInputV1,
    ): PlanningMeshAdmissionDecisionV1 {
      let state: PlanningReducerStateV1;
      try {
        state = validatePlanningReducerStateV1(inputState);
      } catch {
        return Object.freeze({
          accepted: false,
          code: "invalid_local_state",
          state: inputState,
        });
      }
      const apply = (
        commandInput: Parameters<typeof createPlanningReducerCommandV1>[0],
      ) => {
        const result = reducePlanningCommandV1(
          state,
          createPlanningReducerCommandV1(commandInput),
        );
        if (result.status === "applied" || result.status === "idempotent") {
          state = result.state;
          return true;
        }
        return false;
      };
      if (
        input.receivedAtLogicalMs > state.planView.logicalTimeHighWaterMs &&
        !apply({
          schemaVersion: 1,
          kind: "logical-time.advance",
          expectedStateDigest: null,
          logicalTimeMs: input.receivedAtLogicalMs,
        })
      )
        return Object.freeze({
          accepted: false,
          code: "logical_time_rejected",
          state: inputState,
        });
      if (
        !apply({
          schemaVersion: 1,
          kind: "proposal.record",
          expectedStateDigest: null,
          proposal: input.proposal,
        })
      )
        return Object.freeze({
          accepted: false,
          code: "proposal_rejected",
          state: inputState,
        });
      const alreadyDecided = state.planView.decisions.some(
        (decision) => decision.proposalDigest === input.proposal.proposalDigest,
      );
      if (!alreadyDecided) {
        const decided = new Set(
          state.planView.decisions.map((decision) => decision.proposalDigest),
        );
        const candidateProposalDigests = state.planView.proposals
          .filter(
            (proposal) =>
              proposal.semanticSlotKey === input.proposal.semanticSlotKey &&
              !decided.has(proposal.proposalDigest),
          )
          .map((proposal) => proposal.proposalDigest)
          .sort();
        if (
          !apply({
            schemaVersion: 1,
            kind: "slot.evaluate",
            expectedStateDigest: null,
            semanticSlotKey: input.proposal.semanticSlotKey,
            candidateProposalDigests,
            decidedAtLogicalMs: input.receivedAtLogicalMs,
          })
        )
          return Object.freeze({
            accepted: false,
            code: "selection_rejected",
            state: inputState,
          });
      }
      let fragment = currentFragmentForProposal(state, input.proposal);
      if (!fragment)
        return Object.freeze({
          accepted: false,
          code: "proposal_not_selected",
          state: inputState,
        });
      if (fragment.status === "active") {
        if (
          !apply({
            schemaVersion: 1,
            kind: "fragment.project-to-work",
            expectedStateDigest: null,
            fragmentId: fragment.fragmentId,
            previousFragmentDigest: fragment.fragmentDigest,
            workTarget: {
              schemaVersion: 1,
              meshId: state.missionIntent.objective.meshId,
              objectiveId: input.workOffer.objectiveId,
              workItemId: input.workItemId,
              workItemRevision: input.workItemRevision,
            },
            transitionedAtLogicalMs: input.receivedAtLogicalMs,
          })
        )
          return Object.freeze({
            accepted: false,
            code: "work_projection_rejected",
            state: inputState,
          });
        fragment = currentFragmentForProposal(state, input.proposal);
      }
      if (!fragment || fragment.status !== "offered")
        return Object.freeze({
          accepted: false,
          code: "local_head_not_offered",
          state: inputState,
        });
      return Object.freeze({ accepted: true, state });
    },
  });
}

export function selectPlanningOfferRecipientsV1(
  input: PlanningRecipientSelectionInputV1,
): readonly PlanningRecipientV1[] {
  exact(
    input,
    [
      "discovery",
      "logicalTimeMs",
      "verifiedAt",
      "localSupportedCriticalExtensions",
      "requiredCapabilityKeys",
      "maximumRecipients",
    ],
    "planning recipient selection input",
  );
  if (
    !Number.isSafeInteger(input.logicalTimeMs) ||
    !safeDataArray(input.localSupportedCriticalExtensions) ||
    !safeDataArray(input.requiredCapabilityKeys)
  )
    throw new TypeError("Planning recipient selection input is invalid");
  if (
    !input.localSupportedCriticalExtensions.includes(
      PLANNING_WORK_EXTENSION_KEY_V1,
    )
  )
    return Object.freeze([]);
  if (!positive(input.maximumRecipients))
    throw new TypeError("Maximum recipients is invalid");
  const discovery = input.discovery;
  const required = new Set(input.requiredCapabilityKeys);
  const recipients: PlanningRecipientV1[] = [];
  for (const peerId of Object.keys(discovery.peerViews).sort()) {
    const view = discovery.peerViews[peerId];
    const card = discovery.peerCards[peerId];
    if (
      !view ||
      !card ||
      view.expiresAt <= input.logicalTimeMs ||
      card.status !== "active" ||
      card.expiresAt <= input.logicalTimeMs ||
      view.peerCardId !== card.peerCardId ||
      view.cardRevision !== card.cardRevision ||
      !timestampAtOrBefore(card.validFrom, input.verifiedAt) ||
      !timestampBefore(input.verifiedAt, card.validUntil)
    )
      continue;
    const capabilities = Object.values(discovery.capabilities).filter(
      (capability) =>
        capability.ownerPeerId === peerId &&
        capability.instanceId === card.instanceId &&
        capability.status === "active" &&
        capability.expiresAt > input.logicalTimeMs &&
        timestampAtOrBefore(capability.validFrom, input.verifiedAt) &&
        timestampBefore(input.verifiedAt, capability.validUntil) &&
        card.capabilityIds.includes(capability.capabilityId),
    );
    const planning = capabilities.find(exactPlanningCapability);
    if (
      !planning ||
      [...required].some(
        (key) =>
          !capabilities.some((capability) => capability.capabilityKey === key),
      )
    )
      continue;
    recipients.push(
      Object.freeze({
        peerId,
        peerCardId: card.peerCardId,
        cardRevision: card.cardRevision,
        planningCapabilityId: planning.capabilityId,
        planningCapabilityRevision: planning.capabilityRevision,
      }),
    );
    if (recipients.length === input.maximumRecipients) break;
  }
  return Object.freeze(recipients);
}

export function validatePlanningWorkProjectionV1(
  input: PlanningWorkProjectionValidationInputV1,
): void {
  exact(
    input,
    ["intent", "record", "extension", "offer", "currentWork"],
    "planning Work projection validation input",
    true,
  );
  const intent = validateMissionIntentV1(input.intent);
  const record = validatePlanningFragmentRepositoryRecordV1(input.record);
  const extension = validatePlanningWorkExtensionV1(input.extension);
  const { fragment } = record;
  const sourceMapping = record.sourcePlanView.workMappings.find(
    (mapping) => mapping.fragmentDigest === record.fragmentDigest,
  );
  if (
    record.tenantId !== intent.tenantId ||
    record.policyDomainId !== intent.policyDomainId ||
    record.meshId !== intent.objective.meshId ||
    record.objectiveId !== intent.objective.objectiveId ||
    record.missionIntentId !== intent.missionIntentId ||
    record.intentRevision !== intent.revision ||
    record.intentDigest !== intent.intentDigest ||
    extension.missionIntentId !== record.missionIntentId ||
    extension.intentRevision !== record.intentRevision ||
    extension.intentDigest !== record.intentDigest ||
    extension.proposalDigest !== record.proposalDigest ||
    extension.fragmentDigest !== record.fragmentDigest ||
    extension.semanticSlotKey !== fragment.semanticSlotKey ||
    extension.predecessorFragmentDigest !==
      fragment.predecessorFragmentDigest ||
    !same(
      extension.dependencyFragmentDigests,
      fragment.dependencyFragmentDigests,
    ) ||
    extension.planViewDigest !== record.sourcePlanView.stateDigest ||
    input.offer.objectiveId !== record.objectiveId ||
    input.offer.objectiveDocumentId !== intent.objective.objectiveDocumentId ||
    input.offer.objectiveRevision !== intent.objective.objectiveRevision ||
    input.offer.workItemId !== planningWorkItemIdV1(record.proposalDigest) ||
    !sourceMapping ||
    sourceMapping.meshId !== record.meshId ||
    sourceMapping.objectiveId !== record.objectiveId ||
    sourceMapping.workItemId !== input.offer.workItemId ||
    sourceMapping.workItemRevision !== input.offer.workItemRevision ||
    input.offer.ownerPeerId !== record.proposal.proposerPeerId ||
    input.offer.ownerEpoch !== 1 ||
    !same(
      input.offer.requiredCapabilityKeys,
      fragment.requiredCapabilityKeys,
    ) ||
    Object.keys(input.offer.matchingAttributes).length !== 0 ||
    !same(input.offer.completionCriteria, fragment.outcomeStatements) ||
    input.offer.inputReference !== record.contentReference ||
    input.offer.budgetReservationUnits !== fragment.requestedBudgetUnits ||
    input.offer.workDeadline !== fragment.workDeadline
  )
    throw new TypeError("Planning Work projection does not match its evidence");
  if (
    input.currentWork &&
    (input.currentWork.objectiveId !== input.offer.objectiveId ||
      input.currentWork.workItemId !== input.offer.workItemId ||
      input.currentWork.workItemRevision !== input.offer.workItemRevision ||
      input.currentWork.inputReference !== input.offer.inputReference)
  )
    throw new TypeError(
      "Planning Work offer is not the current local Work head",
    );
}

export function createPlanningMeshInboundProcessorV1(
  options: PlanningMeshInboundProcessorOptionsV1,
): PlanningMeshInboundProcessorV1 {
  if (
    !options?.processor ||
    typeof options.processor.process !== "function" ||
    !options.repository ||
    typeof options.repository.get !== "function" ||
    (options.admission !== undefined &&
      typeof options.admission.evaluate !== "function")
  )
    throw new TypeError("Planning Mesh inbound dependencies are invalid");
  const process = options.processor.process.bind(options.processor);
  const get = options.repository.get.bind(options.repository);
  const admission =
    options.admission ?? createReducerPlanningMeshAdmissionPortV1();
  const evaluate = admission.evaluate.bind(admission);
  return Object.freeze({
    async process(
      state: PlanningMeshInboundRuntimeStateV1,
      request: Parameters<PlanningMeshInboundProcessorV1["process"]>[1],
    ) {
      let candidate: MeshAllocationInboundDecision;
      try {
        candidate = await process(state.mesh, request);
      } catch {
        return inboundReject(state, "planning_boundary_invalid");
      }
      if (!candidate.accepted)
        return Object.freeze({
          ...candidate,
          state: Object.freeze({
            mesh: candidate.state,
            planning: state.planning,
          }),
        });
      const envelope = candidate.envelope;
      const hasCritical =
        envelope.criticalExtensions?.includes(PLANNING_WORK_EXTENSION_KEY_V1) ??
        false;
      const rawExtension =
        envelope.extensions?.[PLANNING_WORK_EXTENSION_KEY_V1];
      const planningReference =
        envelope.payload.type === "work.offer" &&
        envelope.payload.inputReference?.startsWith(
          PLANNING_FRAGMENT_REFERENCE_PREFIX_V1,
        );
      const planningObjective =
        envelope.payload.type === "work.offer" &&
        envelope.payload.objectiveId ===
          state.planning.missionIntent.objective.objectiveId;
      if (
        !hasCritical &&
        rawExtension === undefined &&
        !planningReference &&
        !planningObjective
      )
        return Object.freeze({
          ...candidate,
          state: Object.freeze({
            mesh: candidate.state,
            planning: state.planning,
          }),
        });
      const replayState = Object.freeze({
        mesh: replayOnlyMesh(state.mesh, candidate.state),
        planning: state.planning,
      });
      if (
        !hasCritical ||
        rawExtension === undefined ||
        envelope.payload.type !== "work.offer"
      )
        return inboundReject(replayState, "planning_extension_required");
      const contentReference = envelope.payload.inputReference;
      if (typeof contentReference !== "string")
        return inboundReject(replayState, "planning_extension_required");
      let extension: PlanningWorkExtensionV1;
      let record: PlanningFragmentRepositoryRecordV1 | null;
      try {
        extension = validatePlanningWorkExtensionV1(rawExtension);
        record = await get(contentReference);
      } catch {
        return inboundReject(replayState, "planning_repository_invalid");
      }
      if (!record)
        return inboundReject(replayState, "planning_repository_missing");
      try {
        record = validatePlanningFragmentRepositoryRecordV1(record);
        if (
          record.sourcePlanView.peerId !== envelope.sender.peerId ||
          record.sourcePlanView.peerInstanceId !== envelope.sender.instanceId ||
          record.proposal.proposerPeerId !== envelope.sender.peerId ||
          record.proposal.proposerInstanceId !== envelope.sender.instanceId
        )
          return inboundReject(replayState, "planning_source_invalid");
        const intent = state.planning.missionIntent;
        validatePlanningWorkProjectionV1({
          intent,
          record,
          extension,
          offer: envelope.payload,
        });
        const objective =
          candidate.state.objectives.objectives[envelope.payload.objectiveId];
        if (
          !objective ||
          objective.status !== "active" ||
          objective.objectiveDocumentId !==
            intent.objective.objectiveDocumentId ||
          objective.objectiveRevision !== intent.objective.objectiveRevision ||
          parseDelegationMandateReferenceV1(
            objective.contentReference ?? "",
          ) !== intent.mandateDigest
        )
          return inboundReject(replayState, "planning_projection_mismatch");
      } catch {
        return inboundReject(replayState, "planning_projection_mismatch");
      }
      let admitted;
      try {
        admitted = await evaluate(state.planning, {
          proposal: record.proposal,
          sourceDecision: record.decision,
          sourceFragment: record.fragment,
          sourcePlanView: record.sourcePlanView,
          extension,
          workOffer: envelope.payload,
          workItemId: envelope.payload.workItemId,
          workItemRevision: envelope.payload.workItemRevision,
          receivedAtLogicalMs: request.receivedAt,
        });
      } catch {
        return inboundReject(replayState, "planning_boundary_invalid");
      }
      if (!admitted.accepted)
        return inboundReject(replayState, "planning_local_rejected");
      let planning: PlanningReducerStateV1;
      try {
        planning = validatePlanningReducerStateV1(admitted.state);
      } catch {
        return inboundReject(replayState, "planning_boundary_invalid");
      }
      if (!localCandidateMatches(planning, record.proposal, envelope.payload))
        return inboundReject(replayState, "planning_local_head_mismatch");
      return Object.freeze({
        accepted: true,
        duplicate: candidate.duplicate,
        envelope: candidate.envelope,
        state: Object.freeze({ mesh: candidate.state, planning }),
      });
    },
  });
}

export function createPlanningAdaptiveRoleV1(
  input: PlanningAdaptiveRoleInputV1,
): PlanningAdaptiveRoleResultV1 {
  exact(
    input,
    [
      "source",
      "missionIntent",
      "planView",
      "fragment",
      "repositoryRecord",
      "extension",
      "roleBindingId",
      "targetStatus",
    ],
    "adaptive role input",
  );
  const intent = validateMissionIntentV1(input.missionIntent);
  const view = validatePlanViewV1(input.planView);
  const fragment = validatePlanFragmentV1(input.fragment);
  const record = validatePlanningFragmentRepositoryRecordV1(
    input.repositoryRecord,
  );
  const extension = validatePlanningWorkExtensionV1(input.extension);
  assertCurrentSource(intent, view, fragment);
  if (
    (input.targetStatus === "assigned" && fragment.status !== "offered") ||
    (input.targetStatus === "executing" && fragment.status !== "assigned")
  )
    throw new TypeError("Adaptive role lifecycle source is invalid");
  if (
    input.source.roleKey !== fragment.roleKey ||
    input.source.workItem.workItemId !==
      planningWorkItemIdV1(fragment.proposalDigest) ||
    !same(
      input.source.workItem.requiredCapabilityKeys,
      fragment.requiredCapabilityKeys,
    ) ||
    !same(
      input.source.workItem.completionCriteria,
      fragment.outcomeStatements,
    ) ||
    input.source.workItem.budgetReservationUnits !==
      fragment.requestedBudgetUnits ||
    input.source.workItem.workDeadline !== fragment.workDeadline
  )
    throw new TypeError("Adaptive role source does not match the fragment");
  const mapping = view.workMappings.find(
    (item) => item.fragmentDigest === fragment.fragmentDigest,
  );
  if (
    !mapping ||
    mapping.meshId !== intent.objective.meshId ||
    mapping.objectiveId !== intent.objective.objectiveId ||
    mapping.workItemId !== input.source.workItem.workItemId ||
    mapping.workItemRevision !== input.source.workItem.workItemRevision ||
    record.tenantId !== intent.tenantId ||
    record.policyDomainId !== intent.policyDomainId ||
    record.meshId !== intent.objective.meshId ||
    record.objectiveId !== intent.objective.objectiveId ||
    record.missionIntentId !== intent.missionIntentId ||
    record.intentRevision !== intent.revision ||
    record.intentDigest !== intent.intentDigest ||
    record.proposalDigest !== fragment.proposalDigest ||
    extension.missionIntentId !== record.missionIntentId ||
    extension.intentRevision !== record.intentRevision ||
    extension.intentDigest !== record.intentDigest ||
    extension.proposalDigest !== record.proposalDigest ||
    extension.fragmentDigest !== record.fragmentDigest ||
    extension.planViewDigest !== record.sourcePlanView.stateDigest ||
    input.source.workItem.inputReference !== record.contentReference
  )
    throw new TypeError(
      "Adaptive role Work revision is not the current mapping",
    );
  const workContract = createWorkContractFromMeshV1(input.source);
  const { fragmentDigest: _priorDigest, ...fragmentBody } = fragment;
  const targetFragment = createPlanFragmentV1({
    ...fragmentBody,
    fragmentRevision: fragment.fragmentRevision + 1,
    previousStateDigest: fragment.fragmentDigest,
    status: input.targetStatus,
  });
  const roleBinding = createAdaptiveRoleBindingV1({
    schemaVersion: 1,
    roleBindingId: input.roleBindingId,
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    planViewDigest: view.stateDigest,
    fragmentDigest: targetFragment.fragmentDigest,
    roleKey: fragment.roleKey,
    workContractId: workContract.workContractId,
    workContractDigest: workContract.workContractDigest,
    assignedPeerId: workContract.assignment.assignedPeerId,
    assignedInstanceId: workContract.assignment.assignedInstanceId,
    assignmentAuthorityId: workContract.assignment.assignmentAuthorityId,
    assignmentEpoch: workContract.assignment.assignmentEpoch,
    authorityGeneration: workContract.assignment.authorityGeneration,
    fencingToken: workContract.assignment.fencingToken,
    leaseExpiresAtLogicalMs: workContract.assignment.leaseExpiresAtLogicalMs,
    status: "current",
    terminalReasonCode: null,
  });
  return Object.freeze({ workContract, targetFragment, roleBinding });
}

export function createPlanningWorkReviseCommandV1(input: {
  readonly projection: PlanningLocalWorkProjectionV1;
  readonly expectedWorkItemRevision: number;
}): PlanningMeshWorkLifecycleCommandV1 {
  exact(
    input,
    ["projection", "expectedWorkItemRevision"],
    "planning Work revision input",
  );
  const projection = validatePlanningLocalWorkProjectionV1(input.projection);
  if (
    !positive(input.expectedWorkItemRevision) ||
    projection.workItemRevision !== input.expectedWorkItemRevision + 1
  )
    throw new TypeError("Planning Work revision is not the exact successor");
  return Object.freeze({
    fragmentDigest: projection.extension.fragmentDigest,
    command: Object.freeze({
      kind: "work.revise",
      input: projection.work,
      expectedWorkItemRevision: input.expectedWorkItemRevision,
    } satisfies MeshObjectiveWorkCommand),
  });
}

export function createPlanningWorkCancelCommandV1(input: {
  readonly missionIntent: MissionIntentV1;
  readonly planView: PlanViewV1;
  readonly fragment: PlanFragmentV1;
}): PlanningMeshWorkLifecycleCommandV1 {
  exact(
    input,
    ["missionIntent", "planView", "fragment"],
    "planning Work cancellation input",
  );
  const intent = validateMissionIntentV1(input.missionIntent);
  const view = validatePlanViewV1(input.planView);
  const fragment = validatePlanFragmentV1(input.fragment);
  assertCurrentSource(intent, view, fragment);
  const mapping = view.workMappings.find(
    (item) => item.fragmentDigest === fragment.fragmentDigest,
  );
  if (
    !mapping ||
    mapping.meshId !== intent.objective.meshId ||
    mapping.objectiveId !== intent.objective.objectiveId ||
    mapping.workItemId !== planningWorkItemIdV1(fragment.proposalDigest)
  )
    throw new TypeError("Planning cancellation has no current Work mapping");
  return Object.freeze({
    fragmentDigest: fragment.fragmentDigest,
    command: Object.freeze({
      kind: "work.cancel",
      objectiveId: mapping.objectiveId,
      workItemId: mapping.workItemId,
      expectedWorkItemRevision: mapping.workItemRevision,
    } satisfies MeshObjectiveWorkCommand),
  });
}

/** Supersession composes an existing Mesh revision or cancellation only. */
export function createPlanningSupersessionCommandV1(
  input:
    | {
        readonly mode: "revise";
        readonly projection: PlanningLocalWorkProjectionV1;
        readonly expectedWorkItemRevision: number;
      }
    | {
        readonly mode: "cancel";
        readonly missionIntent: MissionIntentV1;
        readonly planView: PlanViewV1;
        readonly fragment: PlanFragmentV1;
      },
): PlanningMeshWorkLifecycleCommandV1 {
  return input.mode === "revise"
    ? createPlanningWorkReviseCommandV1(input)
    : createPlanningWorkCancelCommandV1(input);
}

function localCandidateMatches(
  state: PlanningReducerStateV1,
  proposal: PlanFragmentProposalV1,
  offer: WorkOfferPayload,
): boolean {
  const headDigest = state.planView.selectedHeads.find(
    (head) => head.semanticSlotKey === proposal.semanticSlotKey,
  )?.fragmentDigest;
  const fragment = state.planView.fragments.find(
    (item) => item.fragmentDigest === headDigest,
  );
  const mapping =
    fragment &&
    state.planView.workMappings.find(
      (item) => item.fragmentDigest === fragment.fragmentDigest,
    );
  return (
    !!fragment &&
    fragment.proposalDigest === proposal.proposalDigest &&
    fragment.status === "offered" &&
    !!mapping &&
    mapping.meshId === state.missionIntent.objective.meshId &&
    mapping.objectiveId === offer.objectiveId &&
    mapping.workItemId === offer.workItemId &&
    mapping.workItemRevision === offer.workItemRevision &&
    same(fragment.requiredCapabilityKeys, offer.requiredCapabilityKeys) &&
    same(fragment.outcomeStatements, offer.completionCriteria) &&
    fragment.requestedBudgetUnits === offer.budgetReservationUnits &&
    fragment.workDeadline === offer.workDeadline
  );
}

function currentFragmentForProposal(
  state: PlanningReducerStateV1,
  proposal: PlanFragmentProposalV1,
): PlanFragmentV1 | undefined {
  const head = state.planView.selectedHeads.find(
    (item) => item.semanticSlotKey === proposal.semanticSlotKey,
  );
  if (!head) return undefined;
  const fragment = state.planView.fragments.find(
    (item) => item.fragmentDigest === head.fragmentDigest,
  );
  return fragment?.proposalDigest === proposal.proposalDigest
    ? fragment
    : undefined;
}

function replayOnlyMesh(
  original: MeshAllocationInboundRuntimeState,
  candidate: MeshAllocationInboundRuntimeState,
): MeshAllocationInboundRuntimeState {
  return createMeshAllocationInboundRuntimeState(
    original.coordination,
    original.discovery,
    original.objectives,
    original.allocation,
    candidate.inbound,
  );
}

function inboundReject(
  state: PlanningMeshInboundRuntimeStateV1,
  code: PlanningMeshInboundRejectionCodeV1,
): PlanningMeshInboundDecisionV1 {
  return Object.freeze({ accepted: false, code, state });
}

function assertCurrentSource(
  intent: MissionIntentV1,
  view: PlanViewV1,
  fragment: PlanFragmentV1,
): void {
  if (
    view.tenantId !== intent.tenantId ||
    view.policyDomainId !== intent.policyDomainId ||
    view.missionIntentId !== intent.missionIntentId ||
    view.intentRevision !== intent.revision ||
    view.intentDigest !== intent.intentDigest ||
    fragment.missionIntentId !== intent.missionIntentId ||
    fragment.intentRevision !== intent.revision ||
    fragment.intentDigest !== intent.intentDigest ||
    view.selectedHeads.find(
      (head) => head.semanticSlotKey === fragment.semanticSlotKey,
    )?.fragmentDigest !== fragment.fragmentDigest ||
    !view.fragments.some(
      (record) => record.fragmentDigest === fragment.fragmentDigest,
    ) ||
    !["active", "offered", "assigned", "executing"].includes(fragment.status)
  )
    throw new TypeError("Planning fragment is not the current source head");
}

function findProposal(
  view: PlanViewV1,
  digest: string,
): PlanFragmentProposalV1 {
  const proposal = view.proposals.find(
    (item) => item.proposalDigest === digest,
  );
  if (!proposal)
    throw new TypeError("Planning proposal is missing from its source view");
  return proposal;
}

function findDecision(
  view: PlanViewV1,
  digest: string,
): PlanFragmentDecisionV1 {
  const decision = view.decisions.find(
    (item) => item.decisionDigest === digest,
  );
  if (!decision || decision.status !== "accepted")
    throw new TypeError(
      "Accepted planning decision is missing from its source view",
    );
  return decision;
}

function exactPlanningCapability(capability: {
  readonly capabilityKey: string;
  readonly version: string;
  readonly variant?: string;
  readonly inputMediaTypes: readonly string[];
  readonly outputMediaTypes: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
}): boolean {
  const profile = PLANNING_MESH_CAPABILITY_PROFILE_V1;
  return (
    capability.capabilityKey === profile.capabilityKey &&
    capability.version === profile.version &&
    capability.variant === profile.variant &&
    same(capability.inputMediaTypes, profile.inputMediaTypes) &&
    same(capability.outputMediaTypes, profile.outputMediaTypes) &&
    Object.keys(capability.attributes).length ===
      Object.keys(profile.attributes).length &&
    Object.entries(profile.attributes).every(
      ([key, value]) => capability.attributes[key] === value,
    )
  );
}

function timestampBefore(left: string, right: string): boolean {
  const result = compareMeshTimestamps(left, right);
  return result.ok && result.value < 0;
}

function timestampAtOrBefore(left: string, right: string): boolean {
  const result = compareMeshTimestamps(left, right);
  return result.ok && result.value <= 0;
}

function freezeExtension(
  value: PlanningWorkExtensionV1,
): PlanningWorkExtensionV1 {
  return Object.freeze({
    ...value,
    dependencyFragmentDigests: Object.freeze([
      ...value.dependencyFragmentDigests,
    ]),
  });
}

function exact(
  value: unknown,
  keys: readonly string[],
  name: string,
  optional = false,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(`${name} must be a plain record`);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string"))
    throw new TypeError(`${name} may not contain symbol fields`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some(
      (descriptor) =>
        !descriptor.enumerable || "get" in descriptor || "set" in descriptor,
    )
  )
    throw new TypeError(`${name} may contain only enumerable data fields`);
  const actual = (ownKeys as string[]).sort();
  const allowed = [...keys].sort();
  if (
    actual.some((key) => !allowed.includes(key)) ||
    (!optional && actual.join("\0") !== allowed.join("\0"))
  )
    throw new TypeError(`${name} has unknown or missing fields`);
}

function safeDataArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol")) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some(
      (descriptor) => "get" in descriptor || "set" in descriptor,
    )
  )
    return false;
  for (let index = 0; index < value.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  return true;
}

function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
