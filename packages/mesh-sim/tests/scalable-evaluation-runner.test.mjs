import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

const evaluation = await import("../dist/scalable-evaluation.js");
const simulation = await import("../dist/sharded-simulation.js");
const environment = await import("../dist/multi-domain-environment.js");
const evidenceCrypto = globalThis.crypto ?? webcrypto;
const evidenceKeys = await evidenceCrypto.subtle.generateKey("Ed25519", false, [
  "sign",
  "verify",
]);

function output({
  teamId,
  logicalTime,
  peerIndex,
  descriptor,
  messageId,
  payload,
  publicMetadata,
}) {
  const actionSchema = descriptor.actionSchemas[0];
  const action = {
    schemaVersion: 1,
    domain: actionSchema.domain,
    entityId: `entity:${peerIndex}`,
    capability: actionSchema.capability,
    schemaDigest: actionSchema.schemaDigest,
    payload: payload ?? { requested: true },
  };
  const transportEnvelope = {
    schemaVersion: 1,
    kind: "test_team_message",
    teamId,
    logicalTime,
  };
  const messages = [
    {
      schemaVersion: 1,
      messageId,
      sourcePeerIndex: peerIndex,
      targetPeerIndex: 499,
      payloadDigest: evaluation.scalableEvaluationDigestV1("test-message", {
        teamId,
        logicalTime,
      }),
      transportEnvelope,
      transportEnvelopeDigest: evaluation.scalableEvaluationDigestV1(
        "team-message-transport-envelope",
        transportEnvelope,
      ),
      byteLength: new TextEncoder().encode(JSON.stringify(transportEnvelope))
        .byteLength,
    },
  ];
  const body = {
    schemaVersion: 1,
    teamId,
    logicalTime,
    messages,
    actions: [action],
    ...(publicMetadata === undefined ? {} : { publicMetadata }),
  };
  return {
    ...body,
    outputDigest: evaluation.scalableEvaluationDigestV1(
      "team-step-output",
      body,
    ),
  };
}

function fixture(options = {}) {
  const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "cyber",
    adapterId: "runner:cyber",
  });
  const profile = evaluation.createScalableEvaluationProfileV1({
    profileId: options.profileId ?? "standard-500",
    maximumInteractions: options.maximumInteractions ?? 8,
    maximumMessages: options.maximumMessages ?? 8,
    maximumMessageBytes: 1_024,
    maximumRetainedRecords: 8,
  });
  const referenceScenario =
    environment.createReferenceMultiDomainScenarioDefinitionV1({
      adapter,
      scenarioId: `runner:${profile.profileId}`,
      scaleProfileId: profile.shardedProfileId,
      seed: 44,
    });
  const scenario =
    options.maximumActionBytes === undefined
      ? referenceScenario
      : {
          ...referenceScenario,
          resourceBudget: {
            ...referenceScenario.resourceBudget,
            maximumActionBytes: options.maximumActionBytes,
          },
        };
  const teams = ["distributed", "centralized"].map((architecture) =>
    evaluation.createScalableEvaluationTeamDescriptorV1({
      teamId: `team:${architecture}`,
      architecture,
      implementationId: `${architecture}:impl`,
      implementationVersion: "1",
      implementationDigest: evaluation.scalableEvaluationDigestV1("test-impl", {
        architecture,
      }),
    }),
  );
  const partialObservability =
    evaluation.createScalableEvaluationPartialObservabilityV1({
      scope: "peer_local",
      maximumObservationsPerPull: 4,
      allowCrossDomainAggregation: false,
      sourceVisibilityPolicyDigest: scenario.visibilityPolicyDigest,
    });
  const perturbations =
    options.perturbations === false
      ? []
      : [
          evaluation.createScalableEvaluationPerturbationV1({
            perturbationId: "perturbation:one",
            kind: "benign",
            domain: "cyber",
            scheduledAtLogicalTime: 1,
            targetTeamIds: teams.map((team) => team.teamId),
            targetAgentCount: 1,
            targetSelectorDigest: evaluation.scalableEvaluationDigestV1(
              "selector",
              { one: true },
            ),
          }),
        ];
  const definition = evaluation.createScalableEvaluationDefinitionV1({
    evaluationId: `evaluation:${profile.profileId}`,
    profile,
    descriptor: adapter.descriptor,
    scenario,
    partialObservability,
    teams,
    perturbations,
  });
  return { adapter, profile, teams, definition };
}

function ports(fixture, calls, ingressEvents = []) {
  return fixture.teams.map((descriptor, index) => ({
    descriptor,
    stepV1(input) {
      calls.push({ teamId: descriptor.teamId, peerIndex: input.peerIndex });
      return output({
        teamId: descriptor.teamId,
        logicalTime: input.logicalTime,
        peerIndex: input.peerIndex,
        descriptor: fixture.adapter.descriptor,
        messageId: `message:${index}:${input.logicalTime}`,
      });
    },
    ingestAcknowledgedMessageV1(input) {
      ingressEvents.push({ kind: "port-ingress", eventId: input.eventId });
      const body = {
        schemaVersion: 1,
        evaluationDefinitionDigest: input.evaluationDefinitionDigest,
        teamId: input.teamId,
        sessionId: input.sessionId,
        episodeId: input.episodeId,
        logicalTime: input.logicalTime,
        eventId: input.eventId,
        messageId: input.message.messageId,
        transportEnvelopeDigest: input.message.transportEnvelopeDigest,
        batchDigest: input.batch.batchDigest,
        bridgeAckDigest: input.bridgeAck.ackDigest,
        status: "admitted",
      };
      return {
        ...body,
        receiptDigest: evaluation.scalableEvaluationDigestV1(
          "team-message-ingress-receipt",
          body,
        ),
      };
    },
    settleActionV1(input) {
      const body = {
        schemaVersion: 1,
        evaluationDefinitionDigest: input.evaluationDefinitionDigest,
        teamId: input.teamId,
        sessionId: input.sessionId,
        episodeId: input.episodeId,
        peerIndex: input.peerIndex,
        logicalTime: input.logicalTime,
        actionIndex: input.actionIndex,
        outputDigest: input.outputDigest,
        actionDigest: input.request.actionDigest,
        effectReceiptDigest: input.effectReceipt.receiptDigest,
        status: "settled",
      };
      return {
        ...body,
        receiptDigest: evaluation.scalableEvaluationDigestV1(
          "team-action-settlement-receipt",
          body,
        ),
      };
    },
  }));
}

function actionAuthority() {
  return {
    issueV1(input) {
      return {
        executionEpoch: 1,
        fenceToken: `fence:${input.sessionId}:${input.episodeId}:${input.peerIndex}:1`,
      };
    },
  };
}

function controls(
  value,
  injectionCalls = [],
  sampleV1 = () => [{ metricId: "availability", valueBasisPoints: 10_000 }],
) {
  const providerId = "provider:test-evidence";
  const keyId = "key:test-ed25519";
  const authorization =
    evaluation.createScalableEvaluationEvidenceProviderAuthorizationV1({
      authorizationId: "authorization:test-evidence",
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
      assert.equal(input.providerId, providerId);
      assert.equal(input.keyId, keyId);
      const signature = await evidenceCrypto.subtle.sign(
        "Ed25519",
        evidenceKeys.privateKey,
        new TextEncoder().encode(input.evidenceDigest),
      );
      return Buffer.from(signature).toString("base64url");
    },
  };
  const authorizations = {
    async resolve(input) {
      return input.providerId === providerId &&
        input.keyId === keyId &&
        input.authorizationDigest === authorization.authorizationDigest
        ? authorization
        : null;
    },
  };
  const keys = {
    async resolve(input) {
      return input.providerId === providerId && input.keyId === keyId
        ? evidenceKeys.publicKey
        : null;
    },
  };
  const verifierOptions = { authorizations, keys };
  const evidenceVerifier =
    new evaluation.WebCryptoScalableEvaluationEvidenceVerifierV1(
      verifierOptions,
    );
  return {
    perturbationPort: {
      async injectV1(input) {
        injectionCalls.push(input);
        return evaluation.issueScalableEvaluationPerturbationInjectionReceiptV1(
          {
            evaluationDefinitionDigest: value.definition.definitionDigest,
            scenarioManifestDigest: value.definition.scenarioManifestDigest,
            adapterDescriptorDigest: value.definition.adapterDescriptorDigest,
            perturbationId: input.perturbation.perturbationId,
            teamId: input.teamId,
            perturbationConfigurationDigest:
              input.perturbation.configurationDigest,
            sessionId: input.sessionId,
            episodeId: input.episodeId,
            scheduledAtLogicalTime: input.perturbation.scheduledAtLogicalTime,
            injectedAtLogicalTime: input.logicalTime,
            sourceEvidenceDigest: evaluation.scalableEvaluationDigestV1(
              "test-perturbation-provider-evidence",
              { perturbationId: input.perturbation.perturbationId },
            ),
            providerId,
            keyId,
            authorizationDigest: authorization.authorizationDigest,
            signer,
          },
        );
      },
    },
    recoveryMetrics: {
      async sampleV1(input) {
        const metrics = await sampleV1(input);
        return evaluation.issueScalableEvaluationRecoveryMeasurementReceiptV1({
          sampleId: input.sampleId,
          evaluationDefinitionDigest: value.definition.definitionDigest,
          scenarioManifestDigest: value.definition.scenarioManifestDigest,
          adapterDescriptorDigest: value.definition.adapterDescriptorDigest,
          perturbationId: input.perturbation.perturbationId,
          perturbationConfigurationDigest:
            input.perturbation.configurationDigest,
          teamId: input.teamId,
          domain: input.domain,
          sessionId: input.sessionId,
          episodeId: input.episodeId,
          scheduledAtLogicalTime: input.perturbation.scheduledAtLogicalTime,
          logicalTime: input.logicalTime,
          metrics,
          sourceEvidenceDigest: evaluation.scalableEvaluationDigestV1(
            "test-recovery-provider-evidence",
            { sampleId: input.sampleId },
          ),
          providerId,
          keyId,
          authorizationDigest: authorization.authorizationDigest,
          signer,
        });
      },
    },
    evidenceVerifier,
    actionAuthority: actionAuthority(),
    testEvidenceDependencies: { authorizations, keys, verifierOptions },
  };
}

function wrapAdapter(adapter, overrides) {
  return {
    descriptor: adapter.descriptor,
    createScenario: adapter.createScenario.bind(adapter),
    async openScenario(input) {
      const bridge = await adapter.openScenario(input);
      return new Proxy(bridge, {
        get(target, property) {
          if (property in overrides) return overrides[property](target);
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
}

test("runner opens and binds a sparse environment, invokes both teams, and dispatches observations/messages/actions", async () => {
  const value = fixture();
  const calls = [];
  const injectionCalls = [];
  const result = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter: value.adapter,
    ports: ports(value, calls),
    shardCount: 2,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    recoveryBaselines: value.teams.map((team) => ({
      schemaVersion: 1,
      baselineId: `baseline:${team.teamId}`,
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
    ...controls(value, injectionCalls),
  });
  assert.equal(result.status, "completed");
  assert.equal(result.processedSteps, 1);
  assert.deepEqual(
    calls.map((entry) => entry.teamId).sort(),
    value.teams.map((team) => team.teamId).sort(),
  );
  assert.deepEqual(
    result.snapshot.teamSummaries.map((team) => team.counters.actions),
    [1, 1],
  );
  assert.deepEqual(
    result.snapshot.teamSummaries.map((team) => team.counters.messages),
    [1, 1],
  );
  assert.deepEqual(
    result.snapshot.teamSummaries.map((team) => team.recoveredEpisodeCount),
    [1, 1],
  );
  assert.equal(injectionCalls.length, 2);
  assert.equal(result.teamEnvironments.length, 2);
  assert.notEqual(
    result.teamEnvironments[0].sessionDigest,
    result.teamEnvironments[1].sessionDigest,
  );
  assert.equal(result.comparison.leftMinusRight.actions, 0);
});

test("runner uses module-owned evaluation runtime invokers after prototype substitution", async () => {
  const value = fixture();
  const prototype = evaluation.InMemoryScalableEvaluationRuntimeV1.prototype;
  const methodNames = [
    "bindTeamEnvironmentV1",
    "recordAccountingV1",
    "recordPartialObservationV1",
    "registerRecoveryBaselineV1",
    "recordPerturbationObservationV1",
    "recordRecoverySampleV1",
    "snapshotV1",
    "compareV1",
  ];
  const priorMethods = new Map(
    methodNames.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(prototype, name),
    ]),
  );
  const priorDefinition = Object.getOwnPropertyDescriptor(
    prototype,
    "definition",
  );
  let substitutedCalls = 0;
  for (const name of methodNames)
    Object.defineProperty(prototype, name, {
      configurable: true,
      writable: true,
      value() {
        substitutedCalls += 1;
        throw new Error(`substituted evaluation runtime ${name} must not run`);
      },
    });
  Object.defineProperty(prototype, "definition", {
    configurable: true,
    get() {
      substitutedCalls += 1;
      throw new Error("substituted evaluation definition must not run");
    },
  });
  try {
    const result = await evaluation.runScalableEvaluationV1({
      definition: value.definition,
      adapter: value.adapter,
      ports: ports(value, []),
      shardCount: 2,
      steps: [
        { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
      ],
      recoveryBaselines: value.teams.map((team) => ({
        schemaVersion: 1,
        baselineId: `baseline:${team.teamId}`,
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
      ...controls(value),
    });
    assert.equal(result.status, "completed");
    assert.equal(substitutedCalls, 0);
  } finally {
    for (const [name, descriptor] of priorMethods)
      Object.defineProperty(prototype, name, descriptor);
    Object.defineProperty(prototype, "definition", priorDefinition);
  }
});

test("runner enforces the scenario action-byte budget before the environment boundary", async () => {
  const value = fixture({
    perturbations: false,
    maximumActionBytes: 256,
  });
  const oversizedPorts = ports(value, []).map((port, index) => ({
    ...port,
    stepV1(input) {
      return output({
        teamId: port.descriptor.teamId,
        logicalTime: input.logicalTime,
        peerIndex: input.peerIndex,
        descriptor: value.adapter.descriptor,
        messageId: `message:oversized:${index}:${input.logicalTime}`,
        payload: { data: "x".repeat(512) },
      });
    },
  }));
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.adapter,
        ports: oversizedPorts,
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        actionAuthority: actionAuthority(),
      }),
    /runner_action_scenario_bytes_exceeded/u,
  );
});

test("runner rejects an observation delivery substituted across team sessions", async () => {
  const value = fixture({ perturbations: false });
  let firstDelivery;
  const adapter = wrapAdapter(value.adapter, {
    pullPartialObservation: (bridge) => async (pull) => {
      if (!firstDelivery)
        firstDelivery = await bridge.pullPartialObservation(pull);
      return firstDelivery;
    },
  });
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter,
        ports: ports(value, []),
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        actionAuthority: actionAuthority(),
      }),
    /runner_observation_delivery_binding_invalid/u,
  );
});

test("runner bounds public metadata bytes and structure before hashing", async () => {
  let deepMetadata = { leaf: true };
  for (let index = 0; index < 40; index += 1)
    deepMetadata = { next: deepMetadata };
  for (const [metadata, error] of [
    [{ data: "x".repeat(70 * 1024) }, /runner_public_metadata_bytes_exceeded/u],
    [deepMetadata, /runner_public_metadata_structure_exceeded/u],
  ]) {
    const value = fixture({ perturbations: false });
    const metadataPorts = ports(value, []).map((port, index) => ({
      ...port,
      stepV1(input) {
        const teamOutput = output({
          teamId: port.descriptor.teamId,
          logicalTime: input.logicalTime,
          peerIndex: input.peerIndex,
          descriptor: value.adapter.descriptor,
          messageId: `message:metadata:${index}:${input.logicalTime}`,
        });
        return { ...teamOutput, publicMetadata: metadata };
      },
    }));
    await assert.rejects(
      () =>
        evaluation.runScalableEvaluationV1({
          definition: value.definition,
          adapter: value.adapter,
          ports: metadataPorts,
          shardCount: 2,
          steps: [
            { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
          ],
          actionAuthority: actionAuthority(),
        }),
      error,
    );
  }
});

test("runner routes intra-shard messages through delivery ingress and exact ACKs", async () => {
  const value = fixture({ perturbations: false });
  const deliveries = [];
  const ingressEvents = [];
  const adapter = wrapAdapter(value.adapter, {
    deliverCrossShardBatch: (bridge) => async (batch) => {
      const ack = await bridge.deliverCrossShardBatch(batch);
      ingressEvents.push({
        kind: "bridge-ack",
        eventId: batch.messages[0].eventId,
      });
      deliveries.push({ batch, ack });
      return ack;
    },
  });
  const result = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter,
    ports: ports(value, [], ingressEvents),
    shardCount: 1,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    actionAuthority: actionAuthority(),
  });

  assert.equal(result.status, "completed");
  assert.equal(deliveries.length, 2);
  for (const { batch, ack } of deliveries) {
    assert.equal(batch.sourceShardId, batch.targetShardId);
    assert.deepEqual(
      ack.deliveredEventIds,
      batch.messages.map(({ eventId }) => eventId),
    );
    assert.equal(ack.accepted, true);
    assert.match(ack.ackDigest, /^sha256:[0-9a-f]{64}$/u);
  }
  assert.deepEqual(
    result.snapshot.teamSummaries.map((team) => team.counters.messages),
    [1, 1],
  );
  assert.deepEqual(
    ingressEvents.map(({ kind }) => kind),
    ["bridge-ack", "port-ingress", "bridge-ack", "port-ingress"],
  );
});

test("runner rejects a malformed intra-shard ACK instead of accounting a synthetic delivery", async () => {
  const value = fixture({ perturbations: false });
  let ingressCalls = 0;
  const portIngress = [];
  const adapter = wrapAdapter(value.adapter, {
    deliverCrossShardBatch: (bridge) => async (batch) => {
      ingressCalls += 1;
      const ack = await bridge.deliverCrossShardBatch(batch);
      return { ...ack, deliveredEventIds: [] };
    },
  });

  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter,
        ports: ports(value, [], portIngress),
        shardCount: 1,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        actionAuthority: actionAuthority(),
      }),
    /ack_invalid/u,
  );
  assert.equal(ingressCalls, 1);
  assert.equal(portIngress.length, 0);
});

test("runner requires exact post-ACK team ingress for every emitted envelope", async () => {
  const value = fixture({ perturbations: false });
  const withoutIngress = ports(value, []).map(
    ({ ingestAcknowledgedMessageV1: ignored, ...port }) => port,
  );
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.adapter,
        ports: withoutIngress,
        shardCount: 1,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        actionAuthority: actionAuthority(),
      }),
    /team_message_ingress_missing/u,
  );

  const tampered = ports(value, []);
  tampered[0].ingestAcknowledgedMessageV1 = async (input) => {
    const valid = ports(value, [])[0].ingestAcknowledgedMessageV1(input);
    return {
      ...valid,
      bridgeAckDigest: evaluation.scalableEvaluationDigestV1("wrong", {}),
    };
  };
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.adapter,
        ports: tampered,
        shardCount: 1,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        actionAuthority: actionAuthority(),
      }),
    /message_ingress_receipt_invalid/u,
  );
});

test("runner returns cancellation and exhaustion without expanding a frontier profile", async () => {
  const frontier = fixture({
    profileId: "frontier-100000",
    maximumInteractions: 4,
    perturbations: false,
  });
  const cancelled = await evaluation.runScalableEvaluationV1({
    definition: frontier.definition,
    adapter: frontier.adapter,
    ports: ports(frontier, []),
    shardCount: 16,
    steps: [
      { schemaVersion: 1, peerIndex: 99_999, domain: "cyber", cursor: null },
    ],
    abortSignal: { aborted: true },
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.processedSteps, 0);
  assert.ok(JSON.stringify(cancelled).length < 20_000);
  assert.equal("agents" in cancelled.snapshot, false);

  const exhausted = fixture({ maximumInteractions: 1, perturbations: false });
  const calls = [];
  const result = await evaluation.runScalableEvaluationV1({
    definition: exhausted.definition,
    adapter: exhausted.adapter,
    ports: ports(exhausted, calls),
    shardCount: 1,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
  });
  assert.equal(result.status, "budget_exhausted");
  assert.equal(calls.length, 0);
});

test("runner requires perturbation baselines and rejects invalid team output before side effects", async () => {
  const value = fixture();
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.adapter,
        ports: ports(value, []),
        shardCount: 1,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
      }),
    /runner_baseline_missing/u,
  );
  const validBaselines = value.teams.map((team) => ({
    schemaVersion: 1,
    baselineId: `baseline:${team.teamId}`,
    teamId: team.teamId,
    domain: "cyber",
    metrics: [
      {
        metricId: "availability",
        valueBasisPoints: 10_000,
        toleranceBasisPoints: 0,
      },
    ],
  }));
  const badPorts = value.teams.map((descriptor) => ({
    descriptor,
    stepV1(input) {
      return {
        schemaVersion: 1,
        teamId: descriptor.teamId,
        logicalTime: input.logicalTime,
        messages: [],
        actions: [],
        outputDigest:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      };
    },
  }));
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.adapter,
        ports: badPorts,
        shardCount: 1,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        recoveryBaselines: validBaselines,
        ...controls(value),
      }),
    /runner_step_output_digest_invalid/u,
  );
});

test("runner rejects structural verifiers and tampered provider evidence", async () => {
  const value = fixture();
  const recoveryBaselines = value.teams.map((team) => ({
    schemaVersion: 1,
    baselineId: `baseline:${team.teamId}`,
    teamId: team.teamId,
    domain: "cyber",
    metrics: [
      {
        metricId: "availability",
        valueBasisPoints: 10_000,
        toleranceBasisPoints: 0,
      },
    ],
  }));
  const valid = controls(value);
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.adapter,
        ports: ports(value, []),
        shardCount: 1,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        recoveryBaselines,
        ...valid,
        evidenceVerifier: {
          async verify() {
            return true;
          },
        },
      }),
    /concrete evaluation evidence Ed25519 verifier is required/u,
  );
  assert.throws(
    () =>
      new evaluation.WebCryptoScalableEvaluationEvidenceVerifierV1({
        ...valid.testEvidenceDependencies.verifierOptions,
        crypto: {
          subtle: {
            async verify() {
              return true;
            },
          },
        },
      }),
    /verifier options are invalid/u,
  );

  class OverriddenVerifier
    extends evaluation.WebCryptoScalableEvaluationEvidenceVerifierV1
  {
    async verify() {
      return true;
    }
  }
  const overriddenVerifier = new OverriddenVerifier(
    valid.testEvidenceDependencies.verifierOptions,
  );
  valid.testEvidenceDependencies.authorizations.resolve = async () => null;
  valid.testEvidenceDependencies.keys.resolve = async () => null;
  const capturedDependenciesResult = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter: value.adapter,
    ports: ports(value, []),
    shardCount: 1,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    recoveryBaselines,
    ...valid,
  });
  assert.equal(capturedDependenciesResult.status, "completed");

  const tamperedPort = {
    async injectV1(input) {
      const receipt = await valid.perturbationPort.injectV1(input);
      return {
        ...receipt,
        scenarioManifestDigest:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      };
    },
  };
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.adapter,
        ports: ports(value, []),
        shardCount: 1,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        recoveryBaselines,
        ...valid,
        perturbationPort: tamperedPort,
      }),
    /runner_perturbation_receipt_invalid/u,
  );

  const nonCanonicalSignaturePort = {
    async injectV1(input) {
      const receipt = await valid.perturbationPort.injectV1(input);
      const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      const finalIndex = alphabet.indexOf(receipt.proof.value.at(-1));
      const proof = {
        ...receipt.proof,
        value: `${receipt.proof.value.slice(0, -1)}${alphabet[finalIndex + 1]}`,
      };
      const { receiptDigest: _receiptDigest, ...originalBody } = receipt;
      const body = { ...originalBody, proof };
      return {
        ...body,
        receiptDigest: evaluation.scalableEvaluationDigestV1(
          "perturbation-injection-receipt",
          body,
        ),
      };
    },
  };
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.adapter,
        ports: ports(value, []),
        shardCount: 1,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        recoveryBaselines,
        ...valid,
        perturbationPort: nonCanonicalSignaturePort,
      }),
    /runner_perturbation_receipt_invalid/u,
  );

  valid.evidenceVerifier.verify = async () => true;
  const forgedSignaturePort = {
    async injectV1(input) {
      const receipt = await valid.perturbationPort.injectV1(input);
      const proof = { ...receipt.proof, value: "A".repeat(86) };
      const { receiptDigest: _receiptDigest, ...originalBody } = receipt;
      const body = { ...originalBody, proof };
      return {
        ...body,
        receiptDigest: evaluation.scalableEvaluationDigestV1(
          "perturbation-injection-receipt",
          body,
        ),
      };
    },
  };
  const subtlePrototype = Object.getPrototypeOf(evidenceCrypto.subtle);
  const originalVerify = subtlePrototype.verify;
  subtlePrototype.verify = async () => true;
  try {
    await assert.rejects(
      () =>
        evaluation.runScalableEvaluationV1({
          definition: value.definition,
          adapter: value.adapter,
          ports: ports(value, []),
          shardCount: 1,
          steps: [
            { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
          ],
          recoveryBaselines,
          ...valid,
          evidenceVerifier: overriddenVerifier,
          perturbationPort: forgedSignaturePort,
        }),
      /runner_perturbation_evidence_invalid/u,
    );
  } finally {
    subtlePrototype.verify = originalVerify;
  }
});

test("runner keeps sampling an active recovery until the baseline is restored", async () => {
  const value = fixture();
  const samplesByTeam = new Map();
  const result = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter: value.adapter,
    ports: ports(value, []),
    shardCount: 2,
    steps: [
      { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
      { schemaVersion: 1, peerIndex: 1, domain: "cyber", cursor: null },
    ],
    recoveryBaselines: value.teams.map((team) => ({
      schemaVersion: 1,
      baselineId: `baseline:${team.teamId}`,
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
    ...controls(value, [], (input) => {
      const count = (samplesByTeam.get(input.teamId) ?? 0) + 1;
      samplesByTeam.set(input.teamId, count);
      return [
        {
          metricId: "availability",
          valueBasisPoints: count === 1 ? 0 : 10_000,
        },
      ];
    }),
  });
  assert.equal(result.status, "completed");
  assert.deepEqual([...samplesByTeam.values()], [2, 2]);
  assert.deepEqual(
    result.snapshot.teamSummaries.map((team) => team.recoveredEpisodeCount),
    [1, 1],
  );
});

test("runner rejects effect receipts and message acknowledgements that are not exactly bound", async () => {
  const effectFixture = fixture({ perturbations: false });
  const badEffectAdapter = wrapAdapter(effectFixture.adapter, {
    requestEffect: (bridge) => async (request) => {
      const receipt = await bridge.requestEffect(request);
      return { ...receipt, accepted: !receipt.accepted };
    },
  });
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: effectFixture.definition,
        adapter: badEffectAdapter,
        ports: ports(effectFixture, []),
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        actionAuthority: actionAuthority(),
      }),
    /effect_digest_invalid|receipt_digest_invalid/u,
  );

  const ackFixture = fixture({ perturbations: false });
  const badAckAdapter = wrapAdapter(ackFixture.adapter, {
    deliverCrossShardBatch: (bridge) => async (batch) => {
      const ack = await bridge.deliverCrossShardBatch(batch);
      return { ...ack, deliveredEventIds: [] };
    },
  });
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: ackFixture.definition,
        adapter: badAckAdapter,
        ports: ports(ackFixture, []),
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        actionAuthority: actionAuthority(),
      }),
    /ack_invalid/u,
  );

  const batchBindingFixture = fixture({ perturbations: false });
  const wrongBatchDigest = evaluation.scalableEvaluationDigestV1(
    "test-wrong-cross-shard-batch",
    { version: 1 },
  );
  const batchSubstitutionAdapter = wrapAdapter(batchBindingFixture.adapter, {
    deliverCrossShardBatch: (bridge) => async (batch) => {
      const ack = await bridge.deliverCrossShardBatch(batch);
      const { ackDigest: ignored, ...ackBody } = ack;
      const substitutedBody = {
        ...ackBody,
        batchDigest: wrongBatchDigest,
      };
      return {
        ...substitutedBody,
        ackDigest: simulation.shardedSimulationDigestV1(
          "sharded-simulation-cross-shard-ack-v1",
          substitutedBody,
        ),
      };
    },
  });
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: batchBindingFixture.definition,
        adapter: batchSubstitutionAdapter,
        ports: ports(batchBindingFixture, []),
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        actionAuthority: actionAuthority(),
      }),
    /ack_invalid/u,
  );
});

test("runner rejects action settlement receipts that substitute the fenced action", async () => {
  const value = fixture({ perturbations: false });
  const wrongActionDigest = evaluation.scalableEvaluationDigestV1(
    "test-wrong-settled-action",
    { version: 1 },
  );
  const badPorts = ports(value, []).map((port) => ({
    ...port,
    settleActionV1(input) {
      const body = {
        schemaVersion: 1,
        evaluationDefinitionDigest: input.evaluationDefinitionDigest,
        teamId: input.teamId,
        sessionId: input.sessionId,
        episodeId: input.episodeId,
        peerIndex: input.peerIndex,
        logicalTime: input.logicalTime,
        actionIndex: input.actionIndex,
        outputDigest: input.outputDigest,
        actionDigest: wrongActionDigest,
        effectReceiptDigest: input.effectReceipt.receiptDigest,
        status: "settled",
      };
      return {
        ...body,
        receiptDigest: evaluation.scalableEvaluationDigestV1(
          "team-action-settlement-receipt",
          body,
        ),
      };
    },
  }));
  await assert.rejects(
    () =>
      evaluation.runScalableEvaluationV1({
        definition: value.definition,
        adapter: value.adapter,
        ports: badPorts,
        shardCount: 2,
        steps: [
          { schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null },
        ],
        actionAuthority: actionAuthority(),
      }),
    /action_settlement_receipt_invalid/u,
  );
});

test("runner stops between external effects when cancellation is observed", async () => {
  const value = fixture({ perturbations: false });
  const abortSignal = { aborted: false };
  let effectCalls = 0;
  const adapter = wrapAdapter(value.adapter, {
    requestEffect: (bridge) => async (request) => {
      effectCalls += 1;
      const receipt = await bridge.requestEffect(request);
      abortSignal.aborted = true;
      return receipt;
    },
  });
  const twoActionPorts = value.teams.map((descriptor, index) => ({
    descriptor,
    stepV1(input) {
      const first = output({
        teamId: descriptor.teamId,
        logicalTime: input.logicalTime,
        peerIndex: input.peerIndex,
        descriptor: value.adapter.descriptor,
        messageId: `message:cancel:${index}`,
      });
      const actions = [
        first.actions[0],
        { ...first.actions[0], entityId: `entity:${input.peerIndex}:second` },
      ];
      const body = {
        schemaVersion: 1,
        teamId: descriptor.teamId,
        logicalTime: input.logicalTime,
        messages: first.messages,
        actions,
      };
      return {
        ...body,
        outputDigest: evaluation.scalableEvaluationDigestV1(
          "team-step-output",
          body,
        ),
      };
    },
  }));
  const result = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter,
    ports: twoActionPorts,
    shardCount: 2,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    actionAuthority: actionAuthority(),
    abortSignal,
  });
  assert.equal(result.status, "cancelled");
  assert.equal(effectCalls, 1);
  assert.equal(
    result.snapshot.teamSummaries.reduce(
      (total, team) => total + team.counters.actions,
      0,
    ),
    1,
  );
});

test("runner accounts a completed observation before honoring cancellation", async () => {
  const value = fixture({ perturbations: false });
  const abortSignal = { aborted: false };
  const adapter = wrapAdapter(value.adapter, {
    pullPartialObservation: (bridge) => async (request) => {
      const delivery = await bridge.pullPartialObservation(request);
      abortSignal.aborted = true;
      return delivery;
    },
  });
  const calls = [];
  const result = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter,
    ports: ports(value, calls),
    shardCount: 2,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    actionAuthority: actionAuthority(),
    abortSignal,
  });
  assert.equal(result.status, "cancelled");
  assert.equal(calls.length, 0);
  assert.equal(
    result.snapshot.teamSummaries.reduce(
      (total, team) => total + team.counters.observations,
      0,
    ),
    1,
  );
});

test("runner stops recovery metric sampling between provider calls", async () => {
  const value = fixture();
  const abortSignal = { aborted: false };
  let sampleCalls = 0;
  const result = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter: value.adapter,
    ports: ports(value, []),
    shardCount: 2,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    recoveryBaselines: value.teams.map((team) => ({
      schemaVersion: 1,
      baselineId: `baseline:${team.teamId}`,
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
    ...controls(value, [], () => {
      sampleCalls += 1;
      abortSignal.aborted = true;
      return [{ metricId: "availability", valueBasisPoints: 10_000 }];
    }),
    abortSignal,
  });
  assert.equal(result.status, "cancelled");
  assert.equal(sampleCalls, 1);
});

test("runner observes cancellation between scenario creation and opening", async () => {
  const value = fixture({ perturbations: false });
  const abortSignal = { aborted: false };
  let openCalls = 0;
  const adapter = {
    descriptor: value.adapter.descriptor,
    async createScenario(definition) {
      const manifest = await value.adapter.createScenario(definition);
      abortSignal.aborted = true;
      return manifest;
    },
    async openScenario(input) {
      openCalls += 1;
      return value.adapter.openScenario(input);
    },
  };
  const result = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter,
    ports: ports(value, []),
    shardCount: 2,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    abortSignal,
  });
  assert.equal(result.status, "cancelled");
  assert.equal(openCalls, 0);
});

test("runner cannot complete when an empty final team step cancels", async () => {
  const value = fixture({ perturbations: false });
  const abortSignal = { aborted: false };
  let stepCalls = 0;
  const emptyPorts = value.teams.map((descriptor) => ({
    descriptor,
    stepV1(input) {
      stepCalls += 1;
      if (stepCalls === 2) abortSignal.aborted = true;
      const body = {
        schemaVersion: 1,
        teamId: descriptor.teamId,
        logicalTime: input.logicalTime,
        messages: [],
        actions: [],
      };
      return {
        ...body,
        outputDigest: evaluation.scalableEvaluationDigestV1(
          "team-step-output",
          body,
        ),
      };
    },
  }));
  const result = await evaluation.runScalableEvaluationV1({
    definition: value.definition,
    adapter: value.adapter,
    ports: emptyPorts,
    shardCount: 2,
    steps: [{ schemaVersion: 1, peerIndex: 0, domain: "cyber", cursor: null }],
    abortSignal,
  });
  assert.equal(stepCalls, 2);
  assert.equal(result.status, "cancelled");
  assert.equal(result.processedSteps, 0);
});
