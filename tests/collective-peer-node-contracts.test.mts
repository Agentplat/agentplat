import {
  CollectivePeerNodeRuntimeV1,
  createCollectivePeerNodeStoredStateV1,
  COLLECTIVE_PEER_RECOVERY_ELECTION_EXTENSION_V1,
  type CollectivePeerNodeExecuteInputV1,
  type CollectivePeerNodeRecoveryElectionDecisionV1,
  type CollectivePeerNodeRecoveryElectionPortV1,
  type CollectivePeerNodeRuntimeConfigV1,
  type CollectivePeerNodeRunOutcomeV1,
} from "@agentplat/collective-runtime/node";

declare const config: CollectivePeerNodeRuntimeConfigV1;
declare const executeInput: CollectivePeerNodeExecuteInputV1;
declare const recoveryElection: CollectivePeerNodeRecoveryElectionPortV1;
declare const recoveryDecision: CollectivePeerNodeRecoveryElectionDecisionV1;

const node = new CollectivePeerNodeRuntimeV1(config);
const state = createCollectivePeerNodeStoredStateV1({
  scope: config.scope,
  runtime: config.initialState,
});
const cycle: Promise<CollectivePeerNodeRunOutcomeV1> = node.runOnce();

void node.execute(executeInput);
void state;
void cycle;
void recoveryElection;
void recoveryDecision;
void COLLECTIVE_PEER_RECOVERY_ELECTION_EXTENSION_V1;
