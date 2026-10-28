import test from "node:test";
import { InMemoryIncrementalEvidenceStoreV1 } from "@agentplat/events";
import { incrementalEvidenceScenarios } from "./helpers/incremental-evidence-scenarios.mjs";
test("incremental evidence contract in memory", async (t) =>
  incrementalEvidenceScenarios(t, async () => ({
    store: new InMemoryIncrementalEvidenceStoreV1(),
  })));
