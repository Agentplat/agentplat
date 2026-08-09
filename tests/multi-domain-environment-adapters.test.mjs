import assert from "node:assert/strict";
import test from "node:test";

const environment =
  await import("../packages/mesh-sim/dist/multi-domain-environment.js");
const sharded = await import("../packages/mesh-sim/dist/sharded-simulation.js");

for (const domain of ["physical", "social", "cyber"]) {
  test(`${domain} reference adapter satisfies the common conformance contract`, async () => {
    const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
      domain,
    });
    const definition =
      environment.createReferenceMultiDomainScenarioDefinitionV1({
        adapter,
        scenarioId: `scenario:${domain}`,
        scaleProfileId: "peers-500-interactions-5000",
        seed: 41,
      });
    const report = await environment.runMultiDomainAdapterConformanceV1({
      adapter,
      definition,
    });
    assert.equal(report.conformant, true);
    assert.equal(report.capabilityFailClosed, true);
    assert.equal(report.staleFenceRejected, true);
    assert.equal(report.checkpointRestoreStable, true);
  });
}

test("frontier profile negotiates 100K entities and one million interactions without global state", async () => {
  const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "cyber",
  });
  const definition = environment.createReferenceMultiDomainScenarioDefinitionV1(
    {
      adapter,
      scenarioId: "scenario:frontier",
      scaleProfileId: "peers-100000-interactions-1000000",
      seed: 73,
    },
  );
  assert.equal(definition.entityCount, 100_000);
  assert.equal(definition.resourceBudget.maximumInteractions, 1_000_000);
  const report = await environment.runMultiDomainAdapterConformanceV1({
    adapter,
    definition,
  });
  assert.equal(report.conformant, true);
  assert.equal(report.boundedState, true);
  assert.equal(report.scaleProfileId, "peers-100000-interactions-1000000");
});

test("scenario registration is descriptor-bound and rejects excess allocation before opening", async () => {
  const physical = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "physical",
  });
  const social = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "social",
  });
  const definition = environment.createReferenceMultiDomainScenarioDefinitionV1(
    {
      adapter: physical,
      scenarioId: "scenario:binding",
      scaleProfileId: "peers-500-interactions-5000",
      seed: 4,
    },
  );
  const manifest = await physical.createScenario(definition);
  assert.throws(
    () =>
      environment.validateMultiDomainScenarioManifestV1(
        manifest,
        social.descriptor,
      ),
    /adapter_binding/u,
  );
  assert.throws(
    () =>
      physical.createScenario({
        ...definition,
        entityCount: 501,
      }),
    /entity_limit/u,
  );
});

test("unknown actions fail before the simulator and valid actions retain outer fencing", async () => {
  const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "physical",
  });
  const definition = environment.createReferenceMultiDomainScenarioDefinitionV1(
    {
      adapter,
      scenarioId: "scenario:actions",
      scaleProfileId: "peers-500-interactions-5000",
      seed: 9,
    },
  );
  const manifest = await adapter.createScenario(definition);
  const bridge = await adapter.openScenario({ manifest });
  const session = await bridge.createSession({
    environmentId: adapter.descriptor.adapterId,
    logicalTime: 0,
  });
  const episode = await bridge.startEpisode({
    session,
    episodeId: "episode:actions",
    seed: definition.seed,
    logicalTime: 0,
  });
  const profile = sharded.shardedSimulationScaleProfileV1(
    definition.scaleProfileId,
  );
  const assignments = sharded.createShardedSimulationAssignmentsV1({
    profile,
    shardCount: 1,
  });
  await bridge.bindShardAssignments({ session, episode, profile, assignments });
  const schema = adapter.descriptor.actionSchemas[0];
  const action = {
    schemaVersion: 1,
    domain: schema.domain,
    entityId: "entity:0",
    capability: schema.capability,
    schemaDigest: schema.schemaDigest,
    payload: { requested: true },
  };
  const requestBody = {
    schemaVersion: 1,
    actionId: "action:valid",
    sessionId: session.sessionId,
    episodeId: episode.episodeId,
    peerIndex: 0,
    logicalTime: 1,
    executionEpoch: 1,
    fenceToken: `fence:${session.sessionId}:${episode.episodeId}:0:1`,
    action,
  };
  const receipt = await bridge.requestEffect({
    ...requestBody,
    actionDigest: sharded.shardedSimulationFencedActionDigestV1(requestBody),
  });
  assert.equal(receipt.accepted, true);

  const invalid = {
    ...action,
    capability: "undeclared-capability",
  };
  const invalidBody = {
    ...requestBody,
    actionId: "action:invalid",
    action: invalid,
  };
  assert.throws(
    () =>
      bridge.requestEffect({
        ...invalidBody,
        actionDigest:
          sharded.shardedSimulationFencedActionDigestV1(invalidBody),
      }),
    /capability_not_registered/u,
  );
});

test("observation envelopes reject payload or digest substitution", () => {
  const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "social",
  });
  const schema = adapter.descriptor.observationSchemas[0];
  const observation = environment.createMultiDomainObservationEnvelopeV1({
    descriptor: adapter.descriptor,
    observationId: "observation:one",
    domain: schema.domain,
    entityId: "entity:0",
    modality: schema.modality,
    schemaDigest: schema.schemaDigest,
    logicalTime: 1,
    payload: { kind: "information-state", confidenceBps: 5_000 },
  });
  assert.deepEqual(
    environment.validateMultiDomainObservationEnvelopeV1(
      observation,
      adapter.descriptor,
    ),
    observation,
  );
  assert.throws(
    () =>
      environment.validateMultiDomainObservationEnvelopeV1(
        { ...observation, payload: { kind: "substituted" } },
        adapter.descriptor,
      ),
    /digest_invalid/u,
  );
  assert.equal("privateState" in observation, false);
});

test("conformance rejects an adapter that substitutes the requested scenario", async () => {
  const reference = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "cyber",
  });
  const definition = environment.createReferenceMultiDomainScenarioDefinitionV1(
    {
      adapter: reference,
      scenarioId: "scenario:no-substitution",
      scaleProfileId: "peers-500-interactions-5000",
      seed: 31,
    },
  );
  const substituting = {
    descriptor: reference.descriptor,
    createScenario(candidate) {
      return reference.createScenario({
        ...candidate,
        seed: candidate.seed + 1,
      });
    },
    openScenario(input) {
      return reference.openScenario(input);
    },
  };
  await assert.rejects(
    environment.runMultiDomainAdapterConformanceV1({
      adapter: substituting,
      definition,
    }),
    /conformance_definition_substitution/,
  );
});

test("conformance rejects a restore receipt that does not restore mutated state", async () => {
  const reference = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "cyber",
  });
  const definition = environment.createReferenceMultiDomainScenarioDefinitionV1(
    {
      adapter: reference,
      scenarioId: "scenario:no-op-restore",
      scaleProfileId: "peers-500-interactions-5000",
      seed: 37,
    },
  );
  const noOpRestore = {
    descriptor: reference.descriptor,
    createScenario(candidate) {
      return reference.createScenario(candidate);
    },
    async openScenario(input) {
      const bridge = await reference.openScenario(input);
      return new Proxy(bridge, {
        get(target, property, receiver) {
          if (property === "restore") {
            return (request) => {
              const body = {
                schemaVersion: 1,
                checkpointId: request.checkpoint.checkpointId,
                restoredRevision: request.checkpoint.revision,
                restoredLogicalTime: request.checkpoint.logicalTime,
              };
              return Object.freeze({
                ...body,
                receiptDigest: sharded.shardedSimulationDigestV1(
                  "sharded-simulation-restore-receipt-v1",
                  body,
                ),
              });
            };
          }
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
  const report = await environment.runMultiDomainAdapterConformanceV1({
    adapter: noOpRestore,
    definition,
  });
  assert.equal(report.checkpointRestoreStable, false);
  assert.equal(report.conformant, false);
});

test("scenario budgets count logical interactions and reject checkpoint overflow before mutation", async () => {
  const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "physical",
  });
  const base = environment.createReferenceMultiDomainScenarioDefinitionV1({
    adapter,
    scenarioId: "scenario:tight-budgets",
    scaleProfileId: "peers-500-interactions-5000",
    seed: 17,
    entityCount: 2,
  });
  const definition = {
    ...base,
    resourceBudget: {
      ...base.resourceBudget,
      maximumInteractions: 1,
      maximumCheckpointBytes: 1,
    },
  };
  const manifest = await adapter.createScenario(definition);
  const bridge = await adapter.openScenario({ manifest });
  const session = await bridge.createSession({
    environmentId: adapter.descriptor.adapterId,
    logicalTime: 0,
  });
  const episode = await bridge.startEpisode({
    session,
    episodeId: "episode:tight-budgets",
    seed: definition.seed,
    logicalTime: 0,
  });
  const profile = sharded.shardedSimulationScaleProfileV1(
    definition.scaleProfileId,
  );
  const assignments = sharded.createShardedSimulationAssignmentsV1({
    profile,
    shardCount: 1,
  });
  await bridge.bindShardAssignments({ session, episode, profile, assignments });
  await bridge.pullPartialObservation({
    schemaVersion: 1,
    sessionId: session.sessionId,
    episodeId: episode.episodeId,
    peerIndex: 0,
    logicalTime: 1,
    cursor: null,
    requestId: "tight:observation:0",
  });
  const schema = adapter.descriptor.actionSchemas[0];
  const action = {
    schemaVersion: 1,
    domain: schema.domain,
    entityId: "entity:0",
    capability: schema.capability,
    schemaDigest: schema.schemaDigest,
    payload: { requested: true },
  };
  const actionBody = {
    schemaVersion: 1,
    actionId: "tight:action:0",
    sessionId: session.sessionId,
    episodeId: episode.episodeId,
    peerIndex: 0,
    logicalTime: 1,
    executionEpoch: 1,
    fenceToken: `fence:${session.sessionId}:${episode.episodeId}:0:1`,
    action,
  };
  const receipt = await bridge.requestEffect({
    ...actionBody,
    actionDigest: sharded.shardedSimulationFencedActionDigestV1(actionBody),
  });
  assert.equal(receipt.accepted, true);
  assert.throws(
    () =>
      bridge.pullPartialObservation({
        schemaVersion: 1,
        sessionId: session.sessionId,
        episodeId: episode.episodeId,
        peerIndex: 1,
        logicalTime: 2,
        cursor: null,
        requestId: "tight:observation:1",
      }),
    /interaction_budget_exceeded/,
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.throws(
      () =>
        bridge.checkpoint({
          session,
          episode,
          expectedRevision: 0,
          logicalTime: 2,
        }),
      /checkpoint_scenario_budget_exceeded/,
    );
  }
});
