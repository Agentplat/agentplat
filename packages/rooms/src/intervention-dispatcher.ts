import { AgentPlatError } from "@agentplat/core";
import type { JsonObject, JsonValue, TenantContext } from "@agentplat/core";
import type {
  CognitiveAgentAdapterContextV2,
  CognitiveOperationOutcomeV2,
  CognitiveOperationRequestV2,
  CognitiveSessionStateV2,
} from "@agentplat/runtime/cognitive-adapter";
import type {
  RoomExecutionCoordinator,
  RoomExecutionSession,
  RunIntervention,
  RunInterventionCheckpoint,
} from "./execution-session.js";

/** Session-bound intervention command presented to an execution adapter. */
export interface RunInterventionAdapterInput {
  session: RoomExecutionSession;
  intervention: RunIntervention;
  checkpoint: RunInterventionCheckpoint;
  idempotencyKey: string;
}

/** Provider-neutral boundary for applying one claimed intervention. */
export interface RunInterventionAdapter {
  apply(
    input: RunInterventionAdapterInput,
    options: { signal?: AbortSignal },
  ): Promise<{ status: "applied" | "rejected"; reason?: string }>;
}

/** Runtime operations required by the cognitive intervention adapter. */
export interface CognitiveInterventionRuntimePort {
  getSession(sessionId: string): Promise<CognitiveSessionStateV2 | null>;
  execute(
    request: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<CognitiveOperationOutcomeV2>;
}

/** Runtime binding and optional command mapping for cognitive interventions. */
export interface CognitiveRunInterventionAdapterOptions {
  runtime: CognitiveInterventionRuntimePort;
  digest(domain: string, value: JsonValue): Promise<string>;
  authorityDigest(input: RunInterventionAdapterInput): Promise<string>;
  roleBindingDigest(input: RunInterventionAdapterInput): Promise<string>;
  tenant?(input: RunInterventionAdapterInput): TenantContext;
  clock?: () => number;
}

/** Applies Room interventions through the cognitive adapter intervention operation. */
export class CognitiveRunInterventionAdapter implements RunInterventionAdapter {
  private readonly clock: () => number;

  constructor(
    private readonly options: CognitiveRunInterventionAdapterOptions,
  ) {
    this.clock = options.clock ?? (() => Date.now());
  }

  async apply(
    input: RunInterventionAdapterInput,
    options: { signal?: AbortSignal },
  ): Promise<{ status: "applied" | "rejected"; reason?: string }> {
    const cognitive = await this.options.runtime.getSession(
      input.session.sessionId,
    );
    if (!cognitive) {
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Cognitive execution session is unavailable",
      );
    }
    if (
      cognitive.tenantId !== input.session.tenantId ||
      cognitive.agentId !== input.session.participantId
    ) {
      throw new AgentPlatError(
        "CONFLICT",
        "Cognitive execution session binding does not match the Agent Room",
      );
    }
    const payload: JsonObject = {
      roomId: input.session.roomId,
      runId: input.session.runId,
      checkpoint: input.checkpoint,
      instruction: input.intervention.instruction,
    };
    const metadata: JsonObject = {
      roomId: input.session.roomId,
      runId: input.session.runId,
      checkpoint: input.checkpoint,
      deliveryIdempotencyKey: input.idempotencyKey,
    };
    const request: CognitiveOperationRequestV2 = {
      schemaVersion: 2,
      operationId: input.intervention.operationId,
      operation: "intervention",
      tenantId: input.session.tenantId,
      sessionId: input.session.sessionId,
      agentId: input.session.participantId,
      expectedRevision: cognitive.revision,
      logicalTimeMs: Math.max(
        this.clock(),
        cognitive.logicalTimeHighWaterMs + 1,
      ),
      payload,
      payloadDigest: await this.options.digest(
        "agentplat-room-intervention-payload-v1",
        payload,
      ),
      metadataDigest: await this.options.digest(
        "agentplat-room-intervention-metadata-v1",
        metadata,
      ),
      authorityDigest: await this.options.authorityDigest(input),
      roleBindingDigest: await this.options.roleBindingDigest(input),
      metadata,
    };
    const signal = options.signal ?? new AbortController().signal;
    const outcome = await this.options.runtime.execute(request, {
      tenant: this.options.tenant?.(input) ?? {
        tenantId: input.session.tenantId,
      },
      signal,
    });
    return outcome.result.status === "completed"
      ? { status: "applied", reason: outcome.result.reasonCode }
      : {
          status: "rejected",
          reason: outcome.result.reasonCode,
        };
  }
}

/** Lease, checkpoint and revision fences for intervention dispatch. */
export interface DispatchRunInterventionInput {
  tenantId: string;
  roomId: string;
  sessionId: string;
  expectedRevision: number;
  checkpoint: RunInterventionCheckpoint;
  dispatchToken: string;
  leaseMs?: number;
  signal?: AbortSignal;
}

/**
 * Claims and applies at most one pending intervention at a supported runtime
 * checkpoint. A failed adapter call leaves the lease for durable retry.
 */
/** Claims, applies and durably resolves interventions with stable idempotency. */
export class RunInterventionDispatcher {
  constructor(
    private readonly coordinator: RoomExecutionCoordinator,
    private readonly adapter: RunInterventionAdapter,
  ) {}

  async dispatchNext(
    input: DispatchRunInterventionInput,
  ): Promise<RoomExecutionSession | null> {
    if (input.signal?.aborted) {
      throw new AgentPlatError("CONFLICT", "Run intervention dispatch aborted");
    }
    const claimed = await this.coordinator.claimIntervention(input);
    if (!claimed) return null;
    const outcome = await this.adapter.apply(
      {
        session: claimed.session,
        intervention: claimed.intervention,
        checkpoint: input.checkpoint,
        idempotencyKey: interventionIdempotencyKey(
          claimed.session,
          claimed.intervention,
        ),
      },
      { signal: input.signal },
    );
    return this.coordinator.resolveIntervention({
      tenantId: input.tenantId,
      roomId: input.roomId,
      sessionId: input.sessionId,
      expectedRevision: claimed.session.revision,
      operationId: claimed.intervention.operationId,
      resolution: outcome.status,
      reason: outcome.reason,
      dispatchToken: input.dispatchToken,
    });
  }
}

/** Derives the stable cross-retry identity of an intervention effect. */
export function interventionIdempotencyKey(
  session: Pick<
    RoomExecutionSession,
    "tenantId" | "roomId" | "sessionId" | "runId"
  >,
  intervention: Pick<RunIntervention, "operationId">,
): string {
  return [
    "agentplat",
    "room-intervention",
    session.tenantId,
    session.roomId,
    session.sessionId,
    session.runId,
    intervention.operationId,
  ]
    .map(encodeURIComponent)
    .join(":");
}
