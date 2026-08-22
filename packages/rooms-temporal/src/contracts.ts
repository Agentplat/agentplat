/** Durable identifiers and fence supplied to one Temporal activity cycle. */
export interface TemporalCoordinationCycleInput {
  tenantId: string;
  roomId: string;
  coordinationId: string;
  expectedRevision: number;
  leaseToken: string;
}

/** Persisted coordination position returned to the Temporal workflow. */
export interface TemporalCoordinationCycleResult {
  revision: number;
  status: string;
  hasPending: boolean;
}

/** Activities implemented by the canonical Agent Room coordination runtime. */
export interface TemporalAgentRoomActivities {
  runCoordinationCycle(
    input: TemporalCoordinationCycleInput,
  ): Promise<TemporalCoordinationCycleResult>;
}
