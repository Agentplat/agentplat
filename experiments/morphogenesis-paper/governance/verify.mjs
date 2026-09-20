// Deliberately imports neither runtime validators nor experimental predicates.
import assert from 'node:assert/strict';
import {verify as checkSignature,createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
export function checkDigest(record,field,domain){
 assert(record&&typeof record==='object','missing record');
 const {[field]:actual,...body}=record;
 const expected='sha256:'+createHash('sha256').update(`agentplat.collective-planning/${domain}/v1\0${canonical(body)}`).digest('hex');
 assert.equal(actual,expected,`invalid ${domain}`);
}
export function verifyCase(c,trustedPublicKey){
 assert(trustedPublicKey,'a separately retained issuer trust anchor is required');
 assert.equal(c.trustedPublicKey,trustedPublicKey);
 checkDigest(c.proposal,'proposalDigest','morphogenesis-proposal');
 let reconstructed=0;
 for(const admission of c.admissions){
  const a=JSON.parse(admission.payload),r=admission.request;
  const valid=checkSignature(null,Buffer.from(admission.payload),trustedPublicKey,Buffer.from(admission.signature,'base64'))&&
   a.issuer==='authority:reference'&&r.subject===a.subject&&r.proposalDigest===a.proposalDigest&&r.scopeDigest===a.scopeDigest&&
   admission.at>=a.validFrom&&admission.at<a.decisionUntil&&admission.at<a.mandateUntil&&admission.ownerAllows;
  assert.equal(admission.allowed,valid,'admission validity disagreement');
 }
 assert.equal(c.chains.length,c.roles.length,'missing exported chain');
 for(const role of c.roles){
  const chain=c.chains.find(x=>x.operationId===role.operationId);assert(chain,'missing effect chain');
  const a=c.admissions[chain.admissionIndex];assert(a?.allowed,'effect has no valid admission');
  assert.equal(a.request.operationId,role.operationId);
  assert.equal(a.request.proposalDigest,c.proposal.proposalDigest);
  assert.equal(a.request.scopeDigest,c.proposal.scopeDigest);
  assert.deepEqual(chain.role,role);assert.deepEqual(chain.proposal,c.proposal);reconstructed++;
 }
 // A distinct transition metric requires actual controller lineage, not just a hash.
 let transitionChains=null;
 if(c.condition==='morphogenesis'&&c.roles.length){
  const records=c.controller.executions;assert(records?.length);
  checkDigest(c.controller.decision,'decisionDigest','morphogenesis-decision-binding');
  assert.equal(c.controller.decision.candidate.proposalDigest,c.proposal.proposalDigest);
  for(const r of records){
   checkDigest(r,'recordDigest','morphogenesis-execution-record');
   assert.equal(r.decisionDigest,c.controller.decision.decisionDigest);
   let previous=null;
   for(const e of r.events){checkDigest(e,'eventDigest','morphogenesis-execution-event');assert.equal(e.previousEventDigest,previous);previous=e.eventDigest;}
  }
  for(const chain of c.chains){assert(records.some(r=>r.team?.operationId===chain.operationId),'effect absent from runtime lineage');}
  const last=records.at(-1);assert.equal(last.phase,'completed');assert(last.receipt&&last.activation);
  checkDigest(last.team,'receiptDigest','morphogenesis-successor-team-receipt');
  checkDigest(last.continuity,'continuityReceiptDigest','morphogenesis-continuity-receipt');
  checkDigest(last.fence,'fenceReceiptDigest','morphogenesis-authority-fence-receipt');
  checkDigest(last.terminalAgent,'terminalReceiptDigest','morphogenesis-terminal-agent-receipt');
  checkDigest(last.receipt,'receiptDigest','morphogenesis-receipt');
  assert.equal(last.receipt.proposalDigest,c.proposal.proposalDigest);
  assert.equal(last.receipt.decisionDigest,last.decisionDigest);
  assert.equal(last.receipt.continuityReceiptDigest,last.continuity.continuityReceiptDigest);
  assert.equal(last.receipt.fenceReceiptDigest,last.fence.fenceReceiptDigest);
  assert.equal(last.receipt.terminalAgentReceiptDigest,last.terminalAgent.terminalReceiptDigest);
  assert(last.terminalAgent.terminatedAtLogicalMs>=last.fence.fencedAtLogicalMs);
  transitionChains=c.chains.length;
 }
 if(c.condition==='durable'&&c.roles.length){
  const runs=c.controller.workflowStates;
  for(const action of ['activate','retire'])assert(runs.some(r=>r.status==='completed'&&r.input.caseId===c.id&&r.input.action===action&&r.runId===`${c.id}:${action}`&&r.stageStates.every(s=>s.outcome==='succeeded')),'workflow transition missing');
  assert(c.chains.every(x=>x.operationId===`${c.id}:durable-activate`),'workflow identity mismatch');
  assert(c.roles.every(r=>r.fenced&&!r.active),'workflow cleanup incomplete');
  transitionChains=c.chains.length;
 }
 return {condition:c.condition,cell:c.cell,attempts:c.admissions.length,effects:c.roles.length,unauthorizedEffects:0,admissionChains:reconstructed,transitionChains,denied:c.denied};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const dir=process.argv[2],registration=JSON.parse(readFileSync(path.join(dir,'registration.json')));
 const rows=readdirSync(path.join(dir,'cases')).sort().map(f=>verifyCase(JSON.parse(readFileSync(path.join(dir,'cases',f))),registration.trustedPublicKey));
 assert.deepEqual(rows.map(r=>r.cell+'-'+r.condition).sort(),registration.cells.flatMap(cell=>registration.conditions.map(condition=>cell+'-'+condition)).sort());
 const result={verification:'passed',cases:rows.length,rows};
 writeFileSync(path.join(dir,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({verification:'passed',cases:rows.length}));
}
