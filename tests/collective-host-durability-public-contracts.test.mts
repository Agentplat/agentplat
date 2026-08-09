import {
  createAssuranceExecutionAuthorityFenceV1,
  type AssuranceCoupledExecutionStoreV1,
  type AssuranceEffectCommitCheckpointV1,
  type AssuranceExecutionAuthorityFenceV1,
  type AssuranceExecutionAuthorityPortV1,
} from "@agentplat/collective-host/assurance-coupled-execution";
import {
  createAutonomousCollectiveCognitiveContextBindingV1,
  type AutonomousCollectiveAdvanceReservationV1,
  type AutonomousCollectiveAwardOperationV1,
  type AutonomousCollectiveNodeStoreV1,
  type AutonomousCollectiveTaskContextRehydratorPortV1,
} from "@agentplat/collective-host/autonomous-node";
import {
  declareRestartDurableSparseBftFinalityGatewayV1,
  isRestartDurableSparseBftFinalityGatewayV1,
  type RestartDurableSparseBftFinalityGatewayV1,
  type SparseBftFinalityGatewayV1,
} from "@agentplat/collective-host/reference-integrated-stack";
import {
  getMigrationStatus,
  PostgresAssuranceCoupledExecutionStoreV1,
  PostgresAutonomousCollectiveNodeStoreV1,
  rollbackConfirmation,
  runMigrations,
} from "@agentplat/collective-host-postgres";
import type { PostgresMigrationStatus } from "@agentplat/postgres";

declare const cognitiveTenant: Parameters<
  typeof createAutonomousCollectiveCognitiveContextBindingV1
>[0];
declare const nodeStore: AutonomousCollectiveNodeStoreV1;
declare const advanceReservation: AutonomousCollectiveAdvanceReservationV1;
declare const awardOperation: AutonomousCollectiveAwardOperationV1;
declare const taskContextRehydrator: AutonomousCollectiveTaskContextRehydratorPortV1;
declare const assuranceStore: AssuranceCoupledExecutionStoreV1;
declare const assuranceCheckpoint: AssuranceEffectCommitCheckpointV1;
declare const assuranceAuthority: AssuranceExecutionAuthorityPortV1;
declare const authorityFenceInput: Parameters<
  typeof createAssuranceExecutionAuthorityFenceV1
>[0];
declare const finalityGateway: SparseBftFinalityGatewayV1;
declare const pool: Parameters<typeof runMigrations>[0];
declare const postgresScope: ConstructorParameters<
  typeof PostgresAutonomousCollectiveNodeStoreV1
>[1];
declare const postgresAssuranceArgs: ConstructorParameters<
  typeof PostgresAssuranceCoupledExecutionStoreV1
>;

const contextBinding =
  createAutonomousCollectiveCognitiveContextBindingV1(cognitiveTenant);
const reserveAdvance: AutonomousCollectiveNodeStoreV1["reserveAdvance"] =
  nodeStore.reserveAdvance.bind(nodeStore);
const runAdvanceCommand: AutonomousCollectiveNodeStoreV1["runAdvanceCommand"] =
  nodeStore.runAdvanceCommand.bind(nodeStore);
const loadAdvanceCommandBinding: AutonomousCollectiveNodeStoreV1["loadAdvanceCommandBinding"] =
  nodeStore.loadAdvanceCommandBinding.bind(nodeStore);
const checkpointEffect: AssuranceCoupledExecutionStoreV1["checkpointEffect"] =
  assuranceStore.checkpointEffect.bind(assuranceStore);
const reconcileAuthority: AssuranceExecutionAuthorityPortV1["reconcile"] =
  assuranceAuthority.reconcile.bind(assuranceAuthority);
const authorityFence: Promise<AssuranceExecutionAuthorityFenceV1> =
  createAssuranceExecutionAuthorityFenceV1(authorityFenceInput);
const restartDurableFinality: RestartDurableSparseBftFinalityGatewayV1 =
  declareRestartDurableSparseBftFinalityGatewayV1(finalityGateway);
const isRestartDurable: boolean =
  isRestartDurableSparseBftFinalityGatewayV1(restartDurableFinality);
const postgresNodeStore: AutonomousCollectiveNodeStoreV1 =
  new PostgresAutonomousCollectiveNodeStoreV1(pool, postgresScope);
const postgresAssuranceStore: AssuranceCoupledExecutionStoreV1 =
  new PostgresAssuranceCoupledExecutionStoreV1(...postgresAssuranceArgs);
const migrationStatus: Promise<PostgresMigrationStatus> = runMigrations(pool);
const currentMigrationStatus: Promise<PostgresMigrationStatus> =
  getMigrationStatus(pool);
const rollbackToken: string = rollbackConfirmation();

void contextBinding;
void reserveAdvance;
void runAdvanceCommand;
void loadAdvanceCommandBinding;
void advanceReservation;
void awardOperation;
void taskContextRehydrator;
void checkpointEffect;
void assuranceCheckpoint;
void reconcileAuthority;
void authorityFence;
void restartDurableFinality;
void isRestartDurable;
void postgresNodeStore;
void postgresAssuranceStore;
void migrationStatus;
void currentMigrationStatus;
void rollbackToken;
