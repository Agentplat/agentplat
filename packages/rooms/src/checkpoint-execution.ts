import type {
  RuntimeCheckpointDecision,
  RuntimeCheckpointRequest,
} from "@agentplat/runtime";
import type { RoomExecutionCoordinator } from "./execution-session.js";
import type { RunInterventionDispatcher } from "./intervention-dispatcher.js";

/** Room and participant binding supplied to a runtime checkpoint decision. */
export interface RoomRunCheckpointInput extends RuntimeCheckpointRequest {
  tenantId: string;
  roomId: string;
  sessionId: string;
  runId: string;
}

/** Fail-closed checkpoint boundary invoked around provider execution. */
export interface RoomRunCheckpointHandler {
  handle(input: RoomRunCheckpointInput): Promise<RuntimeCheckpointDecision>;
}

/** Drains durable interventions before resolving a Room run checkpoint. */
export class InterventionAwareRoomRunCheckpointHandler implements RoomRunCheckpointHandler {
  constructor(
    private readonly sessions: RoomExecutionCoordinator,
    private readonly dispatcher: RunInterventionDispatcher,
    private readonly leaseMs = 30_000,
  ) {}

  async handle(
    input: RoomRunCheckpointInput,
  ): Promise<RuntimeCheckpointDecision> {
    for (let attempt = 0; attempt < 256; attempt += 1) {
      const current = await this.sessions.getSession(input);
      const dispatched = await this.dispatcher.dispatchNext({
        tenantId: input.tenantId,
        roomId: input.roomId,
        sessionId: input.sessionId,
        expectedRevision: current.revision,
        checkpoint: input.checkpoint,
        dispatchToken: `${input.runId}:${input.checkpoint}:${current.revision}`,
        leaseMs: this.leaseMs,
      });
      if (!dispatched) return { allowed: true };
      const latest = dispatched.interventions.at(-1);
      if (latest?.status === "rejected") {
        return {
          allowed: false,
          reason:
            latest.resolutionReason ??
            "Run intervention was rejected at the Runtime checkpoint",
        };
      }
    }
    return {
      allowed: false,
      reason: "Run intervention checkpoint processing limit was reached",
    };
  }
}
