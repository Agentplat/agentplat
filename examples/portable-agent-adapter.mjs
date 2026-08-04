import {
  PortableAgentAdapterRegistryV1,
  PortableAgentSessionRuntimeV1,
} from "@agentplat/runtime/adapter";

const manifest = {
  schemaVersion: 1,
  adapterId: "local-symbolic",
  adapterVersion: "1.0.0",
  implementationId: "local-symbolic-build-1",
  agentKinds: ["symbolic"],
  inputModalities: ["sensor", "structured"],
  outputModalities: ["structured"],
  interactionModes: ["observe_act"],
  controlPoints: ["post_output", "pre_action", "pre_step"],
  supportsCancellation: true,
  supportsCheckpoint: false,
  supportsRestore: false,
  maximumObservationBytes: 1_000_000,
  maximumOutputBytes: 1_000_000,
  maximumActionBytes: 1_000_000,
  maximumStepsPerSession: 100,
};

const registry = new PortableAgentAdapterRegistryV1().register({
  manifest,
  adapter: {
    async step(input) {
      const temperature = input.request.observations[0]?.content?.temperature;
      return {
        schemaVersion: 1,
        sessionId: input.sessionId,
        stepId: input.request.stepId,
        stepSequence: input.stepSequence,
        status: "completed",
        outputs: [
          {
            schemaVersion: 1,
            outputId: `${input.request.stepId}:assessment`,
            modality: "structured",
            content: {
              assessment: temperature > 30 ? "hot" : "nominal",
              temperature,
            },
            contentReference: null,
            metadata: {},
          },
        ],
        actionProposals: [],
        checkpoint: null,
        reasonCode: null,
        metadata: {},
      };
    },
  },
});

const runtime = new PortableAgentSessionRuntimeV1({
  registry,
  control: {
    controlId: "local-control",
    controlVersion: 1,
    implementationId: "local-control-build-1",
    evaluate: () => ({ disposition: "allow", reasonCode: "allowed" }),
  },
});

const session = await runtime.createSession({
  sessionId: "field-session-1",
  tenant: { tenantId: "example" },
  agentId: "sensor-interpreter-1",
  adapterId: manifest.adapterId,
  adapterVersion: manifest.adapterVersion,
  requirements: {
    agentKinds: ["symbolic"],
    inputModalities: ["sensor"],
    outputModalities: ["structured"],
    interactionMode: "observe_act",
    controlPoints: ["post_output", "pre_step"],
    requireCancellation: true,
  },
  role: {
    schemaVersion: 1,
    roleBindingId: "role-1",
    roleRevision: 1,
    predecessorRoleBindingId: null,
    objectiveId: "objective-1",
    roleKey: "local-observer",
    instructions: ["Classify only the supplied local reading."],
    constraints: {},
    validFromLogicalMs: 0,
    validUntilLogicalMs: Number.MAX_SAFE_INTEGER,
  },
});

const outcome = await runtime.step(session.sessionId, {
  schemaVersion: 1,
  stepId: "reading-1",
  expectedSessionRevision: session.revision,
  interactionMode: "observe_act",
  observations: [
    {
      schemaVersion: 1,
      observationId: "observation-1",
      sourceZone: "environment_untrusted",
      sourceId: "thermometer-1",
      modality: "sensor",
      content: { temperature: 22 },
      contentReference: null,
      provenance: { transport: "local" },
      observedAtLogicalMs: 1,
    },
  ],
  input: null,
  requestedOutputModalities: ["structured"],
  logicalTimeMs: 1,
});

console.log(outcome.record.result.outputs[0].content);
