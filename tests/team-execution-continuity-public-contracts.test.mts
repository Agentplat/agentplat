import * as TeamExecutionContinuity from "@agentplat/collective-runtime/team-execution-continuity";
import {
  InMemoryTeamExecutionContinuityAuthorityPortV1,
  InMemoryTeamExecutionContinuityAvailabilityPortV1,
  InMemoryTeamExecutionContinuityCheckpointRepositoryV1,
  InMemoryTeamExecutionContinuityMembershipPortV1,
  InMemoryTeamExecutionContinuityStoreV1,
  TEAM_EXECUTION_CONTINUITY_SCHEMA_VERSION_V1,
  TEAM_EXECUTION_CONTINUITY_STATE_FORMAT_V1,
  TeamExecutionContinuityRuntimeV1,
  createTeamExecutionContinuityAvailabilityCertificateV1,
  createTeamExecutionContinuityCheckpointV1,
  createTeamExecutionContinuityStateV1,
  createTeamExecutionWorkOwnerAuthorityV1,
  validateTeamExecutionContinuityAvailabilityCertificateV1,
  validateTeamExecutionContinuityCheckpointV1,
  validateTeamExecutionContinuityStateV1,
  validateTeamExecutionWorkOwnerAuthorityV1,
  type TeamExecutionContinuityAuthorityPortV1,
  type TeamExecutionContinuityAvailabilityPortV1,
  type TeamExecutionContinuityCheckpointRepositoryV1,
  type TeamExecutionContinuityCheckpointRequestV1,
  type TeamExecutionContinuityCheckpointV1,
  type TeamExecutionContinuityFencedExecutionPortV1,
  type TeamExecutionContinuityMembershipPortV1,
  type TeamExecutionContinuityPortV1,
  type TeamExecutionContinuityRuntimeOptionsV1,
  type TeamExecutionContinuityStateV1,
  type TeamExecutionContinuityStoreV1,
  type TeamExecutionContinuityTakeoverResultV1,
  type TeamExecutionContinuityTakeoverRequestV1,
  type TeamExecutionWorkOwnerAuthorityV1,
} from "@agentplat/collective-runtime/team-execution-continuity";

void InMemoryTeamExecutionContinuityAuthorityPortV1;
void InMemoryTeamExecutionContinuityAvailabilityPortV1;
void InMemoryTeamExecutionContinuityCheckpointRepositoryV1;
void InMemoryTeamExecutionContinuityMembershipPortV1;
void InMemoryTeamExecutionContinuityStoreV1;
void TEAM_EXECUTION_CONTINUITY_SCHEMA_VERSION_V1;
void TEAM_EXECUTION_CONTINUITY_STATE_FORMAT_V1;
void TeamExecutionContinuityRuntimeV1;
void createTeamExecutionContinuityAvailabilityCertificateV1;
void createTeamExecutionContinuityCheckpointV1;
void createTeamExecutionContinuityStateV1;
void createTeamExecutionWorkOwnerAuthorityV1;
void validateTeamExecutionContinuityAvailabilityCertificateV1;
void validateTeamExecutionContinuityCheckpointV1;
void validateTeamExecutionContinuityStateV1;
void validateTeamExecutionWorkOwnerAuthorityV1;
// @ts-expect-error An arbitrary-port in-memory fence cannot be a production API.
void TeamExecutionContinuity.InMemoryTeamExecutionContinuityFencedExecutionPortV1;

const checkpointRequest = {
  checkpointId: "checkpoint.public-contract",
  targetStateKey: "execution.target",
  logicalTimeMs: 1,
} satisfies TeamExecutionContinuityCheckpointRequestV1;
void checkpointRequest;

type PublicTypes =
  | TeamExecutionContinuityAuthorityPortV1
  | TeamExecutionContinuityAvailabilityPortV1
  | TeamExecutionContinuityCheckpointRepositoryV1
  | TeamExecutionContinuityCheckpointRequestV1
  | TeamExecutionContinuityCheckpointV1
  | TeamExecutionContinuityFencedExecutionPortV1
  | TeamExecutionContinuityMembershipPortV1
  | TeamExecutionContinuityPortV1
  | TeamExecutionContinuityRuntimeOptionsV1
  | TeamExecutionContinuityStateV1
  | TeamExecutionContinuityStoreV1
  | TeamExecutionContinuityTakeoverResultV1
  | TeamExecutionContinuityTakeoverRequestV1
  | TeamExecutionWorkOwnerAuthorityV1;

declare const publicType: PublicTypes;
void publicType;
