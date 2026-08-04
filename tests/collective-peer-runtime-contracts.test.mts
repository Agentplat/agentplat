import type { JsonObject } from "@agentplat/core";
import {
  CollectivePeerRuntimeV1,
  type CollectivePeerAgentBindingV1,
  type CollectivePeerCurrentnessPortV1,
  type CollectivePeerSessionRuntimePortV1,
} from "@agentplat/collective-runtime/peer";

declare const sessions: CollectivePeerSessionRuntimePortV1;

const currentness: CollectivePeerCurrentnessPortV1 = {
  currentnessId: "mesh-currentness",
  currentnessVersion: 1,
  implementationId: "mesh-currentness-build-1",
  check: () => ({ current: true, reasonCode: "current" }),
};

const agent: CollectivePeerAgentBindingV1 = {
  sessionId: "peer-session",
  peerId: "peer-a",
  peerInstanceId: "peer-a-instance-1",
  agentId: "local-agent-a",
  adapterId: "portable-agent",
  adapterVersion: "1.0.0",
  requirements: {
    agentKinds: ["hybrid"],
    inputModalities: ["structured"],
    outputModalities: ["structured"],
    interactionMode: "invoke",
    controlPoints: ["pre_step", "post_output"],
    requireCancellation: true,
  },
};

const runtime = new CollectivePeerRuntimeV1({ sessions, currentness });
const input: JsonObject = { local: true };

void runtime;
void agent;
void input;
