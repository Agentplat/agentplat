import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

const evaluation = await import("../dist/scalable-evaluation.js");
const environment = await import("../dist/multi-domain-environment.js");
const simulation = await import("../dist/sharded-simulation.js");
const crypto = globalThis.crypto ?? webcrypto;
const evidenceKeys = await crypto.subtle.generateKey("Ed25519", false, [
  "sign",
  "verify",
]);

function fixture({ perturbations = false, perturbationLogicalTime = 1 } = {}) {
  const baseAdapter =
    environment.createReferenceMultiDomainEnvironmentAdapterV1({
      domain: "cyber",
      adapterId: "durable:cyber",
    });
  const profile = evaluation.createScalableEvaluationProfileV1({
    profileId: "standard-500",
    maximumInteractions: 8,
    maximumMessages: 8,
    maximumMessageBytes: 4_096,
    maximumRetainedRecords: 4,
  });
  const scenario = environment.createReferenceMultiDomainScenarioDefinitionV1({
    adapter: baseAdapter,
    scenarioId: "durable:scenario",
    scaleProfileId: profile.shardedProfileId,
    seed: 73,
  });
  const teams = ["distributed", "centralized"].map((architecture) =>
    evaluation.createScalableEvaluationTeamDescriptorV1({
      teamId: `durable:${architecture}`,
      architecture,
      implementationId: `durable:${architecture}:implementation`,
      implementationVersion: "1",
      implementationDigest: evaluation.scalableEvaluationDigestV1(
        "durable-team-implementation",
        { architecture },
      ),
    }),
  );
  const partialObservability =
    evaluation.createScalableEvaluationPartialObservabilityV1({
      scope: "peer_local",
      maximumObservationsPerPull: 4,
      allowCrossDomainAggregation: false,
      sourceVisibilityPolicyDigest: scenario.visibilityPolicyDigest,
    });
  const perturbationPlan = perturbations
    ? [
        evaluation.createScalableEvaluationPerturbationV1({
          perturbationId: "durable:perturbation",
          kind: "benign",
          domain: "cyber",
          scheduledAtLogicalTime: perturbationLogicalTime,
          targetTeamIds: teams.map((team) => team.teamId),
          targetAgentCount: 1,
          targetSelectorDigest: evaluation.scalableEvaluationDigestV1(
            "durable-target-selector",
            { peerIndex: 0 },
          ),
        }),
      ]
    : [];
  const definition = evaluation.createScalableEvaluationDefinitionV1({
    evaluationId: "durable:evaluation",
    profile,
    descriptor: baseAdapter.descriptor,
    scenario,
    partialObservability,
    teams,
    perturbations: perturbationPlan,
  });
  return { baseAdapter, definition, teams };
}

function output(value, descriptor, input) {
  const actionSchema = value.baseAdapter.descriptor.actionSchemas[0];
  const action = {
    schemaVersion: 1,
    domain: "cyber",
    entityId: `entity:${input.peerIndex}`,
    capability: actionSchema.capability,
    schemaDigest: actionSchema.schemaDigest,
    payload: { requested: true },
  };
  const transportEnvelope = {
    schemaVersion: 1,
    teamId: descriptor.teamId,
    logicalTime: input.logicalTime,
  };
  const message = {
    schemaVersion: 1,
    messageId: `message:${descriptor.teamId}:${input.logicalTime}`,
    sourcePeerIndex: input.peerIndex,
    targetPeerIndex: 499,
    payloadDigest: evaluation.scalableEvaluationDigestV1(
      "durable-message-payload",
      transportEnvelope,
    ),
    transportEnvelope,
    transportEnvelopeDigest: evaluation.scalableEvaluationDigestV1(
      "team-message-transport-envelope",
      transportEnvelope,
    ),
    byteLength: new TextEncoder().encode(JSON.stringify(transportEnvelope))
      .byteLength,
  };
  const body = {
    schemaVersion: 1,
    teamId: descriptor.teamId,
    logicalTime: input.logicalTime,
    messages: [message],
    actions: [action],
  };
  return {
    ...body,
    outputDigest: evaluation.scalableEvaluationDigestV1(
      "team-step-output",
      body,
    ),
  };
}

function harness(value, crashStages = [], continuityFaults = {}) {
  const failures = new Set(crashStages);
  const crashed = new Set();
  const maybeCrash = (stage) => {
    if (failures.has(stage) && !crashed.has(stage)) {
      crashed.add(stage);
      throw new Error(`injected_crash:${stage}`);
    }
  };
  const declaration =
    evaluation.createScalableEvaluationRestartDurabilityDeclarationV1({
      providerId: "durable:test-provider",
      continuityId: "durable:test-continuity",
      maximumCheckpointBytes: 8 * 1024 * 1024,
    });
  const checkpoints = new Map();
  const store = {
    restartDurabilityV1: declaration,
    loadV1({ runId }) {
      return checkpoints.get(runId) ?? null;
    },
    compareAndSwapV1({ runId, expectedRevision, checkpoint }) {
      const current = checkpoints.get(runId);
      assert.equal(current?.revision ?? null, expectedRevision);
      if (checkpoint.phase === "recovery") maybeCrash("accounting");
      checkpoints.set(runId, structuredClone(checkpoint));
      if (checkpoint.phase === "perturbation" && checkpoint.phaseCursor > 0)
        maybeCrash("perturbation_checkpoint");
      if (checkpoint.phase === "advance") maybeCrash("checkpoint");
      const body = {
        schemaVersion: 1,
        runId,
        revision: checkpoint.revision,
        checkpointDigest: checkpoint.checkpointDigest,
        status: "stored",
        currentRevision:
          continuityFaults.casReceipt === "wrong-current-revision"
            ? checkpoint.revision + 1
            : checkpoint.revision,
      };
      return {
        ...body,
        receiptDigest: evaluation.scalableEvaluationDigestV1(
          "checkpoint-store-cas-receipt",
          body,
        ),
      };
    },
  };

  let baseBridge;
  const sessions = new Map();
  const episodes = new Map();
  const observations = new Map();
  const effects = new Map();
  const batches = new Map();
  const environmentCheckpoints = new Map();
  const environmentLatest = new Map();
  const effectOperations = new Set();
  const messageOperations = new Set();
  const observationOperations = new Set();

  const adapter = () => ({
    descriptor: value.baseAdapter.descriptor,
    createScenario: value.baseAdapter.createScenario.bind(value.baseAdapter),
    async openScenario(input) {
      baseBridge ??= await value.baseAdapter.openScenario(input);
      return new Proxy(baseBridge, {
        get(target, property) {
          const resumable = {
            restartDurabilityV1: declaration,
            async reconcileSessionV1(request) {
              if (!sessions.has(request.operationId))
                sessions.set(
                  request.operationId,
                  await target.createSession(request),
                );
              return sessions.get(request.operationId);
            },
            async reconcileEpisodeV1(request) {
              if (!episodes.has(request.operationId))
                episodes.set(
                  request.operationId,
                  await target.startEpisode(request),
                );
              return episodes.get(request.operationId);
            },
            async reconcileShardAssignmentsV1(request) {
              if (!environmentLatest.has(`assign:${request.operationId}`)) {
                await target.bindShardAssignments(request);
                environmentLatest.set(`assign:${request.operationId}`, true);
              }
            },
            async reconcileObservationV1({ operationId, pull }) {
              if (!observations.has(operationId)) {
                observations.set(
                  operationId,
                  await target.pullPartialObservation(pull),
                );
                observationOperations.add(operationId);
              }
              maybeCrash("observation");
              return observations.get(operationId);
            },
            async reconcileEffectV1({ operationId, request }) {
              if (!effects.has(operationId)) {
                effects.set(operationId, await target.requestEffect(request));
                effectOperations.add(operationId);
              }
              maybeCrash("action");
              return effects.get(operationId);
            },
            async reconcileCrossShardBatchV1({ operationId, batch }) {
              if (!batches.has(operationId)) {
                batches.set(
                  operationId,
                  await target.deliverCrossShardBatch(batch),
                );
                messageOperations.add(operationId);
              }
              maybeCrash("message");
              return batches.get(operationId);
            },
            reconcileCheckpointV1(request) {
              const cached = environmentCheckpoints.get(request.operationId);
              if (cached) {
                environmentLatest.set(request.session.sessionId, cached);
                return cached;
              }
              const prior = environmentLatest.get(request.session.sessionId);
              const revision = (prior?.revision ?? 0) + 1;
              assert.equal(request.expectedRevision, revision - 1);
              const snapshotDigest = evaluation.scalableEvaluationDigestV1(
                "durable-environment-snapshot",
                { operationId: request.operationId },
              );
              const anchorBody = {
                schemaVersion: 1,
                anchorId: `${request.session.sessionId}:anchor:${revision}`,
                revision,
                previousAnchorDigest:
                  continuityFaults.environment === "alternate-genesis" &&
                  revision === 1
                    ? evaluation.scalableEvaluationDigestV1(
                        "test-alternate-environment-genesis",
                        { sessionId: request.session.sessionId },
                      )
                    : continuityFaults.environment === "fork" && revision > 1
                      ? evaluation.scalableEvaluationDigestV1(
                          "test-forked-environment-parent",
                          { sessionId: request.session.sessionId, revision },
                        )
                      : (prior?.anchor.anchorDigest ?? null),
              };
              const anchor = {
                ...anchorBody,
                anchorDigest: simulation.shardedSimulationDigestV1(
                  "sharded-simulation-durable-anchor-v1",
                  anchorBody,
                ),
              };
              const body = {
                schemaVersion: 1,
                checkpointId: `${request.session.sessionId}:checkpoint:${revision}`,
                sessionId: request.session.sessionId,
                episodeId: request.episode.episodeId,
                revision,
                logicalTime: request.logicalTime,
                snapshotHandle: `durable:${request.operationId}`,
                snapshotDigest,
                anchor,
              };
              const checkpoint = {
                ...body,
                checkpointDigest: simulation.shardedSimulationDigestV1(
                  "sharded-simulation-checkpoint-v1",
                  body,
                ),
              };
              environmentCheckpoints.set(request.operationId, checkpoint);
              environmentLatest.set(request.session.sessionId, checkpoint);
              return checkpoint;
            },
            reconcileRestoreV1({ request }) {
              environmentLatest.set(
                request.checkpoint.sessionId,
                request.checkpoint,
              );
              const body = {
                schemaVersion: 1,
                checkpointId: request.checkpoint.checkpointId,
                restoredRevision: request.checkpoint.revision,
                restoredLogicalTime: request.checkpoint.logicalTime,
              };
              return {
                ...body,
                receiptDigest: simulation.shardedSimulationDigestV1(
                  "sharded-simulation-restore-receipt-v1",
                  body,
                ),
              };
            },
          };
          if (property in resumable) return resumable[property];
          const member = Reflect.get(target, property, target);
          return typeof member === "function" ? member.bind(target) : member;
        },
      });
    },
  });

  const teamBackends = new Map(
    value.teams.map((descriptor) => [
      descriptor.teamId,
      {
        descriptor,
        steps: new Map(),
        ingresses: new Map(),
        settlements: new Map(),
        checkpoints: new Map(),
        latest: null,
      },
    ]),
  );
  const teamStepOperations = new Set();
  const ingressOperations = new Set();
  const settlementOperations = new Set();
  const ports = () =>
    value.teams.map((descriptor) => {
      const backend = teamBackends.get(descriptor.teamId);
      return {
        descriptor,
        restartDurabilityV1: declaration,
        stepV1() {
          throw new Error("durable runner must use reconcileStepV1");
        },
        reconcileStepV1({ operationId, step }) {
          if (!backend.steps.has(operationId)) {
            backend.steps.set(operationId, output(value, descriptor, step));
            teamStepOperations.add(operationId);
          }
          maybeCrash("team_step");
          return backend.steps.get(operationId);
        },
        reconcileAcknowledgedMessageV1({ operationId, delivery }) {
          if (!backend.ingresses.has(operationId)) {
            ingressOperations.add(operationId);
            const body = {
              schemaVersion: 1,
              evaluationDefinitionDigest: delivery.evaluationDefinitionDigest,
              teamId: delivery.teamId,
              sessionId: delivery.sessionId,
              episodeId: delivery.episodeId,
              logicalTime: delivery.logicalTime,
              eventId: delivery.eventId,
              messageId: delivery.message.messageId,
              transportEnvelopeDigest: delivery.message.transportEnvelopeDigest,
              batchDigest: delivery.batch.batchDigest,
              bridgeAckDigest: delivery.bridgeAck.ackDigest,
              status: "admitted",
            };
            backend.ingresses.set(operationId, {
              ...body,
              receiptDigest: evaluation.scalableEvaluationDigestV1(
                "team-message-ingress-receipt",
                body,
              ),
            });
          }
          maybeCrash("message_ingress");
          return backend.ingresses.get(operationId);
        },
        reconcileActionSettlementV1({ operationId, settlement }) {
          if (!backend.settlements.has(operationId)) {
            settlementOperations.add(operationId);
            const body = {
              schemaVersion: 1,
              evaluationDefinitionDigest: settlement.evaluationDefinitionDigest,
              teamId: settlement.teamId,
              sessionId: settlement.sessionId,
              episodeId: settlement.episodeId,
              peerIndex: settlement.peerIndex,
              logicalTime: settlement.logicalTime,
              actionIndex: settlement.actionIndex,
              outputDigest: settlement.outputDigest,
              actionDigest: settlement.request.actionDigest,
              effectReceiptDigest: settlement.effectReceipt.receiptDigest,
              status: "settled",
            };
            backend.settlements.set(operationId, {
              ...body,
              receiptDigest: evaluation.scalableEvaluationDigestV1(
                "team-action-settlement-receipt",
                body,
              ),
            });
          }
          maybeCrash("action_settlement");
          return backend.settlements.get(operationId);
        },
        checkpointV1(request) {
          const cached = backend.checkpoints.get(request.operationId);
          if (cached) {
            backend.latest = cached;
            return cached;
          }
          const revision = (backend.latest?.revision ?? 0) + 1;
          assert.equal(request.expectedRevision, revision - 1);
          const body = {
            schemaVersion: 1,
            operationId: request.operationId,
            teamId: descriptor.teamId,
            definitionDigest: request.definitionDigest,
            descriptorDigest: descriptor.descriptorDigest,
            revision,
            logicalTime: request.logicalTime,
            previousCheckpointDigest:
              continuityFaults.team === "alternate-genesis" && revision === 1
                ? evaluation.scalableEvaluationDigestV1(
                    "test-alternate-team-genesis",
                    { teamId: descriptor.teamId },
                  )
                : continuityFaults.team === "fork" && revision > 1
                  ? evaluation.scalableEvaluationDigestV1(
                      "test-forked-team-parent",
                      { teamId: descriptor.teamId, revision },
                    )
                  : (backend.latest?.checkpointDigest ?? null),
            snapshotHandle: `${descriptor.teamId}:snapshot:${revision}`,
            snapshotDigest: evaluation.scalableEvaluationDigestV1(
              "team-snapshot",
              { operationId: request.operationId },
            ),
          };
          const checkpoint = {
            ...body,
            checkpointDigest: evaluation.scalableEvaluationDigestV1(
              "team-durable-checkpoint",
              body,
            ),
          };
          backend.checkpoints.set(request.operationId, checkpoint);
          backend.latest = checkpoint;
          return checkpoint;
        },
        restoreV1(request) {
          backend.latest = request.checkpoint;
          const body = {
            schemaVersion: 1,
            operationId: request.operationId,
            teamId: descriptor.teamId,
            checkpointDigest: request.checkpoint.checkpointDigest,
            restoredRevision: request.checkpoint.revision,
          };
          return {
            ...body,
            receiptDigest: evaluation.scalableEvaluationDigestV1(
              "team-restore-receipt",
              body,
            ),
          };
        },
      };
    });
  const authorityOperations = new Set();
  const actionAuthority = {
    restartDurabilityV1: declaration,
    issueV1() {
      throw new Error("durable runner must use reconcileV1");
    },
    reconcileV1(input) {
      authorityOperations.add(input.operationId);
      return {
        executionEpoch: 1,
        fenceToken: `fence:${input.teamId}:${input.logicalTime}`,
      };
    },
  };
  let recovery;
  if (value.definition.perturbations.length > 0) {
    const providerId = "durable:evidence-provider";
    const keyId = "durable:evidence-key";
    const authorization =
      evaluation.createScalableEvaluationEvidenceProviderAuthorizationV1({
        authorizationId: "durable:evidence-authorization",
        providerId,
        keyId,
        status: "active",
        evidenceKinds: ["perturbation_injection", "recovery_measurement"],
        evaluationDefinitionDigest: value.definition.definitionDigest,
        scenarioManifestDigest: value.definition.scenarioManifestDigest,
        adapterDescriptorDigest: value.definition.adapterDescriptorDigest,
        teamIds: value.teams.map((team) => team.teamId),
      });
    const signer = {
      async sign(input) {
        const signature = await crypto.subtle.sign(
          "Ed25519",
          evidenceKeys.privateKey,
          new TextEncoder().encode(input.evidenceDigest),
        );
        return Buffer.from(signature).toString("base64url");
      },
    };
    const evidenceVerifier =
      new evaluation.WebCryptoScalableEvaluationEvidenceVerifierV1({
        authorizations: {
          async resolve(input) {
            return input.authorizationDigest ===
              authorization.authorizationDigest
              ? authorization
              : null;
          },
        },
        keys: {
          async resolve(input) {
            return input.providerId === providerId && input.keyId === keyId
              ? evidenceKeys.publicKey
              : null;
          },
        },
      });
    const injections = new Map();
    const measurements = new Map();
    const perturbationOperations = new Set();
    const recoveryOperations = new Set();
    recovery = {
      evidenceVerifier,
      recoveryBaselines: value.teams.map((team) => ({
        schemaVersion: 1,
        baselineId: `durable:baseline:${team.teamId}`,
        teamId: team.teamId,
        domain: "cyber",
        metrics: [
          {
            metricId: "availability",
            valueBasisPoints: 10_000,
            toleranceBasisPoints: 0,
          },
        ],
      })),
      perturbationPort: {
        restartDurabilityV1: declaration,
        injectV1() {
          throw new Error("durable runner must reconcile perturbations");
        },
        async reconcileInjectionV1(input) {
          if (!injections.has(input.operationId)) {
            injections.set(
              input.operationId,
              await evaluation.issueScalableEvaluationPerturbationInjectionReceiptV1(
                {
                  evaluationDefinitionDigest: value.definition.definitionDigest,
                  scenarioManifestDigest:
                    value.definition.scenarioManifestDigest,
                  adapterDescriptorDigest:
                    value.definition.adapterDescriptorDigest,
                  perturbationId: input.perturbation.perturbationId,
                  teamId: input.teamId,
                  perturbationConfigurationDigest:
                    input.perturbation.configurationDigest,
                  sessionId: input.sessionId,
                  episodeId: input.episodeId,
                  scheduledAtLogicalTime:
                    input.perturbation.scheduledAtLogicalTime,
                  injectedAtLogicalTime: input.logicalTime,
                  sourceEvidenceDigest: evaluation.scalableEvaluationDigestV1(
                    "durable-perturbation-source",
                    { operationId: input.operationId },
                  ),
                  providerId,
                  keyId,
                  authorizationDigest: authorization.authorizationDigest,
                  signer,
                },
              ),
            );
            perturbationOperations.add(input.operationId);
          }
          maybeCrash("perturbation");
          return injections.get(input.operationId);
        },
      },
      recoveryMetrics: {
        restartDurabilityV1: declaration,
        sampleV1() {
          throw new Error("durable runner must reconcile recovery samples");
        },
        async reconcileSampleV1(input) {
          if (!measurements.has(input.operationId)) {
            measurements.set(
              input.operationId,
              await evaluation.issueScalableEvaluationRecoveryMeasurementReceiptV1(
                {
                  sampleId: input.sampleId,
                  evaluationDefinitionDigest: value.definition.definitionDigest,
                  scenarioManifestDigest:
                    value.definition.scenarioManifestDigest,
                  adapterDescriptorDigest:
                    value.definition.adapterDescriptorDigest,
                  perturbationId: input.perturbation.perturbationId,
                  perturbationConfigurationDigest:
                    input.perturbation.configurationDigest,
                  teamId: input.teamId,
                  domain: input.domain,
                  sessionId: input.sessionId,
                  episodeId: input.episodeId,
                  scheduledAtLogicalTime:
                    input.perturbation.scheduledAtLogicalTime,
                  logicalTime: input.logicalTime,
                  metrics: [
                    { metricId: "availability", valueBasisPoints: 10_000 },
                  ],
                  sourceEvidenceDigest: evaluation.scalableEvaluationDigestV1(
                    "durable-recovery-source",
                    { operationId: input.operationId },
                  ),
                  providerId,
                  keyId,
                  authorizationDigest: authorization.authorizationDigest,
                  signer,
                },
              ),
            );
            recoveryOperations.add(input.operationId);
          }
          return measurements.get(input.operationId);
        },
      },
      perturbationOperations,
      recoveryOperations,
    };
  }
  return {
    store,
    adapter,
    ports,
    actionAuthority,
    recovery,
    counts: {
      effectOperations,
      messageOperations,
      observationOperations,
      teamStepOperations,
      ingressOperations,
      settlementOperations,
      authorityOperations,
    },
  };
}

async function execute(value, state) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    try {
      return await evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: state.adapter(),
        ports: state.ports(),
        shardCount: 2,
        steps: value.steps ?? [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        durableStore: state.store,
        runId: "durable:run",
        actionAuthority: state.actionAuthority,
        ...(state.recovery
          ? {
              recoveryBaselines: state.recovery.recoveryBaselines,
              perturbationPort: state.recovery.perturbationPort,
              recoveryMetrics: state.recovery.recoveryMetrics,
              evidenceVerifier: state.recovery.evidenceVerifier,
            }
          : {}),
      });
    } catch (error) {
      if (!String(error).includes("injected_crash")) throw error;
    }
  }
  throw new Error("durable runner did not converge");
}

test("durable runner reconstructs every operational boundary without duplicate effects", async () => {
  const uninterruptedFixture = fixture();
  const uninterruptedState = harness(uninterruptedFixture);
  const uninterrupted = await execute(uninterruptedFixture, uninterruptedState);

  const resumedFixture = fixture();
  const resumedState = harness(resumedFixture, [
    "observation",
    "team_step",
    "action",
    "action_settlement",
    "message",
    "message_ingress",
    "accounting",
    "checkpoint",
  ]);
  const resumed = await execute(resumedFixture, resumedState);

  assert.equal(resumed.status, "completed");
  assert.equal(resumed.processedSteps, 1);
  assert.deepEqual(resumed, uninterrupted);
  for (const operations of Object.values(resumedState.counts))
    assert.equal(operations.size, 2);
  assert.equal(
    resumedState.store.loadV1({ runId: "durable:run" }).phase,
    "complete",
  );
});

test("durable perturbation and recovery receipts reconcile after process failure", async () => {
  const value = fixture({ perturbations: true });
  const state = harness(value, ["perturbation", "perturbation_checkpoint"]);
  const result = await execute(value, state);
  assert.equal(result.status, "completed");
  assert.equal(state.recovery.perturbationOperations.size, 2);
  assert.equal(state.recovery.recoveryOperations.size, 2);
  assert.deepEqual(
    result.snapshot.teamSummaries.map((team) => team.recoveredEpisodeCount),
    [1, 1],
  );
});

test("post-accounting perturbation checkpoint restores when logical time advances beyond the record head", async () => {
  const base = fixture({ perturbations: true, perturbationLogicalTime: 2 });
  const value = {
    ...base,
    steps: [
      { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
      { schemaVersion: 1, peerIndex: 1, domain: "cyber", cursor: null },
    ],
  };
  const state = harness(value, ["perturbation_checkpoint"]);
  const result = await execute(value, state);
  assert.equal(result.status, "completed");
  assert.equal(result.processedSteps, 2);
  assert.equal(state.recovery.perturbationOperations.size, 2);
  assert.equal(state.recovery.recoveryOperations.size, 2);
  assert.deepEqual(
    result.snapshot.teamSummaries.map((team) => ({
      sequence: team.lastSequence,
      logicalTime: team.lastLogicalTime,
    })),
    [
      { sequence: 4, logicalTime: 2 },
      { sequence: 4, logicalTime: 2 },
    ],
  );
});

test("durable runner snapshots baselines and construction-time ports before asynchronous open", async () => {
  const value = fixture({ perturbations: true });
  const state = harness(value, ["observation"]);
  const initialBaselines = structuredClone(state.recovery.recoveryBaselines);
  const originalStore = state.store;
  const originalPerturbationPort = state.recovery.perturbationPort;
  const originalRecoveryMetrics = state.recovery.recoveryMetrics;
  const originalEvidenceVerifier = state.recovery.evidenceVerifier;
  const originalActionAuthority = state.actionAuthority;
  const firstAdapter = state.adapter();
  const originalOpen = firstAdapter.openScenario.bind(firstAdapter);
  let runnerInput;
  firstAdapter.openScenario = async (request) => {
    const opened = await originalOpen(request);
    state.recovery.recoveryBaselines[0].metrics[0].valueBasisPoints = 0;
    state.recovery.recoveryBaselines.pop();
    runnerInput.adapter = value.baseAdapter;
    runnerInput.ports = [];
    runnerInput.durableStore = {
      loadV1() {
        throw new Error("substituted_store_used");
      },
      compareAndSwapV1() {
        throw new Error("substituted_store_used");
      },
    };
    runnerInput.perturbationPort = undefined;
    runnerInput.recoveryMetrics = undefined;
    runnerInput.evidenceVerifier = undefined;
    runnerInput.actionAuthority = undefined;
    return opened;
  };
  runnerInput = {
    definition: value.definition,
    adapter: firstAdapter,
    ports: state.ports(),
    shardCount: 2,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    durableStore: originalStore,
    runId: "durable:run",
    actionAuthority: originalActionAuthority,
    recoveryBaselines: state.recovery.recoveryBaselines,
    perturbationPort: originalPerturbationPort,
    recoveryMetrics: originalRecoveryMetrics,
    evidenceVerifier: originalEvidenceVerifier,
  };
  await assert.rejects(
    () => evaluation.runScalableEvaluationV1(runnerInput),
    /injected_crash:observation/u,
  );
  const persisted = originalStore.loadV1({ runId: "durable:run" });
  assert.deepEqual(
    persisted.runtimeState.baselines.map((baseline) => baseline.metrics),
    initialBaselines.map((baseline) => baseline.metrics),
  );
  const resumed = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter: state.adapter(),
    ports: state.ports(),
    shardCount: 2,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    durableStore: originalStore,
    runId: "durable:run",
    actionAuthority: originalActionAuthority,
    recoveryBaselines: initialBaselines,
    perturbationPort: originalPerturbationPort,
    recoveryMetrics: originalRecoveryMetrics,
    evidenceVerifier: originalEvidenceVerifier,
  });
  assert.equal(resumed.status, "completed");
  assert.deepEqual(
    resumed.snapshot.recoverySummaries.map((summary) => summary.teamId),
    value.teams.map((team) => team.teamId).sort(),
  );
});

test("durable runner fails closed for missing continuity and configuration substitution", async () => {
  const value = fixture();
  const state = harness(value);
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.baseAdapter,
        ports: state.ports(),
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        durableStore: state.store,
        runId: "durable:run",
        actionAuthority: state.actionAuthority,
      }),
    /environment_bridge_not_resumable/u,
  );
  await execute(value, state);
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: state.adapter(),
        ports: state.ports(),
        shardCount: 1,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        durableStore: state.store,
        runId: "durable:run",
        actionAuthority: state.actionAuthority,
      }),
    /checkpoint_configuration_mismatch/u,
  );
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: { ...value.definition, evaluationId: "substituted" },
        adapter: state.adapter(),
        ports: state.ports(),
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        durableStore: state.store,
        runId: "durable:run",
        actionAuthority: state.actionAuthority,
      }),
    /definition_invalid/u,
  );
  const substitutedAdapter =
    environment.createReferenceMultiDomainEnvironmentAdapterV1({
      domain: "cyber",
      adapterId: "durable:substituted-adapter",
    });
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: substitutedAdapter,
        ports: state.ports(),
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        durableStore: state.store,
        runId: "durable:run",
        actionAuthority: state.actionAuthority,
      }),
    /definition_invalid/u,
  );
  const substitutedPorts = state.ports();
  substitutedPorts[0] = { ...substitutedPorts[0], descriptor: value.teams[1] };
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: state.adapter(),
        ports: substitutedPorts,
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        durableStore: state.store,
        runId: "durable:run",
        actionAuthority: state.actionAuthority,
      }),
    /team_port_duplicate/u,
  );
});

test("durable runner rejects alternate child genesis and forked checkpoint parents", async () => {
  for (const [boundary, fault] of [
    ["environment", "alternate-genesis"],
    ["environment", "fork"],
    ["team", "alternate-genesis"],
    ["team", "fork"],
  ]) {
    const value = fixture();
    const state = harness(value, [], { [boundary]: fault });
    await assert.rejects(
      () => execute(value, state),
      boundary === "environment"
        ? /environment_checkpoint_binding_invalid/u
        : /team_checkpoint_(?:invalid|binding_invalid)/u,
    );
  }
});

test("runner checkpoint validation rejects fully rehashed environment substitution", async () => {
  const value = fixture();
  const state = harness(value);
  await execute(value, state);
  const checkpoint = structuredClone(
    state.store.loadV1({ runId: "durable:run" }),
  );
  const target = checkpoint.teamEnvironments[0];
  target.session.sessionId = "durable:substituted-session";
  const sessionBody = { ...target.session };
  delete sessionBody.sessionDigest;
  target.session.sessionDigest = simulation.shardedSimulationDigestV1(
    "sharded-simulation-session-v1",
    sessionBody,
  );
  target.episode.sessionId = target.session.sessionId;
  const episodeBody = { ...target.episode };
  delete episodeBody.episodeDigest;
  target.episode.episodeDigest = simulation.shardedSimulationDigestV1(
    "sharded-simulation-episode-v1",
    episodeBody,
  );
  target.environmentCheckpoint.sessionId = target.session.sessionId;
  const environmentBody = { ...target.environmentCheckpoint };
  delete environmentBody.checkpointDigest;
  target.environmentCheckpoint.checkpointDigest =
    simulation.shardedSimulationDigestV1(
      "sharded-simulation-checkpoint-v1",
      environmentBody,
    );
  const checkpointBody = { ...checkpoint };
  delete checkpointBody.checkpointDigest;
  checkpoint.checkpointDigest = evaluation.scalableEvaluationDigestV1(
    "runner-durable-checkpoint",
    checkpointBody,
  );
  assert.throws(
    () => evaluation.validateScalableEvaluationRunnerCheckpointV1(checkpoint),
    /team_environment_binding_invalid/u,
  );
});

test("runner checkpoint binds active recoveries to unresolved runtime recovery state", async () => {
  const value = fixture({ perturbations: true });
  const state = harness(value);
  await execute(value, state);
  const checkpoint = structuredClone(
    state.store.loadV1({ runId: "durable:run" }),
  );
  checkpoint.activeRecoveries = [
    `durable:perturbation\u0000${value.teams[0].teamId}`,
  ];
  const body = { ...checkpoint };
  delete body.checkpointDigest;
  checkpoint.checkpointDigest = evaluation.scalableEvaluationDigestV1(
    "runner-durable-checkpoint",
    body,
  );
  assert.throws(
    () => evaluation.validateScalableEvaluationRunnerCheckpointV1(checkpoint),
    /active_recoveries_invalid/u,
  );
});

test("checkpoint CAS receipts require an exact current revision on success", async () => {
  const value = fixture();
  const state = harness(value);
  await execute(value, state);
  const checkpoint = state.store.loadV1({ runId: "durable:run" });
  for (const status of ["stored", "duplicate"]) {
    const body = {
      schemaVersion: 1,
      runId: checkpoint.runId,
      revision: checkpoint.revision,
      checkpointDigest: checkpoint.checkpointDigest,
      status,
      currentRevision: checkpoint.revision + 1,
    };
    const receipt = {
      ...body,
      receiptDigest: evaluation.scalableEvaluationDigestV1(
        "checkpoint-store-cas-receipt",
        body,
      ),
    };
    assert.throws(
      () =>
        evaluation.validateScalableEvaluationCheckpointStoreCasReceiptV1(
          receipt,
          checkpoint,
        ),
      /checkpoint_store_receipt_invalid/u,
    );
  }
  const conflictBody = {
    schemaVersion: 1,
    runId: checkpoint.runId,
    revision: checkpoint.revision,
    checkpointDigest: checkpoint.checkpointDigest,
    status: "conflict",
    currentRevision: checkpoint.revision + 1,
  };
  assert.equal(
    evaluation.validateScalableEvaluationCheckpointStoreCasReceiptV1(
      {
        ...conflictBody,
        receiptDigest: evaluation.scalableEvaluationDigestV1(
          "checkpoint-store-cas-receipt",
          conflictBody,
        ),
      },
      checkpoint,
    ).status,
    "conflict",
  );

  const incoherentFixture = fixture();
  const incoherentState = harness(incoherentFixture, [], {
    casReceipt: "wrong-current-revision",
  });
  await assert.rejects(
    () => execute(incoherentFixture, incoherentState),
    /checkpoint_store_receipt_invalid/u,
  );
});
