import {
  InMemoryTeamExecutionExchangeStoreV1,
  TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
  TEAM_EXECUTION_EXCHANGE_SCHEMA_VERSION_V1,
  TEAM_EXECUTION_EXCHANGE_STATE_FORMAT_V1,
  TeamExecutionExchangeRuntimeV1,
  attachTeamExecutionExchangeMeshExtensionV1,
  createTeamExecutionCoordinatorExchangeHandlerV1,
  createTeamExecutionExchangeMeshExtensionV1,
  createTeamExecutionExchangeMessageV1,
  createTeamExecutionExchangeOutboundPortV1,
  createTeamExecutionExchangePolicyV1,
  createTeamExecutionExchangeRouterV1,
  createTeamExecutionExchangeStateV1,
  createTeamExecutionMemberExchangeHandlerV1,
  extractTeamExecutionExchangeMessageV1,
  validateTeamExecutionExchangeIdentityV1,
  validateTeamExecutionExchangeMessageV1,
  validateTeamExecutionExchangePayloadV1,
  validateTeamExecutionExchangePolicyV1,
  validateTeamExecutionExchangeRecipientV1,
  validateTeamExecutionExchangeStateV1,
  type TeamExecutionCoordinatorExchangeHandlerOptionsV1,
  type TeamExecutionExchangeAdmissionOutcomeV1,
  type TeamExecutionExchangeBatchOutcomeV1,
  type TeamExecutionExchangeHandlerV1,
  type TeamExecutionExchangeIdentityV1,
  type TeamExecutionExchangeInboxRecordV1,
  type TeamExecutionExchangeInboxStatusV1,
  type TeamExecutionExchangeLimitsV1,
  type TeamExecutionExchangeMembershipDecisionV1,
  type TeamExecutionExchangeMembershipPortV1,
  type TeamExecutionExchangeMessageDraftV1,
  type TeamExecutionExchangeMessageKindV1,
  type TeamExecutionExchangeMessageV1,
  type TeamExecutionExchangeOutboundPortV1,
  type TeamExecutionExchangeOutboxRecordV1,
  type TeamExecutionExchangeOutboxStatusV1,
  type TeamExecutionExchangePayloadV1,
  type TeamExecutionExchangePendingRecordV1,
  type TeamExecutionExchangePolicyRecordV1,
  type TeamExecutionExchangePolicyV1,
  type TeamExecutionExchangeRecipientV1,
  type TeamExecutionExchangeRecoveryPortV1,
  type TeamExecutionExchangeRouterOptionsV1,
  type TeamExecutionExchangeRuntimeOptionsV1,
  type TeamExecutionExchangeRuntimePortV1,
  type TeamExecutionExchangeSourceHeadV1,
  type TeamExecutionExchangeStateV1,
  type TeamExecutionExchangeStoreV1,
  type TeamExecutionMemberExchangeHandlerOptionsV1,
} from "@agentplat/collective-runtime/team-execution-exchange";

void InMemoryTeamExecutionExchangeStoreV1;
void TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1;
void TEAM_EXECUTION_EXCHANGE_SCHEMA_VERSION_V1;
void TEAM_EXECUTION_EXCHANGE_STATE_FORMAT_V1;
void TeamExecutionExchangeRuntimeV1;
void attachTeamExecutionExchangeMeshExtensionV1;
void createTeamExecutionCoordinatorExchangeHandlerV1;
void createTeamExecutionExchangeMeshExtensionV1;
void createTeamExecutionExchangeMessageV1;
void createTeamExecutionExchangeOutboundPortV1;
void createTeamExecutionExchangePolicyV1;
void createTeamExecutionExchangeRouterV1;
void createTeamExecutionExchangeStateV1;
void createTeamExecutionMemberExchangeHandlerV1;
void extractTeamExecutionExchangeMessageV1;
void validateTeamExecutionExchangeIdentityV1;
void validateTeamExecutionExchangeMessageV1;
void validateTeamExecutionExchangePayloadV1;
void validateTeamExecutionExchangePolicyV1;
void validateTeamExecutionExchangeRecipientV1;
void validateTeamExecutionExchangeStateV1;

declare const runtime: TeamExecutionExchangeRuntimePortV1;
declare const draft: TeamExecutionExchangeMessageDraftV1;

const enqueued: Promise<TeamExecutionExchangeMessageV1> =
  runtime.enqueue(draft);
const processed: Promise<TeamExecutionExchangeBatchOutcomeV1> =
  runtime.processInbox();
const flushed: Promise<TeamExecutionExchangeBatchOutcomeV1> =
  runtime.flushOutbox();
const state: Promise<TeamExecutionExchangeStateV1> = runtime.loadState();
void enqueued;
void processed;
void flushed;
void state;

type PublicTypes =
  | TeamExecutionCoordinatorExchangeHandlerOptionsV1
  | TeamExecutionExchangeAdmissionOutcomeV1
  | TeamExecutionExchangeHandlerV1
  | TeamExecutionExchangeIdentityV1
  | TeamExecutionExchangeInboxRecordV1
  | TeamExecutionExchangeInboxStatusV1
  | TeamExecutionExchangeLimitsV1
  | TeamExecutionExchangeMembershipDecisionV1
  | TeamExecutionExchangeMembershipPortV1
  | TeamExecutionExchangeMessageKindV1
  | TeamExecutionExchangeOutboundPortV1
  | TeamExecutionExchangeOutboxRecordV1
  | TeamExecutionExchangeOutboxStatusV1
  | TeamExecutionExchangePayloadV1
  | TeamExecutionExchangePendingRecordV1
  | TeamExecutionExchangePolicyRecordV1
  | TeamExecutionExchangePolicyV1
  | TeamExecutionExchangeRecipientV1
  | TeamExecutionExchangeRecoveryPortV1
  | TeamExecutionExchangeRouterOptionsV1
  | TeamExecutionExchangeRuntimeOptionsV1
  | TeamExecutionExchangeSourceHeadV1
  | TeamExecutionExchangeStoreV1
  | TeamExecutionMemberExchangeHandlerOptionsV1;

declare const publicType: PublicTypes;
void publicType;
