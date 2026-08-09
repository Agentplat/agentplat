import type { PlanningJson } from "@agentplat/collective-planning";

import {
  type MultiDomainActionEnvelopeV1,
  type MultiDomainAdapterConformanceReportV1,
  type MultiDomainEnvironmentAdapterV1,
  type MultiDomainEnvironmentDescriptorV1,
  type MultiDomainEnvironmentDomainV1,
  type MultiDomainObservationEnvelopeV1,
  type MultiDomainScenarioDefinitionV1,
  type MultiDomainScenarioManifestV1,
} from "./multi-domain-environment-contracts.js";
import {
  createMultiDomainEnvironmentDescriptorV1,
  createMultiDomainObservationEnvelopeV1,
  createMultiDomainScenarioManifestV1,
  multiDomainEnvironmentDigestV1,
  validateMultiDomainActionEnvelopeV1,
  validateMultiDomainEnvironmentDescriptorV1,
  validateMultiDomainObservationEnvelopeV1,
  validateMultiDomainScenarioManifestV1,
} from "./multi-domain-environment-validation.js";
import { InMemoryShardedSimulationBridgeV1 } from "./sharded-simulation-runtime.js";
import { validateShardedSimulationCheckpointV1 } from "./sharded-simulation-validation.js";
import {
  createShardedSimulationAssignmentsV1,
  shardedSimulationDigestV1,
  shardedSimulationFencedActionDigestV1,
  shardedSimulationScaleProfileV1,
  type ShardedSimulationCheckpointV1,
  type ShardedSimulationCrossShardMessageAckV1,
  type ShardedSimulationCrossShardMessageBatchV1,
  type ShardedSimulationEffectReceiptV1,
  type ShardedSimulationEnvironmentBridgeV1,
  type ShardedSimulationEnvironmentSessionV1,
  type ShardedSimulationEpisodeV1,
  type ShardedSimulationFencedActionRequestV1,
  type ShardedSimulationPartialObservationDeliveryV1,
  type ShardedSimulationPartialObservationPullV1,
  type ShardedSimulationRestoreReceiptV1,
  type ShardedSimulationRestoreRequestV1,
  type ShardedSimulationScaleProfileV1,
  type ShardedSimulationShardAssignmentV1,
} from "./sharded-simulation-contracts.js";

type ConcreteDomain = Exclude<MultiDomainEnvironmentDomainV1, "hybrid">;

/**
 * Reference adapters are deliberately coarse-grained and local. Their purpose
 * is to demonstrate one contract across domain families, not domain fidelity.
 */
export function createReferenceMultiDomainEnvironmentAdapterV1(input: {
  readonly domain: ConcreteDomain;
  readonly adapterId?: string;
  readonly adapterVersion?: number;
}): MultiDomainEnvironmentAdapterV1 {
  const preset = presetFor(input.domain);
  const adapterId = input.adapterId ?? `reference-${input.domain}-environment`;
  const adapterVersion = input.adapterVersion ?? 1;
  const observationSchemaDigest = multiDomainEnvironmentDigestV1(
    "reference-observation-schema",
    {
      adapterId,
      adapterVersion,
      domain: input.domain,
      modality: preset.modality,
    },
  );
  const actionSchemaDigest = multiDomainEnvironmentDigestV1(
    "reference-action-schema",
    {
      adapterId,
      adapterVersion,
      domain: input.domain,
      capability: preset.capability,
    },
  );
  const descriptor = createMultiDomainEnvironmentDescriptorV1({
    adapterId,
    adapterVersion,
    implementationDigest: multiDomainEnvironmentDigestV1(
      "reference-implementation",
      { adapterId, adapterVersion, domain: input.domain },
    ),
    domains: [input.domain],
    capabilities: [preset.capability],
    observationSchemas: [
      {
        schemaVersion: 1,
        domain: input.domain,
        modality: preset.modality,
        schemaId: `${input.domain}-observation-v1`,
        schemaDigest: observationSchemaDigest,
      },
    ],
    actionSchemas: [
      {
        schemaVersion: 1,
        domain: input.domain,
        capability: preset.capability,
        schemaId: `${input.domain}-action-v1`,
        schemaDigest: actionSchemaDigest,
      },
    ],
    limits: {
      maximumEntities: 100_000,
      maximumObservationBytes: 64 * 1024,
      maximumActionBytes: 64 * 1024,
      maximumObservationsPerPull: 8,
      maximumCheckpointBytes: 1024 * 1024,
    },
    deterministicReplay: true,
  });
  return Object.freeze({
    descriptor,
    createScenario(definition: MultiDomainScenarioDefinitionV1) {
      return createMultiDomainScenarioManifestV1({ descriptor, definition });
    },
    openScenario({
      manifest,
    }: {
      readonly manifest: MultiDomainScenarioManifestV1;
    }) {
      return new ReferenceMultiDomainBridgeV1(
        descriptor,
        validateMultiDomainScenarioManifestV1(manifest, descriptor),
        input.domain,
      );
    },
  });
}

export function createReferenceMultiDomainScenarioDefinitionV1(input: {
  readonly adapter: MultiDomainEnvironmentAdapterV1;
  readonly scenarioId: string;
  readonly scaleProfileId:
    | "peers-500-interactions-5000"
    | "peers-5000-interactions-50000"
    | "peers-100000-interactions-1000000";
  readonly seed: number;
  readonly entityCount?: number;
}): MultiDomainScenarioDefinitionV1 {
  const descriptor = validateMultiDomainEnvironmentDescriptorV1(
    input.adapter.descriptor,
  );
  const profile = shardedSimulationScaleProfileV1(input.scaleProfileId);
  const domains = descriptor.domains.filter(
    (domain): domain is ConcreteDomain => domain !== "hybrid",
  );
  return Object.freeze({
    schemaVersion: 1,
    scenarioId: input.scenarioId,
    scaleProfileId: input.scaleProfileId,
    seed: input.seed,
    domains,
    entityCount: input.entityCount ?? profile.logicalPeerCount,
    topologyDigest: multiDomainEnvironmentDigestV1("reference-topology", {
      scenarioId: input.scenarioId,
      profileId: input.scaleProfileId,
    }),
    transitionPolicyDigest: multiDomainEnvironmentDigestV1(
      "reference-transition-policy",
      { domains },
    ),
    visibilityPolicyDigest: multiDomainEnvironmentDigestV1(
      "reference-visibility-policy",
      { visibility: "peer-local" },
    ),
    faultModelDigest: multiDomainEnvironmentDigestV1("reference-fault-model", {
      vocabulary: "sharded-simulation-v1",
    }),
    resourceBudget: Object.freeze({
      maximumInteractions: profile.interactionCeiling,
      maximumObservationBytes: descriptor.limits.maximumObservationBytes,
      maximumActionBytes: descriptor.limits.maximumActionBytes,
      maximumCheckpointBytes: descriptor.limits.maximumCheckpointBytes,
    }),
  });
}

/** Public, deterministic conformance runner. It never receives evaluator metrics. */
export async function runMultiDomainAdapterConformanceV1(input: {
  readonly adapter: MultiDomainEnvironmentAdapterV1;
  readonly definition: MultiDomainScenarioDefinitionV1;
}): Promise<MultiDomainAdapterConformanceReportV1> {
  const descriptor = validateMultiDomainEnvironmentDescriptorV1(
    input.adapter.descriptor,
  );
  const expectedManifest = createMultiDomainScenarioManifestV1({
    descriptor,
    definition: input.definition,
  });
  const firstManifest = validateMultiDomainScenarioManifestV1(
    await input.adapter.createScenario(input.definition),
    descriptor,
  );
  const secondManifest = validateMultiDomainScenarioManifestV1(
    await input.adapter.createScenario(input.definition),
    descriptor,
  );
  if (
    firstManifest.manifestDigest !== expectedManifest.manifestDigest ||
    secondManifest.manifestDigest !== expectedManifest.manifestDigest
  )
    fail("conformance_definition_substitution");
  const manifestReplayStable =
    firstManifest.manifestDigest === secondManifest.manifestDigest;
  const profile = shardedSimulationScaleProfileV1(firstManifest.scaleProfileId);
  const assignmentCount = Math.min(16, firstManifest.entityCount);
  const assignments = createShardedSimulationAssignmentsV1({
    profile,
    shardCount: assignmentCount,
  });
  const first = await exerciseAdapter(
    await input.adapter.openScenario({ manifest: firstManifest }),
    descriptor,
    firstManifest,
    profile,
    assignments,
  );
  const second = await exerciseAdapter(
    await input.adapter.openScenario({ manifest: secondManifest }),
    descriptor,
    secondManifest,
    profile,
    assignments,
  );
  const observationReplayStable =
    first.observationDigest === second.observationDigest;
  const checkpointRestoreStable =
    first.restoreProbePassed &&
    second.restoreProbePassed &&
    first.checkpointRevision === second.checkpointRevision;
  const boundedState =
    first.observationCount <= descriptor.limits.maximumObservationsPerPull &&
    first.boundsObserved &&
    second.boundsObserved &&
    firstManifest.entityCount <= descriptor.limits.maximumEntities &&
    firstManifest.resourceBudget.maximumInteractions <=
      profile.interactionCeiling;
  const descriptorValid = true;
  const capabilityFailClosed =
    first.capabilityFailClosed && second.capabilityFailClosed;
  const staleFenceRejected =
    first.staleFenceRejected && second.staleFenceRejected;
  const conformant =
    descriptorValid &&
    manifestReplayStable &&
    observationReplayStable &&
    capabilityFailClosed &&
    staleFenceRejected &&
    checkpointRestoreStable &&
    boundedState;
  const body = {
    schemaVersion: 1 as const,
    adapterDescriptorDigest: descriptor.descriptorDigest,
    scenarioManifestDigest: firstManifest.manifestDigest,
    scaleProfileId: firstManifest.scaleProfileId,
    descriptorValid,
    manifestReplayStable,
    observationReplayStable,
    capabilityFailClosed,
    staleFenceRejected,
    checkpointRestoreStable,
    boundedState,
    conformant,
  };
  return Object.freeze({
    ...body,
    reportDigest: multiDomainEnvironmentDigestV1("conformance-report", body),
  });
}

class ReferenceMultiDomainBridgeV1 implements ShardedSimulationEnvironmentBridgeV1 {
  readonly #delegate = new InMemoryShardedSimulationBridgeV1();
  readonly #descriptor: MultiDomainEnvironmentDescriptorV1;
  readonly #manifest: MultiDomainScenarioManifestV1;
  readonly #domain: ConcreteDomain;
  readonly #interactionFingerprints = new Map<string, string>();
  readonly #interactionSlots = new Set<string>();
  readonly #budgetSnapshots = new Map<
    string,
    {
      readonly interactionFingerprints: readonly (readonly [string, string])[];
      readonly interactionSlots: readonly string[];
    }
  >();

  constructor(
    descriptor: MultiDomainEnvironmentDescriptorV1,
    manifest: MultiDomainScenarioManifestV1,
    domain: ConcreteDomain,
  ) {
    this.#descriptor = descriptor;
    this.#manifest = manifest;
    this.#domain = domain;
  }

  createSession(input: {
    readonly environmentId: string;
    readonly logicalTime: number;
  }): ShardedSimulationEnvironmentSessionV1 {
    if (input.environmentId !== this.#descriptor.adapterId)
      fail("environment_identity_mismatch");
    return this.#delegate.createSession(input);
  }

  startEpisode(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episodeId: string;
    readonly seed: number;
    readonly logicalTime: number;
  }): ShardedSimulationEpisodeV1 {
    if (input.seed !== this.#manifest.seed) fail("scenario_seed_mismatch");
    return this.#delegate.startEpisode(input);
  }

  bindShardAssignments(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episode: ShardedSimulationEpisodeV1;
    readonly profile: ShardedSimulationScaleProfileV1;
    readonly assignments: readonly ShardedSimulationShardAssignmentV1[];
  }): void {
    if (input.profile.profileId !== this.#manifest.scaleProfileId)
      fail("scenario_scale_profile_mismatch");
    this.#delegate.bindShardAssignments(input);
  }

  pullPartialObservation(
    input: ShardedSimulationPartialObservationPullV1,
  ): ShardedSimulationPartialObservationDeliveryV1 {
    if (input.peerIndex >= this.#manifest.entityCount)
      fail("observation_entity_out_of_scope");
    const schema = this.#descriptor.observationSchemas.find(
      (candidate) => candidate.domain === this.#domain,
    );
    if (!schema) fail("observation_schema_unavailable");
    const observation = createMultiDomainObservationEnvelopeV1({
      descriptor: this.#descriptor,
      observationId: `${input.requestId}.observation`,
      domain: this.#domain,
      entityId: `entity:${input.peerIndex}`,
      modality: schema.modality,
      schemaDigest: schema.schemaDigest,
      logicalTime: input.logicalTime,
      payload: referenceObservationPayload(this.#domain, input.peerIndex),
    });
    const body = {
      schemaVersion: 1 as const,
      requestId: input.requestId,
      peerIndex: input.peerIndex,
      logicalTime: input.logicalTime,
      observations: Object.freeze([
        observation,
      ]) as unknown as readonly PlanningJson[],
      nextCursor: null,
    };
    const delivery = Object.freeze({
      ...body,
      deliveryDigest: shardedSimulationDigestV1(
        "sharded-simulation-observation-delivery-v1",
        body,
      ),
    });
    if (
      jsonBytes(delivery.observations) >
      this.#manifest.resourceBudget.maximumObservationBytes
    )
      fail("observation_scenario_budget_exceeded");
    this.#admitInteraction(
      `observation:${input.requestId}`,
      shardedSimulationDigestV1("multi-domain-observation-request-v1", input),
      [`${input.peerIndex}:${input.logicalTime}`],
    );
    this.#delegate.pullPartialObservation(input);
    return delivery;
  }

  requestEffect(
    input: ShardedSimulationFencedActionRequestV1,
  ): ShardedSimulationEffectReceiptV1 {
    if (input.peerIndex >= this.#manifest.entityCount)
      fail("action_entity_out_of_scope");
    const action = validateMultiDomainActionEnvelopeV1(
      input.action,
      this.#descriptor,
    );
    if (action.entityId !== `entity:${input.peerIndex}`)
      fail("action_entity_binding_mismatch");
    if (jsonBytes(action) > this.#manifest.resourceBudget.maximumActionBytes)
      fail("action_scenario_budget_exceeded");
    this.#admitInteraction(`action:${input.actionId}`, input.actionDigest, [
      `${input.peerIndex}:${input.logicalTime}`,
    ]);
    return this.#delegate.requestEffect(input);
  }

  deliverCrossShardBatch(
    input: ShardedSimulationCrossShardMessageBatchV1,
  ): ShardedSimulationCrossShardMessageAckV1 {
    if (
      input.messages.some(
        (message) =>
          message.sourcePeerIndex >= this.#manifest.entityCount ||
          message.targetPeerIndex >= this.#manifest.entityCount,
      )
    )
      fail("cross_shard_entity_out_of_scope");
    this.#admitInteraction(
      `batch:${input.batchId}`,
      input.batchDigest,
      input.messages.map(
        (message) => `${message.sourcePeerIndex}:${message.logicalTime}`,
      ),
    );
    return this.#delegate.deliverCrossShardBatch(input);
  }

  checkpoint(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episode: ShardedSimulationEpisodeV1;
    readonly expectedRevision: number;
    readonly logicalTime: number;
  }): ShardedSimulationCheckpointV1 {
    if (
      referenceCheckpointEnvelopeBytes(input) >
      this.#manifest.resourceBudget.maximumCheckpointBytes
    )
      fail("checkpoint_scenario_budget_exceeded");
    const checkpoint = this.#delegate.checkpoint(input);
    if (
      jsonBytes(checkpoint) >
      this.#manifest.resourceBudget.maximumCheckpointBytes
    )
      fail("checkpoint_scenario_budget_exceeded");
    this.#budgetSnapshots.set(checkpoint.checkpointId, {
      interactionFingerprints: [...this.#interactionFingerprints],
      interactionSlots: [...this.#interactionSlots],
    });
    return checkpoint;
  }

  restore(
    input: ShardedSimulationRestoreRequestV1,
  ): ShardedSimulationRestoreReceiptV1 {
    if (
      jsonBytes(input.checkpoint) >
      this.#manifest.resourceBudget.maximumCheckpointBytes
    )
      fail("restore_checkpoint_scenario_budget_exceeded");
    const snapshot = this.#budgetSnapshots.get(input.checkpoint.checkpointId);
    if (!snapshot) fail("restore_budget_snapshot_missing");
    const restored = this.#delegate.restore(input);
    this.#interactionFingerprints.clear();
    for (const [key, fingerprint] of snapshot.interactionFingerprints)
      this.#interactionFingerprints.set(key, fingerprint);
    this.#interactionSlots.clear();
    for (const slot of snapshot.interactionSlots) this.#interactionSlots.add(slot);
    return restored;
  }

  #admitInteraction(
    key: string,
    fingerprint: string,
    slots: readonly string[],
  ): void {
    const previous = this.#interactionFingerprints.get(key);
    if (previous) {
      if (previous !== fingerprint) fail("interaction_identity_equivocation");
      return;
    }
    const addedSlots = [...new Set(slots)].filter(
      (slot) => !this.#interactionSlots.has(slot),
    );
    if (
      this.#interactionSlots.size + addedSlots.length >
      this.#manifest.resourceBudget.maximumInteractions
    )
      fail("scenario_interaction_budget_exceeded");
    this.#interactionFingerprints.set(key, fingerprint);
    for (const slot of addedSlots) this.#interactionSlots.add(slot);
  }
}

async function exerciseAdapter(
  bridge: ShardedSimulationEnvironmentBridgeV1,
  descriptor: MultiDomainEnvironmentDescriptorV1,
  manifest: MultiDomainScenarioManifestV1,
  profile: ShardedSimulationScaleProfileV1,
  assignments: readonly ShardedSimulationShardAssignmentV1[],
): Promise<{
  readonly observationDigest: string;
  readonly observationCount: number;
  readonly capabilityFailClosed: boolean;
  readonly staleFenceRejected: boolean;
  readonly checkpointRevision: number;
  readonly restoreProbePassed: boolean;
  readonly boundsObserved: boolean;
}> {
  const session = await bridge.createSession({
    environmentId: descriptor.adapterId,
    logicalTime: 0,
  });
  const episode = await bridge.startEpisode({
    session,
    episodeId: `conformance:${manifest.scenarioId}`,
    seed: manifest.seed,
    logicalTime: 0,
  });
  await bridge.bindShardAssignments({ session, episode, profile, assignments });
  const delivery = await bridge.pullPartialObservation({
    schemaVersion: 1,
    sessionId: session.sessionId,
    episodeId: episode.episodeId,
    peerIndex: 0,
    logicalTime: 1,
    cursor: null,
    requestId: "conformance:observation:0",
  });
  for (const observation of delivery.observations)
    validateMultiDomainObservationEnvelopeV1(observation, descriptor);
  if (
    delivery.schemaVersion !== 1 ||
    delivery.requestId !== "conformance:observation:0" ||
    delivery.peerIndex !== 0 ||
    delivery.logicalTime !== 1 ||
    delivery.observations.length > descriptor.limits.maximumObservationsPerPull
  )
    fail("conformance_observation_delivery_invalid");
  const { deliveryDigest, ...deliveryBody } = delivery;
  if (
    deliveryDigest !==
    shardedSimulationDigestV1(
      "sharded-simulation-observation-delivery-v1",
      deliveryBody,
    )
  )
    fail("conformance_observation_delivery_digest_invalid");

  const registered = descriptor.actionSchemas[0];
  if (!registered) fail("conformance_action_schema_missing");
  const invalidAction: MultiDomainActionEnvelopeV1 = {
    schemaVersion: 1,
    domain: registered.domain,
    entityId: "entity:0",
    capability: "unsupported-capability",
    schemaDigest: registered.schemaDigest,
    payload: { requested: true },
  };
  let capabilityFailClosed = false;
  try {
    await bridge.requestEffect(
      actionRequest(
        session,
        episode,
        invalidAction,
        "conformance:invalid-action",
        "stale-fence",
        2,
      ),
    );
  } catch {
    capabilityFailClosed = true;
  }

  const validAction: MultiDomainActionEnvelopeV1 = {
    schemaVersion: 1,
    domain: registered.domain,
    entityId: "entity:0",
    capability: registered.capability,
    schemaDigest: registered.schemaDigest,
    payload: { requested: true },
  };
  const staleReceipt = await bridge.requestEffect(
    actionRequest(
      session,
      episode,
      validAction,
      "conformance:stale-fence-action",
      "stale-fence",
      2,
    ),
  );
  const checkpoint = validateShardedSimulationCheckpointV1(
    await bridge.checkpoint({
      session,
      episode,
      expectedRevision: 0,
      logicalTime: 3,
    }),
  );
  const postCheckpointRequest = actionRequest(
    session,
    episode,
    validAction,
    "conformance:post-checkpoint-action",
    `fence:${session.sessionId}:${episode.episodeId}:0:1`,
    4,
  );
  const acceptedAfterCheckpoint = await bridge.requestEffect(
    postCheckpointRequest,
  );
  if (!acceptedAfterCheckpoint.accepted)
    fail("conformance_post_checkpoint_mutation_rejected");
  const restored = await bridge.restore({
    schemaVersion: 1,
    checkpoint,
    expectedAnchorDigest: checkpoint.anchor.anchorDigest,
  });
  const { receiptDigest, ...restoreBody } = restored;
  if (
    restored.schemaVersion !== 1 ||
    restored.checkpointId !== checkpoint.checkpointId ||
    restored.restoredRevision !== checkpoint.revision ||
    restored.restoredLogicalTime < checkpoint.logicalTime ||
    receiptDigest !==
      shardedSimulationDigestV1(
        "sharded-simulation-restore-receipt-v1",
        restoreBody,
      )
  )
    fail("conformance_restore_receipt_invalid");
  let restoreProbePassed = false;
  try {
    const changedAction = {
      ...validAction,
      payload: { requested: false },
    };
    const replayedAfterRestore = await bridge.requestEffect(
      actionRequest(
        session,
        episode,
        changedAction,
        postCheckpointRequest.actionId,
        postCheckpointRequest.fenceToken,
        postCheckpointRequest.logicalTime,
      ),
    );
    restoreProbePassed =
      replayedAfterRestore.accepted &&
      replayedAfterRestore.receiptDigest !== acceptedAfterCheckpoint.receiptDigest;
  } catch {
    restoreProbePassed = false;
  }

  let outOfScopeEntityRejected = false;
  try {
    const peerIndex = manifest.entityCount;
    await bridge.requestEffect(
      actionRequest(
        session,
        episode,
        { ...validAction, entityId: `entity:${peerIndex}` },
        "conformance:out-of-scope-action",
        `fence:${session.sessionId}:${episode.episodeId}:${peerIndex}:1`,
        5,
        peerIndex,
      ),
    );
  } catch {
    outOfScopeEntityRejected = true;
  }
  let oversizedActionRejected = false;
  try {
    const oversized = {
      ...validAction,
      payload: {
        data: "x".repeat(manifest.resourceBudget.maximumActionBytes + 1),
      },
    };
    await bridge.requestEffect(
      actionRequest(
        session,
        episode,
        oversized,
        "conformance:oversized-action",
        `fence:${session.sessionId}:${episode.episodeId}:0:1`,
        5,
      ),
    );
  } catch {
    oversizedActionRejected = true;
  }
  const boundsObserved =
    outOfScopeEntityRejected &&
    oversizedActionRejected &&
    jsonBytes(delivery.observations) <=
      manifest.resourceBudget.maximumObservationBytes &&
    jsonBytes(checkpoint) <= manifest.resourceBudget.maximumCheckpointBytes;
  return Object.freeze({
    observationDigest: delivery.deliveryDigest,
    observationCount: delivery.observations.length,
    capabilityFailClosed,
    staleFenceRejected: staleReceipt.accepted === false,
    checkpointRevision: checkpoint.revision,
    restoreProbePassed,
    boundsObserved,
  });
}

function actionRequest(
  session: ShardedSimulationEnvironmentSessionV1,
  episode: ShardedSimulationEpisodeV1,
  action: MultiDomainActionEnvelopeV1,
  actionId: string,
  fenceToken: string,
  logicalTime: number,
  peerIndex = 0,
): ShardedSimulationFencedActionRequestV1 {
  const body = {
    schemaVersion: 1 as const,
    actionId,
    sessionId: session.sessionId,
    episodeId: episode.episodeId,
    peerIndex,
    logicalTime,
    executionEpoch: 1,
    fenceToken,
    action: action as unknown as PlanningJson,
  };
  return Object.freeze({
    ...body,
    actionDigest: shardedSimulationFencedActionDigestV1(body),
  });
}

function referenceObservationPayload(
  domain: ConcreteDomain,
  peerIndex: number,
): PlanningJson {
  switch (domain) {
    case "physical":
      return {
        kind: "resource-state",
        entityIndex: peerIndex,
        available: true,
      };
    case "social":
      return {
        kind: "information-state",
        entityIndex: peerIndex,
        confidenceBps: 5_000,
      };
    case "cyber":
      return { kind: "service-state", entityIndex: peerIndex, online: true };
  }
}

function presetFor(domain: ConcreteDomain): {
  readonly modality: "sensor" | "text" | "state";
  readonly capability: string;
} {
  switch (domain) {
    case "physical":
      return { modality: "sensor", capability: "resource-control" };
    case "social":
      return { modality: "text", capability: "information-exchange" };
    case "cyber":
      return { modality: "state", capability: "service-control" };
  }
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function referenceCheckpointEnvelopeBytes(input: {
  readonly session: ShardedSimulationEnvironmentSessionV1;
  readonly episode: ShardedSimulationEpisodeV1;
  readonly expectedRevision: number;
  readonly logicalTime: number;
}): number {
  const revision = input.expectedRevision + 1;
  const digest = `sha256:${"0".repeat(64)}`;
  return jsonBytes({
    schemaVersion: 1,
    checkpointId: `${input.session.sessionId}:${input.episode.episodeId}:checkpoint:${revision}`,
    sessionId: input.session.sessionId,
    episodeId: input.episode.episodeId,
    revision,
    logicalTime: input.logicalTime,
    snapshotHandle: `local-snapshot:${revision}`,
    snapshotDigest: digest,
    anchor: {
      schemaVersion: 1,
      anchorId: `${input.session.sessionId}:${input.episode.episodeId}:anchor:${revision}`,
      revision,
      previousAnchorDigest: input.expectedRevision === 0 ? null : digest,
      anchorDigest: digest,
    },
    checkpointDigest: digest,
  });
}

function fail(code: string): never {
  throw new TypeError(`multi_domain_environment_${code}`);
}
