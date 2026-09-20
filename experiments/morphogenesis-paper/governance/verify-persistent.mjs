import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkDigest} from './verify.mjs';
export function verifyPersistent(race,drain){
 const winner=race.after.head,loser=race.cleanup.execution,success=drain.terminal;
 checkDigest(winner,'headDigest','morphology-head');
 assert.equal(winner.morphologyEpoch,race.before.head.morphologyEpoch+1);
 assert.equal(winner.predecessorHeadDigest,race.before.head.headDigest);
 assert.equal(loser.phase,'superseded');assert.equal(loser.activation,null);assert.equal(loser.receipt,null);
 checkDigest(loser.supersession,'supersessionDigest','morphogenesis-supersession-binding');
 checkDigest(loser.supersessionReceipt,'receiptDigest','morphogenesis-supersession-receipt');
 assert.deepEqual(loser.supersession.winningHead,winner);
 assert.notEqual(loser.proposalDigest,winner.acceptedProposalDigest);
 assert.equal(loser.supersessionReceipt.winningHeadDigest,winner.headDigest);
 assert.equal(loser.supersessionReceipt.supersessionDigest,loser.supersession.supersessionDigest);
 assert.equal(success.phase,'completed');assert.equal(success.proposalDigest,winner.acceptedProposalDigest);
 assert.equal(race.cleanup.team.team.status,'cancelled');
 assert.equal(race.cleanup.work.workContracts.find(w=>w.workContractId===`work-contract:${race.loser}`).status,'revoked');
 for(const r of [loser,success]){
  checkDigest(r,'recordDigest','morphogenesis-execution-record');
  checkDigest(r.continuity,'continuityReceiptDigest','morphogenesis-continuity-receipt');
  checkDigest(r.fence,'fenceReceiptDigest','morphogenesis-authority-fence-receipt');
  checkDigest(r.terminalAgent,'terminalReceiptDigest','morphogenesis-terminal-agent-receipt');
  const final=r.supersessionReceipt??r.receipt;
  assert.equal(final.proposalDigest,r.proposalDigest);assert.equal(final.decisionDigest,r.decisionDigest);
  assert.equal(final.continuityReceiptDigest,r.continuity.continuityReceiptDigest);
  assert.equal(final.fenceReceiptDigest,r.fence.fenceReceiptDigest);
  assert.equal(final.terminalAgentReceiptDigest,r.terminalAgent.terminalReceiptDigest);
  assert.equal(final.budgetReleaseDigest,r.budgetReleaseDigest);
  assert(r.continuity.completedAtLogicalMs<=r.fence.fencedAtLogicalMs);
  assert(r.fence.fencedAtLogicalMs<=r.terminalAgent.terminatedAtLogicalMs);
  let prior=null;
  for(const event of r.events){checkDigest(event,'eventDigest','morphogenesis-execution-event');assert.equal(event.previousEventDigest,prior);prior=event.eventDigest;}
 }
 assert.equal(drain.pending.phase,'draining');assert.equal(drain.pending.terminalAgent,null);
 assert.equal(drain.pending.pendingOperation.operationId,success.terminalAgent.operationId);
 return {status:'passed',terminalReceiptChains:2,scope:'exported structural lineage and owner postconditions; issuer trust is fixture configuration'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const dir=process.argv[2],load=f=>JSON.parse(readFileSync(path.join(dir,f)));
 const result=verifyPersistent(load('race.json'),load('drain.json'));
 writeFileSync(path.join(dir,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
