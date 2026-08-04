import { DefaultAgentRuntime } from "@agentplat/runtime";
import {
  InMemoryPortableAgentStateStoreV1,
  PortableAgentAdapterRegistryV1,
  PortableAgentSessionRuntimeV1,
  createPortableAgentProviderV1,
  type PortableAgentAdapterManifestV1,
  type PortableAgentControlPortV1,
} from "@agentplat/runtime/adapter";

const manifest: PortableAgentAdapterManifestV1 = {
  schemaVersion: 1,
  adapterId: "adapter",
  adapterVersion: "1",
  implementationId: "build",
  agentKinds: ["symbolic"],
  inputModalities: ["structured"],
  outputModalities: ["structured"],
  interactionModes: ["invoke"],
  controlPoints: ["pre_step", "post_output"],
  supportsCancellation: true,
  supportsCheckpoint: false,
  supportsRestore: false,
  maximumObservationBytes: 1_000,
  maximumOutputBytes: 1_000,
  maximumActionBytes: 1_000,
  maximumStepsPerSession: 10,
};

const control: PortableAgentControlPortV1 = {
  controlId: "control",
  controlVersion: 1,
  implementationId: "control-build",
  evaluate: () => ({ disposition: "allow", reasonCode: "allowed" }),
};

const registry = new PortableAgentAdapterRegistryV1().register({
  manifest,
  adapter: {
    async step(input) {
      return {
        schemaVersion: 1,
        sessionId: input.sessionId,
        stepId: input.request.stepId,
        stepSequence: input.stepSequence,
        status: "completed",
        outputs: [
          {
            schemaVersion: 1,
            outputId: "output",
            modality: "structured",
            content: {},
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
const sessions = new PortableAgentSessionRuntimeV1({
  registry,
  control,
  stateStore: new InMemoryPortableAgentStateStoreV1(),
});
const runtime = new DefaultAgentRuntime();
runtime.registerProvider(
  "portable",
  createPortableAgentProviderV1({
    sessionRuntime: sessions,
    resolveSessionId: (agent) => agent.config?.sessionId as string,
  }),
);

void runtime;
