import test from "node:test";
import {
  InMemoryRoomSituationStoreV1,
  InMemoryMemoryProposalStoreV1,
  InMemoryMemoryRevisionStoreV1,
} from "@agentplat/rooms";
import { roomFollowupScenarios } from "./helpers/room-followup-scenarios.mjs";
test("situations and durable learning contract in memory", async (t) =>
  roomFollowupScenarios(t, async () => ({
    situations: new InMemoryRoomSituationStoreV1(),
    proposals: new InMemoryMemoryProposalStoreV1(),
    memory: new InMemoryMemoryRevisionStoreV1(),
  })));
