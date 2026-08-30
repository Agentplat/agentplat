import {
  PostgresMorphogenesisExecutionStoreV1,
  PostgresMorphologyHeadStoreV1,
  PostgresMorphogenesisOperatorExecutionStoreV2,
  PostgresMorphogenesisOperatorOutcomeStoreV2,
  type MorphogenesisPostgresRollbackWitnessV1,
  type MorphogenesisPostgresStoreOptionsV1,
} from "@agentplat/collective-host-postgres";

void PostgresMorphogenesisExecutionStoreV1;
void PostgresMorphologyHeadStoreV1;
void PostgresMorphogenesisOperatorExecutionStoreV2;
void PostgresMorphogenesisOperatorOutcomeStoreV2;
declare const witness: MorphogenesisPostgresRollbackWitnessV1;
declare const options: MorphogenesisPostgresStoreOptionsV1;
void witness;
void options;
