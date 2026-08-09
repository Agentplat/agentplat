import type {
  MeshSparsePeerPlaneDrainResultV1,
  MeshSparseTopologyFreshnessV1,
} from "@agentplat/mesh/overlay";

/** Minimal lifecycle surface shared by the production host and node. */
export interface CollectiveSparsePeerPlaneLifecyclePortV1 {
  topologyFreshness(
    logicalTime: number,
  ): Promise<MeshSparseTopologyFreshnessV1>;
  catchUpMembership(logicalTime: number): Promise<boolean>;
  drain(input: {
    readonly logicalTime: number;
    readonly maximumItems?: number;
  }): Promise<MeshSparsePeerPlaneDrainResultV1>;
}

export interface CollectiveSparsePeerLogicalClockV1 {
  logicalTime(): number;
}
