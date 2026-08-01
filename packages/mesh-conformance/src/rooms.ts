import type {
  RoomMeshBridge,
  RoomMeshInboundProjection,
} from "@agentplat/rooms-mesh";

import type {
  MeshConformanceCaseResult,
  MeshConformanceFactoryContext,
} from "./contracts.js";
import {
  assertCondition,
  awaitConformanceOperation,
  runConformanceCleanup,
  runBoundedCase,
  runnerContext,
  type MeshConformanceRunnerOptions,
} from "./runner.js";

export type MeshRoomsConformanceScenario = "normal" | "retry";

export interface MeshRoomsConformanceAdapter {
  readonly bridge: RoomMeshBridge;
  readonly projection: RoomMeshInboundProjection;
  reproject(): RoomMeshInboundProjection | Promise<RoomMeshInboundProjection>;
  sinkApplications(): number;
  cleanup?(): void | Promise<void>;
}

export type MeshRoomsConformanceFactory = (
  scenario: MeshRoomsConformanceScenario,
  context: MeshConformanceFactoryContext,
) => MeshRoomsConformanceAdapter | Promise<MeshRoomsConformanceAdapter>;

export interface MeshRoomsConformanceOptions extends MeshConformanceRunnerOptions {
  readonly factory: MeshRoomsConformanceFactory;
  readonly allowDestructiveTests?: boolean;
}

export async function runMeshRoomsConformance(
  options: MeshRoomsConformanceOptions,
): Promise<readonly MeshConformanceCaseResult[]> {
  const context = runnerContext(options);
  if (
    context.declaredCapabilities.has("rooms.projection_idempotency") &&
    options.allowDestructiveTests !== true
  ) {
    throw new TypeError(
      "Mesh Rooms conformance requires destructive-test consent",
    );
  }
  return Object.freeze([
    await runBoundedCase({
      caseId: "rooms.projection.stable_key",
      capability: "rooms.projection_idempotency",
      context,
      run: (signal) =>
        withAdapter(
          options.factory,
          context,
          signal,
          "normal",
          async (adapter) => {
            const repeated = await adapter.reproject();
            assertCondition(
              repeated.idempotencyKey === adapter.projection.idempotencyKey,
            );
            assertCondition(repeated.tenantId === adapter.projection.tenantId);
            assertCondition(repeated.roomId === adapter.projection.roomId);
            assertCondition(repeated.taskId === adapter.projection.taskId);
            assertCondition(
              repeated.source.messageId === adapter.projection.source.messageId,
            );
          },
        ),
    }),
    await runBoundedCase({
      caseId: "rooms.projection.duplicate",
      capability: "rooms.projection_idempotency",
      context,
      run: (signal) =>
        withAdapter(
          options.factory,
          context,
          signal,
          "normal",
          async (adapter) => {
            const first = await adapter.bridge.apply(adapter.projection);
            const second = await adapter.bridge.apply(adapter.projection);
            assertCondition(first.status === "applied");
            assertCondition(second.status === "duplicate");
            assertCondition(adapter.sinkApplications() === 1);
          },
        ),
    }),
    await runBoundedCase({
      caseId: "rooms.projection.retry",
      capability: "rooms.projection_idempotency",
      context,
      run: (signal) =>
        withAdapter(
          options.factory,
          context,
          signal,
          "retry",
          async (adapter) => {
            let failed = false;
            try {
              await adapter.bridge.apply(adapter.projection);
            } catch {
              failed = true;
            }
            assertCondition(failed);
            const retried = await adapter.bridge.apply(adapter.projection);
            assertCondition(retried.status === "applied");
            assertCondition(adapter.sinkApplications() === 2);
          },
        ),
    }),
  ]);
}

async function withAdapter(
  factory: MeshRoomsConformanceFactory,
  context: ReturnType<typeof runnerContext>,
  signal: AbortSignal,
  scenario: MeshRoomsConformanceScenario,
  run: (adapter: MeshRoomsConformanceAdapter) => void | Promise<void>,
): Promise<void> {
  const adapter = await awaitConformanceOperation(
    factory(scenario, Object.freeze({ seed: context.seed, signal })),
    signal,
  );
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Mesh Rooms conformance factory is invalid");
  }
  let failed: unknown;
  try {
    await awaitConformanceOperation(run(adapter), signal);
  } catch (error) {
    failed = error;
  }
  await runConformanceCleanup(
    adapter.cleanup?.bind(adapter),
    context.cleanupTimeoutMs,
    failed,
  );
  if (failed !== undefined) throw failed;
}
