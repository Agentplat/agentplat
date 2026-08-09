import type {
  CollectivePeerHostTopologyPortV1,
  CollectivePeerHostTopologyFreshnessV1,
} from "./host-contracts.js";
import type {
  CollectivePeerNodeClockV1,
  CollectivePeerNodeSynchronizationPortV1,
  CollectivePeerNodeSynchronizationOperationV1,
  CollectivePeerNodeScopeV1,
} from "./node-contracts.js";
import type {
  CollectiveSparsePeerLogicalClockV1,
  CollectiveSparsePeerPlaneLifecyclePortV1,
} from "./sparse-peer-contracts.js";

export function createCollectiveSparsePeerLogicalClockV1(
  clock: CollectivePeerNodeClockV1,
): CollectiveSparsePeerLogicalClockV1 {
  if (!clock || typeof clock.now !== "function")
    throw new TypeError("peer node clock is required");
  return Object.freeze({
    logicalTime: () => logicalTime(clock.now().logicalTimeMs),
  });
}

/** Host topology is derived from the current active sparse view, not a global graph. */
export function createCollectiveSparsePeerHostTopologyPortV1(input: {
  readonly plane: CollectiveSparsePeerPlaneLifecyclePortV1;
  readonly clock: CollectiveSparsePeerLogicalClockV1;
}): CollectivePeerHostTopologyPortV1 {
  assertPorts(input);
  return Object.freeze({
    freshness: async (): Promise<CollectivePeerHostTopologyFreshnessV1> =>
      input.plane.topologyFreshness(logicalTime(input.clock.logicalTime())),
  });
}

/**
 * Adds membership-bound sparse-view readiness and catch-up ahead of the
 * existing causal predecessor synchronization path.
 */
export function createCollectiveSparsePeerNodeSynchronizationPortV1(input: {
  readonly plane: CollectiveSparsePeerPlaneLifecyclePortV1;
  readonly delegate?: CollectivePeerNodeSynchronizationPortV1;
}): CollectivePeerNodeSynchronizationPortV1 {
  if (!input?.plane) throw new TypeError("sparse peer plane is required");
  if (
    input.delegate &&
    (typeof input.delegate.readiness !== "function" ||
      typeof input.delegate.recoverPredecessor !== "function")
  )
    throw new TypeError("node synchronization delegate is invalid");
  return Object.freeze({
    readiness: async (request: {
      readonly scope: CollectivePeerNodeScopeV1;
      readonly operation: CollectivePeerNodeSynchronizationOperationV1;
      readonly logicalTimeMs: number;
    }) => {
      const time = logicalTime(request.logicalTimeMs);
      let freshness = await input.plane.topologyFreshness(time);
      if (freshness === "stale" && (await input.plane.catchUpMembership(time)))
        freshness = await input.plane.topologyFreshness(time);
      if (freshness !== "fresh")
        return Object.freeze({
          ready: false,
          reasonCode:
            freshness === "unknown"
              ? "sparse_topology_unknown"
              : "sparse_topology_stale",
          certificateId: null,
        });
      return input.delegate
        ? input.delegate.readiness(request)
        : Object.freeze({
            ready: true,
            reasonCode: "sparse_topology_current",
            certificateId: null,
          });
    },
    recoverPredecessor: (
      request: Parameters<
        CollectivePeerNodeSynchronizationPortV1["recoverPredecessor"]
      >[0],
    ) =>
      input.delegate
        ? input.delegate.recoverPredecessor(request)
        : Promise.resolve(null),
  });
}

function assertPorts(input: {
  readonly plane: CollectiveSparsePeerPlaneLifecyclePortV1;
  readonly clock: CollectiveSparsePeerLogicalClockV1;
}): void {
  if (
    !input?.plane ||
    typeof input.plane.topologyFreshness !== "function" ||
    typeof input.plane.catchUpMembership !== "function" ||
    typeof input.plane.drain !== "function"
  )
    throw new TypeError("sparse peer plane is invalid");
  if (!input.clock || typeof input.clock.logicalTime !== "function")
    throw new TypeError("sparse peer logical clock is required");
}

function logicalTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError("sparse peer logical time is invalid");
  return value;
}
